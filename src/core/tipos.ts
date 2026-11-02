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
