import { CAMINHO_CONSTITUICAO, validarCaminho } from './caminho.js';
import { dobrar } from './texto.js';
import type { Esfera } from './tipos.js';

export interface DispositivoCitado {
  artigo?: string | undefined;
  paragrafo?: string | undefined;
  inciso?: string | undefined;
  alinea?: string | undefined;
}

export interface ReferenciaCaminho {
  forma: 'caminho';
  caminho: string;
}

export interface ReferenciaUrn {
  forma: 'urn';
  urn: string;
  pastas: string[];
  numero: string | null;
  data: string | null;
}

export interface ReferenciaCitacao {
  forma: 'citacao';
  constituicao: boolean;
  bloco: string | null;
  /** Chaves de tipo ou pastas aceitas. Vazio quer dizer qualquer tipo. */
  pastas: string[];
  numero: string | null;
  anos: number[];
  data: string | null;
  esfera: Esfera | null;
  uf: string | null;
  tribunal: string | null;
  dispositivo: DispositivoCitado | null;
}

export type Referencia = ReferenciaCaminho | ReferenciaUrn | ReferenciaCitacao;

const UFS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
]);

const MESES = [
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Normaliza o número de uma norma: sem separador de milhar, sem zeros à esquerda, sufixo em maiúsculas. */
export function normalizarNumero(bruto: string | null | undefined): string | null {
  if (bruto === null || bruto === undefined) return null;
  let texto = bruto.trim().toUpperCase().replace(/^N[º°O.]*\s*/, '').replace(/\s+/g, '');
  texto = texto.replace(/(\d)\.(?=\d{3}(?:\D|$))/g, '$1');
  if (texto === '') return null;
  const encontrado = /^0*(\d+)(.*)$/.exec(texto);
  if (!encontrado) return texto;
  return `${encontrado[1] ?? '0'}${encontrado[2] ?? ''}`;
}

const TIPOS_CITACAO: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/^(?:lei complementar|lcp?)\b/, ['leis-complementares']],
  [/^lei delegada\b/, ['leis-delegadas']],
  [/^lei organica\b/, ['lei-organica']],
  [/^(?:decreto[- ]lei|dl|del)\b/, ['decretos-lei']],
  [/^(?:decreto legislativo|dlg)\b/, ['decretos-legislativos']],
  [/^(?:decreto|dec)\b/, ['decretos', 'decretos-nao-numerados']],
  [/^(?:medida provisoria|mpv?)\b/, ['medidas-provisorias']],
  [/^(?:emenda constitucional|emenda a constituicao|ec|emc)\b/, ['emendas-constitucionais']],
  [/^lei\b/, ['leis-ordinarias', 'leis-promulgadas']],
  [/^(?:resolucao|res)\b/, ['resolucoes', 'resolucoes-senado', 'resolucoes-camara', 'resolucoes-congresso']],
  [/^portaria\b/, ['portarias']],
  [/^(?:instrucao normativa|in)\b/, ['instrucoes-normativas']],
  [/^deliberacao\b/, ['deliberacoes']],
];

const TIPOS_URN: Readonly<Record<string, readonly string[]>> = {
  lei: ['leis-ordinarias'],
  'lei.complementar': ['leis-complementares'],
  'lei.delegada': ['leis-delegadas'],
  'decreto.lei': ['decretos-lei'],
  decreto: ['decretos', 'decretos-nao-numerados'],
  'decreto.legislativo': ['decretos-legislativos'],
  'medida.provisoria': ['medidas-provisorias'],
  'emenda.constitucional': ['emendas-constitucionais'],
  constituicao: ['constituicao'],
};

interface ApelidoNorma {
  pasta: string;
  numero: string;
  ano: number;
}

function apelidos(lista: ReadonlyArray<readonly [readonly string[], string, string, number]>): Map<string, ApelidoNorma> {
  const mapa = new Map<string, ApelidoNorma>();
  for (const [nomes, pasta, numero, ano] of lista) {
    for (const nome of nomes) mapa.set(nome, { pasta, numero, ano });
  }
  return mapa;
}

