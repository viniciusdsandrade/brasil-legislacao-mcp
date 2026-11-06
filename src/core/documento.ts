import { limparMarkdown, normalizarChave, textoOuNulo, truncar } from './texto.js';
import type { Cabecalho } from './tipos.js';

export interface AnaliseDocumento {
  titulo: string | null;
  ocr: boolean;
  semTexto: boolean;
  temTachado: boolean;
  ementaDerivada: string | null;
}

/** Avisos que os conversores do acervo põem logo depois do título. */
export const AVISO_OCR = /^>\s*Texto obtido por OCR\b/;
export const AVISO_SEM_TEXTO = /^>\s*A fonte oficial não disponibiliza o texto/;
const TACHADO = /~~|<(?:del|s|strike)\b/i;
export const ROTULO_ARTIGO_SIMPLES = /^(?:Art(?:igo)?\s*\.?\s*(?:l(?=\d))?\d|Artigo\s+[úÚuU]nico)/;
const LINHAS_DE_AVISO = 12;
const MAX_EMENTA = 300;
/** Um texto menor que isto não serve de ementa: "PODER JUDICIÁRIO", "Súmula 1". */
const MIN_EMENTA = 20;
/** Linhas lidas à procura das seções de jurisprudência (Questão, Enunciado, Tese). */
const LINHAS_DE_SECOES = 200;
/** Um rótulo de seção é uma linha curta: "### questaoSubmetidaAJulgamento" tem 31 caracteres. */
const MAX_ROTULO = 48;
/** Parágrafos ou linhas lidos à procura da ementa quando o documento não tem seções. */
const MAX_CANDIDATAS = 8;

/**
 * O verbo casa pelo começo da palavra, de propósito: ementas nominais ("Autorização para...",
 * "Denominação de...") e textos de OCR ("ALTERAA REDAÇÃO") também valem. Esta regra é só para
 * o texto de leis: um registro de tribunal ("Cancelado", "da segunda-feira...") não passa por ela.
 */
const VERBO_EMENTA =
  /^(?:disp[õo]e|institui|autoriza|altera|cria|denomina|declara|concede|estabelece|regulamenta|fixa|aprova|revoga|acrescenta|abre|d[áa]\s|disciplina|define|torna|inclui|modifica|prorroga|ratifica|reconhece|homologa|nomeia|considera|dispensa|pro[íi]be|garante|assegura|determina|organiza|reorganiza|extingue|transforma|oficializa|consolida|promulga|convoca|suspende|delega|atualiza|reajusta|desafeta|afeta|permite|veda|obriga|implanta|implementa|ab[ou]le|confere|outorga|amplia|reduz|isenta|cancela)/i;
const VERBO_NO_MEIO =
  /[.;:]\s+((?:disp[õo]e|institui|autoriza|altera|cria|denomina|declara|concede|estabelece|regulamenta|fixa|aprova|revoga|acrescenta|abre|disciplina|define)\b[\s\S]*)$/i;
