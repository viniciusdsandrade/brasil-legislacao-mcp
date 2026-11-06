import { ErroLeis } from './erros.js';
import { ehEsfera, type Esfera, type InfoCaminho } from './tipos.js';

export const CAMINHO_CONSTITUICAO = 'constituicao.md';

/** Barra invertida, NUL e caracteres de controle nunca entram num segmento. */
const PROIBIDO_NO_SEGMENTO = /[\\\u0000-\u001f\u007f]/u;
const MAX_SEGMENTO = 255;
const UF = /^[A-Z]{2}$/;
/** Tribunais sem pasta própria no topo de jurisprudencia: ficam em jurisprudencia/outros-tribunais/<tribunal>. */
const PASTA_OUTROS_TRIBUNAIS = 'outros-tribunais';
const TRIBUNAIS_EM_OUTROS: ReadonlySet<string> = new Set(['stm', 'tcu']);
const ANO = /^\d{4}$/;
const MAX_CAMINHO = 400;

/**
 * Segmento de caminho do acervo. O acervo tem nomes com espaço, aspas e "°"
 * (por exemplo "port-N° 322-2020-09-16.md"), então a regra só recusa o que é perigoso:
 * segmento vazio, oculto ou começado por "_" ou espaço, barra invertida, NUL e controle.
 * "." e ".." começam por ponto e ficam de fora.
 */
function segmentoValido(segmento: string): boolean {
  return (
    segmento !== '' &&
    segmento.length <= MAX_SEGMENTO &&
    !PROIBIDO_NO_SEGMENTO.test(segmento) &&
    !/^[._\s]/u.test(segmento)
  );
}

function ehPastaDeAno(segmento: string): boolean {
  return ANO.test(segmento) || segmento === 'sem-ano';
}

/**
 * Lê esfera, UF, município, órgão, tribunal, pasta e ano do caminho de uma norma.
 * Devolve null para o que não é norma: pastas que começam com "_", arquivos fora das esferas.
 */
export function analisarCaminho(caminho: string): InfoCaminho | null {
  if (caminho === CAMINHO_CONSTITUICAO) {
    return {
      caminho,
      esfera: 'constituicao',
      uf: null,
      municipio: null,
      orgao: null,
      tribunal: null,
      pasta: null,
      anoPasta: null,
    };
  }
  const partes = caminho.split('/');
  const esfera = partes[0];
  const arquivo = partes[partes.length - 1];
  if (partes.length < 3 || esfera === undefined || arquivo === undefined) return null;
  if (!ehEsfera(esfera) || esfera === 'constituicao') return null;
  if (!arquivo.endsWith('.md')) return null;
  if (partes.some((parte) => !segmentoValido(parte))) return null;

  const info: InfoCaminho = {
    caminho,
    esfera,
    uf: null,
    municipio: null,
    orgao: null,
    tribunal: null,
    pasta: null,
    anoPasta: null,
  };
  const meio = partes.slice(1, -1);
  let resto: string[];
  switch (esfera) {
    case 'estaduais': {
      const uf = meio[0];
      if (uf === undefined || !UF.test(uf)) return null;
      info.uf = uf;
      resto = meio.slice(1);
      break;
    }
    case 'municipais': {
      const uf = meio[0];
      const municipio = meio[1];
      if (uf === undefined || !UF.test(uf) || municipio === undefined) return null;
      info.uf = uf;
      info.municipio = municipio;
      resto = meio.slice(2);
      break;
    }
    case 'reguladores': {
      const orgao = meio[0];
      if (orgao === undefined) return null;
      info.orgao = orgao;
      resto = meio.slice(1);
      break;
    }
    case 'jurisprudencia': {
      if (meio[0] === PASTA_OUTROS_TRIBUNAIS && meio.length >= 2) {
        info.tribunal = meio[1] ?? null;
        resto = meio.slice(2);
      } else if (meio.length >= 2) {
        info.tribunal = meio[0] ?? null;
        resto = meio.slice(1);
      } else {
        resto = meio;
      }
      break;
    }
    default:
      resto = meio;
  }
  const ultimo = resto[resto.length - 1];
  if (ultimo !== undefined && ehPastaDeAno(ultimo)) {
    info.anoPasta = ANO.test(ultimo) ? Number(ultimo) : null;
    resto = resto.slice(0, -1);
  }
  info.pasta = resto[0] ?? null;
  return info;
}

/**
 * Valida o caminho relativo de uma norma: só ".md" de norma, sem "..", sem segmento
 * oculto ou começado por "_", sem barra invertida e sem caminho absoluto.
 */