/** Nomes usuais das normas federais mais citadas (chaves sem acento, em minúsculas). */
const APELIDOS_NORMA: ReadonlyMap<string, ApelidoNorma> = apelidos([
  [['cc', 'cc/2002', 'codigo civil'], 'leis-ordinarias', '10406', 2002],
  [['cpc', 'cpc/2015', 'codigo de processo civil'], 'leis-ordinarias', '13105', 2015],
  [['cp', 'codigo penal'], 'decretos-lei', '2848', 1940],
  [['cpp', 'codigo de processo penal'], 'decretos-lei', '3689', 1941],
  [['clt', 'consolidacao das leis do trabalho'], 'decretos-lei', '5452', 1943],
  [['cdc', 'codigo de defesa do consumidor'], 'leis-ordinarias', '8078', 1990],
  [['ctn', 'codigo tributario nacional'], 'leis-ordinarias', '5172', 1966],
  [['ctb', 'codigo de transito brasileiro'], 'leis-ordinarias', '9503', 1997],
  [['eca', 'estatuto da crianca e do adolescente'], 'leis-ordinarias', '8069', 1990],
  [['lgpd', 'lei geral de protecao de dados'], 'leis-ordinarias', '13709', 2018],
  [['lindb', 'lei de introducao as normas do direito brasileiro'], 'decretos-lei', '4657', 1942],
  [['marco civil da internet'], 'leis-ordinarias', '12965', 2014],
  [['lei de licitacoes', 'nova lei de licitacoes'], 'leis-ordinarias', '14133', 2021],
  [['lrf', 'lei de responsabilidade fiscal'], 'leis-complementares', '101', 2000],
  [['lei maria da penha', 'maria da penha'], 'leis-ordinarias', '11340', 2006],
  [['estatuto do idoso', 'estatuto da pessoa idosa'], 'leis-ordinarias', '10741', 2003],
  [['lai', 'lei de acesso a informacao'], 'leis-ordinarias', '12527', 2011],
  [['lei do inquilinato', 'lei de locacoes'], 'leis-ordinarias', '8245', 1991],
  [['lei dos juizados especiais', 'lei dos juizados'], 'leis-ordinarias', '9099', 1995],
  [['lei de improbidade administrativa', 'lia'], 'leis-ordinarias', '8429', 1992],
  [['lep', 'lei de execucao penal'], 'leis-ordinarias', '7210', 1984],
  [['lei de drogas'], 'leis-ordinarias', '11343', 2006],
  [['estatuto da cidade'], 'leis-ordinarias', '10257', 2001],
  [['codigo florestal'], 'leis-ordinarias', '12651', 2012],
  [['codigo eleitoral'], 'leis-ordinarias', '4737', 1965],
  [['lei de arbitragem'], 'leis-ordinarias', '9307', 1996],
  [['lei de falencias'], 'leis-ordinarias', '11101', 2005],
  [['estatuto da oab'], 'leis-ordinarias', '8906', 1994],
  [['lei anticorrupcao'], 'leis-ordinarias', '12846', 2013],
  [['estatuto do desarmamento'], 'leis-ordinarias', '10826', 2003],
  [['lbi', 'estatuto da pessoa com deficiencia'], 'leis-ordinarias', '13146', 2015],
  [['lei do mandado de seguranca'], 'leis-ordinarias', '12016', 2009],
  [['lei da acao civil publica', 'lacp'], 'leis-ordinarias', '7347', 1985],
  [['simples nacional', 'estatuto da microempresa'], 'leis-complementares', '123', 2006],
]);

const CONSTITUICAO =
  /^(?:a\s+)?(?:cf(?:\s*\/\s*(?:19)?88|88)?|crfb(?:\s*\/\s*(?:19)?88)?|constituicao(?:\s+(?:federal|da republica|federativa|do brasil|brasileira|de 1988))*)\.?$/;