const EPIGRAFE =
  /^(?:LEI|DECRETO|RESOLU[ÇC][ÃA]O|PORTARIA|EMENDA|DELIBERA[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O|ATO|MEDIDA|S[ÚU]MULA|PROVIMENTO|CIRCULAR)\b/;
const PREAMBULO =
  /^(?:(?:o|a|os|as)\s+)?(?:prefeit|president|governador|c[âa]mara|mesa|vice|secret[áa]ri|diretor|procurador|ministr|conselho|assembl)|^fa[çc]o saber|^eu,/i;

/** Verdadeiro quando o cabeçalho marca o texto como OCR. */
export function ocrNoCabecalho(cabecalho: Cabecalho): boolean {
  const ocr = cabecalho['ocr'];
  if (ocr === true) return true;
  if (typeof ocr === 'string') {
    const valor = ocr.trim().toLowerCase();
    if (valor !== '' && !['false', 'nao', 'não', 'no', '0'].includes(valor)) return true;
  }
  return textoOuNulo(cabecalho['ocr_motor']) !== null;
}

/**
 * Seções em que os conversores de jurisprudência põem o enunciado, da preferida para a menos
 * preferida. A chave é o rótulo só com letras e números, sem acento e em minúsculas:
 * "## Questão" vira "questao" e "### ENUNCIADO" vira "enunciado".
 */
const SECOES_DE_EMENTA: readonly (readonly string[])[] = [
  ['ementa', 'textoementa'],
  ['enunciado'],
  ['questao', 'questaosubmetidaajulgamento'],
  ['tese', 'tesefirmada'],
];
const PRIORIDADE_DA_SECAO: ReadonlyMap<string, number> = new Map(
  SECOES_DE_EMENTA.flatMap((chaves, prioridade) => chaves.map((chave) => [chave, prioridade] as const)),
);
/**
 * Linha com o número da súmula: "SÚMULA 23" (STF), "Súmula 1" (STJ) ou
 * "SÚMULA Nº 10 - Cancelada (BJM Nº 14, de 06.04.2018)" (STM). O enunciado vem no parágrafo
 * dela ou no parágrafo seguinte. Vale menos que as seções com nome.
 */
const ROTULO_SUMULA = /^s[úu]mula(?:\s+vinculante)?\s+(?:n[º°o.]?\s*)?(\d+)[a-z]?(?:\s*[-–—(].*)?$/iu;
const PRIORIDADE_SUMULA = SECOES_DE_EMENTA.length;
/** Campo de ementa do registro JSON do CNJ, uma linha por campo (controle concentrado do STF). */
const CAMPO_JSON_DE_EMENTA = /^"(?:textoEmenta|ementa)"\s*:\s*("(?:[^"\\]|\\.)*"|null)\s*,?$/;
const VALOR_AUSENTE = /^(?:n[ãa]o informad[oa]|null|-+)\.?$/iu;

export interface OpcoesDeEmenta {
  /** Situação do cabeçalho ("APROVADO", "Cancelado"). Ela tem campo próprio e nunca vira ementa. */
  situacao?: string | null | undefined;
  /** Número do cabeçalho. A linha "SÚMULA 23" só é rótulo quando traz este número. */
  numero?: string | null | undefined;
  /** Registro de tribunal (súmula, tema, ação): o cabeçalho tem `tribunal`. Não é o texto de uma lei. */
  registro?: boolean | undefined;
}

interface Rotulo {
  prioridade: number;
  /**
   * O texto pode vir depois de uma linha vazia: títulos Markdown e a linha do número da súmula.
   * Um rótulo em linha comum ("Enunciado") tem o texto na linha seguinte.
   */
  aposLinhaVazia: boolean;
}

function valorUtil(texto: string): string | null {
  const limpo = limparMarkdown(texto);
  return limpo === '' || VALOR_AUSENTE.test(limpo) ? null : limpo;
}

/** Valor do campo de ementa numa linha do JSON: undefined quando a linha não é o campo, null quando ele está vazio. */
function campoJsonDeEmenta(linha: string): string | null | undefined {
  const campo = CAMPO_JSON_DE_EMENTA.exec(linha);
  if (campo?.[1] === undefined) return undefined;
  try {
    const valor: unknown = JSON.parse(campo[1]);
    return typeof valor === 'string' ? valorUtil(valor) : null;
  } catch {
    return null;
  }
}

type Cerca = 'json' | 'outra' | null;

/**
 * Estado das cercas de código. Só um bloco ```json guarda dados crus (o registro do CNJ).
 * Um bloco ```text guarda o texto da norma, como o texto pré-formatado de um PDF.
 */
function proximaCerca(linha: string, atual: Cerca): Cerca | undefined {
  if (!linha.startsWith('```')) return undefined;
  if (atual !== null) return null;
  return linha.slice(3).trim().toLowerCase() === 'json' ? 'json' : 'outra';
}

/** Verdadeiro quando o número do rótulo é o número da norma. Sem número no cabeçalho, qualquer número vale. */
function mesmoNumero(doRotulo: string, daNorma: string | null): boolean {
  const digitos = daNorma?.replace(/\D/g, '') ?? '';
  return digitos === '' || Number(doRotulo) === Number(digitos);
}

function rotuloDaLinha(linha: string, numero: string | null): Rotulo | null {
  const titulo = linha.startsWith('#');
  if (linha.length <= MAX_ROTULO) {
    const prioridade = PRIORIDADE_DA_SECAO.get(normalizarChave(linha).replace(/ /g, ''));
    if (prioridade !== undefined) return { prioridade, aposLinhaVazia: titulo };
  }
  if (titulo) return null;
  // A citação de outra súmula no começo de uma linha ("Súmula 331 - ...") não é rótulo.
  const sumula = ROTULO_SUMULA.exec(linha);
  if (sumula?.[1] === undefined || !mesmoNumero(sumula[1], numero)) return null;
  return { prioridade: PRIORIDADE_SUMULA, aposLinhaVazia: true };
}

/**
 * Ementa das seções da jurisprudência: o primeiro parágrafo de "Ementa", "Enunciado", "Questão"
 * ("questaoSubmetidaAJulgamento"), "Tese" ou "SÚMULA 23", nessa ordem, ou o campo textoEmenta
 * do registro JSON. O parágrafo junta as linhas até a linha vazia.
 * Devolve undefined quando o documento não tem nenhuma dessas seções, e null quando tem e estão vazias.
 */
function ementaDasSecoes(linhas: readonly string[], numero: string | null, registro: boolean): string | null | undefined {
  const achadas: Array<string | undefined> = [];
  let temSecoes = false;
  let cerca: Cerca = null;
  let secao: Rotulo | null = null;
  let paragrafo: string[] = [];
  const fecharParagrafo = (): void => {
    if (secao !== null && paragrafo.length > 0) {
      // Só o primeiro parágrafo da seção conta. "não informado" deixa a seção vazia.
      const texto = valorUtil(paragrafo.join(' '));
      // A linha do número da súmula pode quebrar: o resto dela ("1)") não é o enunciado.
      const restoDoRotulo = secao.prioridade === PRIORIDADE_SUMULA && texto !== null && texto.length < MIN_EMENTA;
      if (!restoDoRotulo) {
        if (texto !== null) achadas[secao.prioridade] ??= texto;
        secao = null;
      }
    }
    paragrafo = [];
  };
  for (const [indice, bruta] of linhas.entries()) {
    // Depois do limite, só termina o bloco ```json já aberto: o registro do CNJ cresce com o histórico.
    if (indice >= LINHAS_DE_SECOES && cerca !== 'json') break;
    const linha = bruta.trim();
    const novaCerca = proximaCerca(linha, cerca);
    if (novaCerca !== undefined) {
      fecharParagrafo();
      secao = null;
      cerca = novaCerca;
      continue;
    }
    if (cerca === 'json') {
      const campo = campoJsonDeEmenta(linha);
      if (campo !== undefined) temSecoes = true;
      if (typeof campo === 'string') achadas[0] ??= campo;
      continue;
    }
    if (linha === '') {
      fecharParagrafo();
      if (secao !== null && !secao.aposLinhaVazia) secao = null;
      continue;
    }
    const rotulo = rotuloDaLinha(linha, numero);
    if (rotulo !== null || linha.startsWith('#')) {
      fecharParagrafo();
      secao = rotulo;
      if (rotulo !== null) temSecoes = true;
      continue;
    }
    // No texto de uma lei, as seções só valem antes do primeiro artigo. Num registro de
    // tribunal, uma linha "Art. 37 da Constituição..." é parte do enunciado ou de uma referência.
    if (!registro && ROTULO_ARTIGO_SIMPLES.test(limparMarkdown(linha))) break;
    if (secao !== null) paragrafo.push(linha);
  }
  fecharParagrafo();
  if (!temSecoes) return undefined;
  const melhor = achadas.find((texto) => texto !== undefined);
  return melhor === undefined ? null : truncar(melhor, MAX_EMENTA);
}

/**
 * Ementa de um registro de tribunal sem seções: o primeiro parágrafo de texto, com as linhas
 * juntas. Os textos tirados de PDF (TST, TNU) quebram o enunciado em várias linhas.
 */
function ementaDoPrimeiroParagrafo(linhas: readonly string[], situacao: string | null): string | null {
  let cerca: Cerca = null;
  let paragrafo: string[] = [];
  let vistos = 0;
  const fecharParagrafo = (): string | null => {
    const texto = limparMarkdown(paragrafo.join(' '));
    paragrafo = [];
    if (texto === '') return null;
    vistos += 1;
    return texto.length >= MIN_EMENTA ? truncar(texto, MAX_EMENTA) : null;
  };
  for (const bruta of linhas) {
    const linha = bruta.trim();
    const novaCerca = proximaCerca(linha, cerca);
    if (novaCerca !== undefined) cerca = novaCerca;
    else if (cerca === 'json') continue;
    if (novaCerca !== undefined || linha === '' || /^[>#|<]/.test(linha)) {
      const texto = fecharParagrafo();
      if (texto !== null) return texto;
      if (vistos >= MAX_CANDIDATAS) return null;
      continue;
    }
    // A situação ("APROVADO", "Cancelado") tem campo próprio e não é ementa.
    if (situacao !== null && normalizarChave(linha) === situacao) continue;
    paragrafo.push(linha);
  }
  return fecharParagrafo();
}

/** Ementa do texto de uma lei antes do primeiro artigo: a frase que começa com verbo de ementa, ou a primeira frase longa. */
function ementaDoPreambulo(linhas: readonly string[], situacao: string | null): string | null {
  const candidatas: string[] = [];
  let depoisDoTitulo = false;
  let cerca: Cerca = null;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    const novaCerca = proximaCerca(linha, cerca);
    if (novaCerca !== undefined) {
      cerca = novaCerca;
      continue;
    }
    // Um bloco ```json guarda dados crus, como o registro do CNJ, nunca a ementa.
    if (linha === '' || cerca === 'json') continue;
    if (!depoisDoTitulo && linha.startsWith('# ')) {
      depoisDoTitulo = true;
      continue;
    }
    if (/^[>#|<]/.test(linha)) continue;
    const limpa = limparMarkdown(linha);
    if (limpa === '') continue;
    if (ROTULO_ARTIGO_SIMPLES.test(limpa)) break;
    // A situação ("APROVADO", "Cancelado") tem campo próprio e não é ementa.
    if (situacao !== null && normalizarChave(limpa) === situacao) continue;
    candidatas.push(limpa);
    if (candidatas.length >= MAX_CANDIDATAS) break;
  }
  for (const candidata of candidatas) {
    if (VERBO_EMENTA.test(candidata)) return truncar(candidata, MAX_EMENTA);
    const meio = VERBO_NO_MEIO.exec(candidata);
    if (meio?.[1]) return truncar(meio[1].trim(), MAX_EMENTA);
  }
  const outra = candidatas.find((c) => c.length >= MIN_EMENTA && !EPIGRAFE.test(c) && !PREAMBULO.test(c));
  return outra ? truncar(outra, MAX_EMENTA) : null;
}

/**
 * Ementa para normas sem `ementa` no cabeçalho.
 * - Com seções de jurisprudência (Questão, Enunciado, Tese, textoEmenta): o texto da seção.
 *   Num registro de tribunal com as seções vazias, a norma fica sem ementa.
 * - Registro de tribunal sem seções: o primeiro parágrafo de texto.
 * - Texto de lei: a frase com verbo de ementa antes do primeiro artigo.
 * A situação do cabeçalho nunca vira ementa.
 */
export function derivarEmenta(linhas: readonly string[], opcoes: OpcoesDeEmenta = {}): string | null {
  const registro = opcoes.registro === true;
  const situacao = opcoes.situacao == null ? null : normalizarChave(opcoes.situacao);
  const dasSecoes = ementaDasSecoes(linhas, opcoes.numero ?? null, registro);
  if (typeof dasSecoes === 'string') return dasSecoes;
  if (!registro) return ementaDoPreambulo(linhas, situacao);
  return dasSecoes === null ? null : ementaDoPrimeiroParagrafo(linhas, situacao);
}

/** Lê do corpo o título, os sinais de OCR e de texto ausente, o tachado e a ementa derivada. */
export function analisarDocumento(cabecalho: Cabecalho, corpo: string): AnaliseDocumento {
  const linhas = corpo.split('\n');
  let titulo: string | null = null;
  let ocr = ocrNoCabecalho(cabecalho);
  let semTexto = false;
  let temConteudo = false;
  let vistas = 0;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === '') continue;
    if (titulo === null && vistas === 0 && linha.startsWith('# ')) {
      titulo = linha.slice(2).trim();
      continue;
    }
    vistas += 1;
    if (vistas <= LINHAS_DE_AVISO && AVISO_OCR.test(linha)) {
      ocr = true;
      continue;
    }
    if (vistas <= LINHAS_DE_AVISO && AVISO_SEM_TEXTO.test(linha)) {
      semTexto = true;
      continue;
    }
    if (!linha.startsWith('>')) temConteudo = true;
    if (temConteudo && vistas > LINHAS_DE_AVISO) break;
  }
  if (!temConteudo) semTexto = true;
  const ementaCabecalho = textoOuNulo(cabecalho['ementa']);
  const derivar = (): string | null =>
    derivarEmenta(linhas, {
      situacao: textoOuNulo(cabecalho['situacao']),
      numero: textoOuNulo(cabecalho['numero']),
      registro: textoOuNulo(cabecalho['tribunal']) !== null,
    });
  return {
    titulo,
    ocr,
    semTexto,
    temTachado: TACHADO.test(corpo),
    ementaDerivada: ementaCabecalho === null && !semTexto ? derivar() : null,
  };
}