export function validarCaminho(caminho: unknown): string | null {
  if (typeof caminho !== 'string') return null;
  const limpo = caminho.trim();
  if (limpo === '' || limpo.length > MAX_CAMINHO) return null;
  if (limpo.includes('\0') || limpo.includes('\\') || limpo.startsWith('/')) return null;
  if (!limpo.endsWith('.md')) return null;
  if (limpo.split('/').some((parte) => !segmentoValido(parte))) return null;
  return analisarCaminho(limpo) ? limpo : null;
}

/** Igual a validarCaminho, mas lança um erro com o próximo passo. */
export function exigirCaminho(caminho: unknown): string {
  const valido = validarCaminho(caminho);
  if (valido === null) {
    throw new ErroLeis(
      'caminho_invalido',
      `Caminho inválido: ${JSON.stringify(caminho)}.`,
      'Use o campo "caminho" de um item de leis_buscar, por exemplo "federal/leis-ordinarias/1990/lei-8078-1990-09-11.md".',
    );
  }
  return valido;
}

/** Valida o caminho de um arquivo _falhas.jsonl do acervo. */
export function validarCaminhoFalhas(caminho: string): boolean {
  if (caminho.length > MAX_CAMINHO || caminho.includes('\\') || caminho.startsWith('/')) return false;
  const partes = caminho.split('/');
  const arquivo = partes.pop();
  if (arquivo !== '_falhas.jsonl' || partes.length === 0) return false;
  const esfera = partes[0];
  if (esfera === undefined || !ehEsfera(esfera)) return false;
  return partes.every((parte) => segmentoValido(parte));
}