const ADCT = /^(?:o\s+)?(?:adct|ato das disposicoes constitucionais transitorias)\.?$/;
const TRIBUNAIS = /(stf|stj|tst|tse|stm|tcu|tnu|trf\s*\d)\s*$/;

function anosDe(texto: string, anoAtual: number): number[] {
  if (texto.length === 4) return [Number(texto)];
  const curto = Number(texto);
  return curto <= anoAtual % 100 ? [2000 + curto, 1900 + curto] : [1900 + curto];
}

function dataDe(dia: string, mes: number, ano: string): string | null {
  const d = Number(dia);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Lê a parte "art. 5º, § 2º, XI, alínea a" de uma citação. */
export function lerDispositivo(texto: string): DispositivoCitado | null {
  const artigo = /\bart(?:igo)?s?\.?\s*((?:l(?=\d))?\d{1,4}(?:\.\d{3})*\s*(?:[º°ª]|o(?!\p{L}))?(?:\s*-\s*[A-Za-z](?!\p{L}))*)/iu.exec(
    texto,
  );
  const unico = /\bartigo\s+[úu]nico\b/iu.exec(texto);
  if (!artigo && !unico) return null;
  const inicio = artigo ? artigo.index + artigo[0].length : (unico?.index ?? 0) + (unico?.[0].length ?? 0);
  const resto = texto.slice(inicio);
  const dispositivo: DispositivoCitado = { artigo: artigo ? (artigo[1] ?? '').trim() : 'único' };
  const paragrafo = /§\s*(\d{1,3}\s*[º°ª]?(?:\s*-\s*[A-Za-z](?!\p{L}))?)|par[áa]grafo\s+([úu]nico|\d{1,3})/iu.exec(resto);
  if (paragrafo) dispositivo.paragrafo = (paragrafo[1] ?? paragrafo[2] ?? '').trim();
  const semParagrafo = paragrafo ? resto.replace(paragrafo[0], ' ') : resto;
  const inciso =
    /\binciso\s+([IVXLCDM]{1,7}|\d{1,3})\b/iu.exec(semParagrafo) ??
    /(?:^|[\s,;(])([IVXLCDM]{1,7})(?=$|[\s,;.)])/u.exec(semParagrafo);
  if (inciso) dispositivo.inciso = (inciso[1] ?? '').trim();
  const alinea =
    /\bal[íi]nea\s+["“]?([a-z])["”]?/iu.exec(semParagrafo) ?? /,\s*["“]?([a-z])["”]?\)?\s*$/u.exec(semParagrafo);
  if (alinea) dispositivo.alinea = alinea[1];
  return dispositivo;
}

/** Separa a norma do dispositivo: "art. 5º, XI, da CF" e "CF, art. 5º, XI". */
function separarNormaEDispositivo(texto: string): { norma: string; dispositivo: DispositivoCitado | null } {
  const limpo = texto.trim();
  const antes = /^(art(?:igo)?s?\.?\s*.+?)[,\s]+(?:d[aoe]s?|na|no)\s+(.+)$/iu.exec(limpo);
  if (antes && /^art/i.test(limpo)) {
    return { norma: (antes[2] ?? '').trim(), dispositivo: lerDispositivo(antes[1] ?? '') };
  }
  const posicao = limpo.search(/(?:^|[\s,;])art(?:igo)?s?\.?\s*(?:\d|[úu]nico)/iu);
  if (posicao < 0) return { norma: limpo, dispositivo: null };
  return { norma: limpo.slice(0, posicao).replace(/[,;\s]+$/, ''), dispositivo: lerDispositivo(limpo.slice(posicao)) };
}

