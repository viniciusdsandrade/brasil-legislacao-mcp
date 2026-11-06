/** Esferas do acervo, na ordem de preferência usada para desempate. */
export const ESFERAS = [
  'constituicao',
  'federal',
  'estaduais',
  'municipais',
  'reguladores',
  'jurisprudencia',
  'tratados',
] as const;

export type Esfera = (typeof ESFERAS)[number];

export function ehEsfera(valor: string): valor is Esfera {
  return (ESFERAS as readonly string[]).includes(valor);
}

/** Dados que o caminho de uma norma revela. */
export interface InfoCaminho {
  caminho: string;
  esfera: Esfera;
  uf: string | null;
  municipio: string | null;
  orgao: string | null;
  tribunal: string | null;
  pasta: string | null;
  anoPasta: number | null;
}

export type ValorCabecalho = string | boolean | null;
export type Cabecalho = Record<string, ValorCabecalho>;

/**
 * Vigência que a fonte oficial informa, do campo `forca_legal_fonte` do cabeçalho
 * (legislationLegalForce da API do Senado): InForce, NotInForce ou PartiallyInForce.
 */
export const VIGENCIAS_NA_FONTE = ['em_vigor', 'sem_vigor', 'parcial'] as const;
export type VigenciaNaFonte = (typeof VIGENCIAS_NA_FONTE)[number];

/** Uma norma como o índice a guarda. */
export interface Norma {
  caminho: string;
  esfera: Esfera;
  uf: string | null;
  municipio: string | null;
  orgao: string | null;
  tribunal: string | null;
  pasta: string | null;
  tipo: string | null;
  tipoChave: string | null;
  numero: string | null;
  numeroNormalizado: string | null;
  data: string | null;
  ano: number | null;
  titulo: string;
  ementa: string | null;
  ementaDerivada: boolean;
  situacao: string | null;
  revogada: boolean | null;
  /** Vigência segundo a fonte oficial. Null quando a fonte não informa. */
  vigenciaNaFonte: VigenciaNaFonte | null;
  versaoTexto: string | null;
  fonte: string | null;
  baixadoEm: string | null;
  urn: string | null;
  ocr: boolean;
  semTexto: boolean;
  temTachado: boolean;
}

/** Norma pronta para gravação. `corpo` só existe quando o escopo indexa o corpo. */
export interface RegistroNorma extends Norma {
  corpo: string | null;
}

/** Filtro sobre os metadados do índice. Campo ausente não filtra. */
export interface FiltroNormas {
  esfera?: Esfera | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  orgao?: string | undefined;
  tribunal?: string | undefined;
  tipoChave?: string | undefined;
  numeroNormalizado?: string | undefined;
  dataDe?: string | undefined;
  dataAte?: string | undefined;
  /**
   * true: só as normas revogadas ou sem vigor segundo a fonte. false: tira essas normas;
   * as normas sem informação de vigência continuam.
   */
  revogada?: boolean | undefined;
  /** Prefixo de caminho (pasta do recorte), sem barra final. */
  prefixo?: string | undefined;
}

export const DIMENSOES = ['esfera', 'tipo', 'uf', 'orgao', 'tribunal', 'municipio', 'decada'] as const;
export type Dimensao = (typeof DIMENSOES)[number];

export interface Contagem {
  valor: string;
  quantidade: number;
  rotulo?: string | undefined;
}

export interface EstadoIndice {
  versaoEsquema: number;
  commit: string | null;
  sincronizadoEm: string | null;
  remoto: string | null;
  ramo: string | null;
  escopo: string[];
  corpo: string[];
  total: number;
  porEsfera: Contagem[];
}

/**
 * Norma que o registro de pendências de integralidade do acervo lista: o texto está
 * preservado, mas ainda não foi validado como completo.
 */
export interface Pendencia {
  caminho: string;
  /** Estado no registro, por exemplo "suplemento_ausente_na_transcricao". */
  estado: string;
  /** Motivo, nas palavras do registro. */
  motivo: string;
}

/** Dados gerais do registro de pendências gravado no índice. */
export interface ResumoPendencias {
  /** Data do registro (AAAA-MM-DD), ou null. */
  data: string | null;
  /** Critério do registro, nas palavras dele, ou null. */
  criterio: string | null;
  /** Normas listadas no registro. */
  total: number;
}

/** Autoria de uma norma, lida dos commits da base inicial. */
export interface Autoria {
  caminho: string;
  autor: string;
  coautores: string[];
  origem: string | null;
  commit: string;
}

/** Um commit da base inicial que acrescentou uma norma. */
export interface RegistroAutoria {
  commit: string;
  autor: string;
  coautores: string[];
  origem: string | null;
  fonte: string | null;
  /** Caminho no commit da base. Pode não existir mais no HEAD. */
  caminho: string;
}