const ENTRADA_ESCOPO = /^(constituicao|federal|estaduais|municipais|reguladores|jurisprudencia|tratados)(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/**
 * Normaliza o escopo ("constituicao,federal,estaduais/SP"): valida cada entrada,
 * tira duplicatas e entradas que outra entrada já cobre, e ordena.
 */
export function normalizarEscopo(entradas: readonly string[]): string[] {
  const limpas = entradas.map((entrada) => entrada.trim().replace(/\/+$/, '')).filter((entrada) => entrada !== '');
  for (const entrada of limpas) {
    if (!ENTRADA_ESCOPO.test(entrada) || (entrada.startsWith('constituicao') && entrada !== 'constituicao')) {
      throw new ErroLeis(
        'entrada_invalida',
        `Entrada de escopo inválida: "${entrada}".`,
        'Use esferas e pastas do acervo separadas por vírgula, por exemplo "constituicao,federal,estaduais/SP".',
      );
    }
  }
  const unicas = [...new Set(limpas)].sort();
  return unicas.filter((entrada) => !unicas.some((outra) => outra !== entrada && entrada.startsWith(`${outra}/`)));
}

/** Pathspec git de uma entrada de escopo. */
export function pathspecDaEntrada(entrada: string): string {
  return entrada === 'constituicao' ? CAMINHO_CONSTITUICAO : entrada;
}

/**
 * Arquivos _falhas.jsonl das pastas acima de uma entrada do escopo, abaixo da raiz.
 * O modo cone do sparse-checkout traz os arquivos dessas pastas.
 */
export function falhasAncestrais(pathspec: string): string[] {
  const partes = pathspec.split('/');
  const saida: string[] = [];
  for (let fim = 1; fim < partes.length; fim += 1) saida.push(`${partes.slice(0, fim).join('/')}/_falhas.jsonl`);
  return saida;
}

/** Entradas do escopo que viram pastas do sparse-checkout. Os arquivos da raiz sempre entram. */
export function pastasDoCheckout(escopo: readonly string[]): string[] {
  return escopo.filter((entrada) => entrada !== 'constituicao');
}

/** Nome de pasta com as mesmas letras de um segmento de LEIS_ESCOPO (ENTRADA_ESCOPO). */
const SEGMENTO_DE_ESCOPO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function nomeDaPasta(pasta: string): string {
  return pasta.slice(pasta.lastIndexOf('/') + 1);
}

/** Pasta que nunca tem norma: o nome começa com "_", "." ou espaço, ou tem caractere proibido. */
function pastaSemNormas(pasta: string): boolean {
  return !segmentoValido(nomeDaPasta(pasta));
}

/**
 * Pastas do sparse-checkout em modo cone para uma entrada do escopo. `pastas` são as pastas
 * da entrada no commit, em qualquer nível, como lista o `git ls-tree -r -d`. Uma pasta que tem,
 * em algum nível, uma subpasta sem normas (como federal/_fonte, com mais de 1,6 GiB) dá lugar
 * às suas subpastas válidas. Assim o git não baixa nem grava no disco o que o índice ignora.
 * O modo cone continua trazendo os arquivos das pastas acima de cada pasta, como os _falhas.jsonl.
 * Todo nome devolvido tem as letras de uma entrada de LEIS_ESCOPO: os nomes vêm da árvore do
 * acervo, e o adaptador git só aceita essas letras.
 */
export function pastasDoCheckoutDaEntrada(entrada: string, pastas: readonly string[]): string[] {
  const filhas = new Map<string, string[]>();
  for (const pasta of pastas) {
    if (!pasta.startsWith(`${entrada}/`)) continue;
    const mae = pasta.slice(0, pasta.lastIndexOf('/'));
    const irmas = filhas.get(mae);
    if (irmas === undefined) filhas.set(mae, [pasta]);
    else irmas.push(pasta);
  }
  const suja = new Map<string, boolean>();
  const temPastaSemNormas = (pasta: string): boolean => {
    let valor = suja.get(pasta);
    if (valor === undefined) {
      valor = (filhas.get(pasta) ?? []).some((filha) => pastaSemNormas(filha) || temPastaSemNormas(filha));
      suja.set(pasta, valor);
    }
    return valor;
  };
  const expandir = (pasta: string): string[] => {
    if (!temPastaSemNormas(pasta)) return [pasta];
    const validas = (filhas.get(pasta) ?? []).filter((filha) => !pastaSemNormas(filha));
    // A pasta fica inteira em dois casos. Sem subpasta válida: o modo cone não traz só os
    // arquivos de uma pasta. Com subpasta de nome fora do padrão do escopo (espaço, acento):
    // o sync baixa a mais, mas não para.
    if (validas.length === 0 || validas.some((filha) => !SEGMENTO_DE_ESCOPO.test(nomeDaPasta(filha)))) return [pasta];
    return validas.flatMap(expandir);
  };
  return expandir(entrada);
}

/** Verdadeiro quando o caminho (arquivo ou pasta) fica dentro de alguma entrada do escopo. */
export function escopoCobre(escopo: readonly string[], caminho: string): boolean {
  return escopo.some((entrada) => {
    const base = pathspecDaEntrada(entrada);
    return caminho === base || caminho.startsWith(`${base}/`);
  });
}

/** Verdadeiro quando o recorte e o escopo têm algo em comum. */
export function escopoToca(escopo: readonly string[], recorte: string): boolean {
  if (recorte === '') return escopo.length > 0;
  return escopo.some((entrada) => {
    const base = pathspecDaEntrada(entrada);
    return base === recorte || base.startsWith(`${recorte}/`) || recorte.startsWith(`${base}/`);
  });
}

/** Partes de um recorte que ficam dentro do escopo, como pastas para busca textual. */
export function pastasDoRecorteNoEscopo(escopo: readonly string[], recorte: string): string[] {
  if (recorte === '') return escopo.map(pathspecDaEntrada);
  if (escopoCobre(escopo, recorte)) return [recorte];
  return escopo.map(pathspecDaEntrada).filter((base) => base.startsWith(`${recorte}/`));
}

export interface PartesRecorte {
  esfera?: Esfera | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  orgao?: string | undefined;
  tribunal?: string | undefined;
  pasta?: string | undefined;
}

/** Pasta do acervo que corresponde a um filtro. Texto vazio quer dizer o acervo inteiro. */
export function recorteDoFiltro(partes: PartesRecorte): string {
  let esfera = partes.esfera;
  if (esfera === undefined && partes.municipio !== undefined) esfera = 'municipais';
  if (esfera === undefined && partes.uf !== undefined) esfera = 'estaduais';
  if (esfera === undefined && partes.orgao !== undefined) esfera = 'reguladores';
  if (esfera === undefined && partes.tribunal !== undefined) esfera = 'jurisprudencia';
  if (esfera === undefined) return '';
  if (esfera === 'constituicao') return CAMINHO_CONSTITUICAO;
  const segmentos: string[] = [esfera];
  const acrescentar = (valor: string | undefined): boolean => {
    if (valor === undefined) return false;
    segmentos.push(valor);
    return true;
  };
  switch (esfera) {
    case 'estaduais':
      if (acrescentar(partes.uf)) acrescentar(partes.pasta);
      break;
    case 'municipais':
      if (acrescentar(partes.uf) && acrescentar(partes.municipio)) acrescentar(partes.pasta);
      break;
    case 'reguladores':
      if (acrescentar(partes.orgao)) acrescentar(partes.pasta);
      break;
    case 'jurisprudencia': {
      const emOutros = partes.tribunal !== undefined && TRIBUNAIS_EM_OUTROS.has(partes.tribunal);
      if (emOutros) segmentos.push(PASTA_OUTROS_TRIBUNAIS);
      // Os tribunais de outros-tribunais não têm pasta de tipo.
      if (acrescentar(partes.tribunal) && !emOutros) acrescentar(partes.pasta);
      break;
    }
    default:
      acrescentar(partes.pasta);
  }
  return segmentos.join('/');
}