function lerUrn(urn: string): ReferenciaUrn {
  const encontrado = /^urn:lex:br:federal:([a-z.]+):(\d{4}-\d{2}-\d{2});([0-9a-z.-]+)/i.exec(urn);
  if (!encontrado) return { forma: 'urn', urn, pastas: [], numero: null, data: null };
  const tipo = (encontrado[1] ?? '').toLowerCase();
  return {
    forma: 'urn',
    urn,
    pastas: [...(TIPOS_URN[tipo] ?? [])],
    numero: normalizarNumero(encontrado[3] ?? null),
    data: encontrado[2] ?? null,
  };
}

function citacaoVazia(): ReferenciaCitacao {
  return {
    forma: 'citacao',
    constituicao: false,
    bloco: null,
    pastas: [],
    numero: null,
    anos: [],
    data: null,
    esfera: null,
    uf: null,
    tribunal: null,
    dispositivo: null,
  };
}

function lerJurisprudencia(norma: string, citacao: ReferenciaCitacao): boolean {
  const vinculante = /^(?:sumula vinculante|sv)\s*(?:n[º°o.]*\s*)?(\d{1,4})\b/.exec(norma);
  if (vinculante) {
    citacao.esfera = 'jurisprudencia';
    citacao.tribunal = 'stf';
    citacao.pastas = ['sumulas-vinculantes'];
    citacao.numero = normalizarNumero(vinculante[1] ?? null);
    return true;
  }
  const sumula = /^sumula\s*(?:n[º°o.]*\s*)?(\d{1,4})\b(.*)$/.exec(norma);
  if (sumula) {
    const tribunal = TRIBUNAIS.exec((sumula[2] ?? '').trim());
    citacao.esfera = 'jurisprudencia';
    citacao.tribunal = tribunal ? (tribunal[1] ?? '').replace(/\s+/g, '') : null;
    citacao.pastas = ['sumulas'];
    citacao.numero = normalizarNumero(sumula[1] ?? null);
    return true;
  }
  const tema = /^tema\s*(?:n[º°o.]*\s*)?(\d{1,2}(?:\.\d{3})+|\d{1,5})\b(.*)$/.exec(norma);
  if (tema) {
    const tribunal = TRIBUNAIS.exec((tema[2] ?? '').trim())?.[1] ?? null;
    const pastas =
      tribunal === 'stf'
        ? ['repercussao-geral', 'tema-de-repercussao-geral']
        : tribunal === 'stj'
          ? ['repetitivos', 'tema-repetitivo']
          : tribunal === 'tnu'
            ? ['uniformizacao']
            : ['repercussao-geral', 'tema-de-repercussao-geral', 'repetitivos', 'tema-repetitivo', 'uniformizacao'];
    citacao.esfera = 'jurisprudencia';
    citacao.tribunal = tribunal;
    citacao.pastas = pastas;
    citacao.numero = normalizarNumero(tema[1] ?? null);
    return true;
  }
  return false;
}

/**
 * Lê uma referência livre: caminho do acervo, URI leis://, URN LexML ou citação
 * ("Lei 8.078/1990", "LC 123/2006", "CF art. 5º, XI", "ADCT art. 10", "Súmula 7 do STJ").
 */
export function analisarReferencia(texto: string, anoAtual: number = new Date().getUTCFullYear()): Referencia | null {
  const bruto = texto.trim();
  if (bruto === '') return null;
  if (bruto.toLowerCase().startsWith('leis://')) {
    let decodificado: string;
    try {
      decodificado = decodeURIComponent(bruto.slice('leis://'.length));
    } catch {
      return null;
    }
    const caminho = validarCaminho(decodificado);
    return caminho ? { forma: 'caminho', caminho } : null;
  }
  const caminho = validarCaminho(bruto);
  if (caminho) return { forma: 'caminho', caminho };
  if (/^urn:lex:/i.test(bruto)) return lerUrn(bruto);

  const { norma: normaBruta, dispositivo } = separarNormaEDispositivo(bruto);
  const norma = dobrar(normaBruta).replace(/\s+/g, ' ').replace(/[,;]+$/, '').trim();
  const citacao = citacaoVazia();
  citacao.dispositivo = dispositivo;

  if (norma === '') return null;
  if (ADCT.test(norma)) {
    return { ...citacao, constituicao: true, bloco: 'adct', esfera: 'constituicao', pastas: ['constituicao'] };
  }
  if (CONSTITUICAO.test(norma)) {
    return { ...citacao, constituicao: true, esfera: 'constituicao', pastas: ['constituicao'] };
  }
  const apelido = APELIDOS_NORMA.get(norma.replace(/\.$/, ''));
  if (apelido) {
    return {
      ...citacao,
      esfera: 'federal',
      pastas: [apelido.pasta],
      numero: apelido.numero,
      anos: [apelido.ano],
    };
  }
  if (/^constituicao (?:estadual|do estado)\b/.test(norma)) {
    const uf = [...normaBruta.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1] ?? '').find((sigla) => UFS.has(sigla));
    return { ...citacao, esfera: 'estaduais', pastas: ['constituicao'], uf: uf ?? null };
  }
  if (lerJurisprudencia(norma, citacao)) return citacao;

  let resto = norma;
  for (const [padrao, pastas] of TIPOS_CITACAO) {
    const tipo = padrao.exec(resto);
    if (tipo) {
      citacao.pastas = [...pastas];
      resto = resto.slice(tipo[0].length);
      break;
    }
  }
  const qualificador = /^\s*(federal|estadual|municipal|distrital)\b/.exec(resto);
  if (qualificador) {
    const valor = qualificador[1];
    citacao.esfera = valor === 'federal' ? 'federal' : valor === 'municipal' ? 'municipais' : 'estaduais';
    if (valor === 'distrital') citacao.uf = 'DF';
    resto = resto.slice(qualificador[0].length);
  }
  const numero = /^\s*(?:n[º°o.]*\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(-(?:\d{1,3}|[a-z]))?(?![\d.])/.exec(resto);
  if (!numero) return null;
  citacao.numero = normalizarNumero(`${numero[1] ?? ''}${numero[2] ?? ''}`);
  const aposNumero = resto.slice(numero[0].length);
  const longa = /^[\s,]*de\s+(\d{1,2})[º°o]?\s+de\s+([a-z]+)\s+de\s+(\d{4})/.exec(aposNumero);
  const numerica = /^[\s,]*(?:de\s+)?(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/.exec(aposNumero);
  const barra = /^\s*\/\s*(\d{4}|\d{2})(?!\d)/.exec(aposNumero);
  const deAno = /^[\s,]*de\s+(\d{4})(?!\d)/.exec(aposNumero);
  if (longa) {
    const mes = MESES.indexOf(longa[2] ?? '') + 1;
    citacao.data = mes > 0 ? dataDe(longa[1] ?? '', mes, longa[3] ?? '') : null;
    citacao.anos = [Number(longa[3])];
  } else if (numerica) {
    citacao.data = dataDe(numerica[1] ?? '', Number(numerica[2]), numerica[3] ?? '');
    citacao.anos = [Number(numerica[3])];
  } else if (barra) {
    citacao.anos = anosDe(barra[1] ?? '', anoAtual);
  } else if (deAno) {
    citacao.anos = [Number(deAno[1])];
  }
  const ufs = [...normaBruta.matchAll(/\b([A-Z]{2})\b/g)].map((m) => m[1] ?? '').filter((sigla) => UFS.has(sigla));
  const uf = ufs[ufs.length - 1];
  if (uf !== undefined && citacao.uf === null) {
    citacao.uf = uf;
    if (citacao.esfera === null) citacao.esfera = 'estaduais';
  }
  if (citacao.pastas.length === 0 && citacao.anos.length === 0 && citacao.data === null) return null;
  return citacao;
}

export { CAMINHO_CONSTITUICAO };
