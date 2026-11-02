import type {
  Autoria,
  Contagem,
  Dimensao,
  EstadoIndice,
  FiltroNormas,
  Norma,
  RegistroAutoria,
  RegistroNorma,
} from './tipos.js';

/** Leitura do índice. O servidor só usa esta porta. */
export interface ConsultaIndice {
  /** Estado do índice, ou null quando o índice não existe. */
  estado(): EstadoIndice | null;
  buscar(parametros: {
    fts: string | null;
    filtro: FiltroNormas;
    limite: number;
    deslocamento: number;
  }): Norma[];
  /** Total da busca, até o teto. Acima do teto, devolve teto + 1. */
  contar(parametros: { fts: string | null; filtro: FiltroNormas; teto: number }): number;
  porCaminho(caminho: string): Norma | null;
  porCaminhos(caminhos: readonly string[], filtro: FiltroNormas): Norma[];
  porUrn(urn: string): Norma[];
  porReferencia(parametros: {
    pastas: readonly string[];
    numero: string;
    anos: readonly number[];
    data: string | null;
    esfera: string | null;
    uf: string | null;
    tribunal: string | null;
    limite: number;
  }): Norma[];
  facetas(parametros: { dimensao: Dimensao; fts: string | null; filtro: FiltroNormas; limite: number }): Contagem[];
  autoriaDe(caminho: string): Autoria | null;
  normasDoSignatario(parametros: { nome: string; limite: number; deslocamento: number }): {
    nome: string | null;
    normas: Norma[];
    total: number;
  };
  signatariosParecidos(nome: string, limite: number): string[];
  /** Caminhos dos arquivos _falhas.jsonl que o sync registrou. */
  arquivosDeFalhas(): string[];
}

/** Escrita do índice. Só o comando sync usa esta porta. */
export interface GravadorIndice {
  lerMeta(chave: string): string | null;
  gravarMeta(valores: Record<string, string>): void;
  /** Apaga normas, autoria, falhas e metadados. */
  limpar(): void;
  gravarNormas(registros: readonly RegistroNorma[]): void;
  removerNormas(caminhos: readonly string[]): number;
  /** Apaga normas, autoria e falhas fora dos pathspecs do escopo. */
  removerForaDoEscopo(pathspecs: readonly string[]): number;
  gravarAutoria(registros: readonly RegistroAutoria[]): void;
  /** Liga a autoria cujo caminho da base sumiu à norma de mesma fonte. Devolve quantas ligou. */
  religarAutoria(): number;
  registrarFalhas(caminhos: readonly string[]): void;
  removerFalhas(caminhos: readonly string[]): void;
  /** Caminhos de normas indexadas sob um pathspec (arquivo ou pasta). */
  caminhosSob(pathspec: string): string[];
  /** Arquivos _falhas.jsonl registrados sob um pathspec. */
  falhasSob(pathspec: string): string[];
  contarNormas(): number;
  otimizar(): void;
}

/** Acesso somente leitura aos arquivos do clone local. */
export interface Acervo {
  /** Lê uma norma pelo caminho relativo. O caminho é validado. */
  ler(caminho: string): Promise<string>;
  /** Lê um arquivo da raiz do acervo (COBERTURA.md, PROGRESSO.md), ou null. */
  lerRaiz(nome: 'COBERTURA.md' | 'PROGRESSO.md'): Promise<string | null>;
  /** Lê um _falhas.jsonl, ou null. */
  lerFalhas(caminho: string): Promise<string | null>;
}

export interface OcorrenciaTexto {
  caminho: string;
  linha: number;
  trecho: string;
}

export interface ArquivosEncontrados {
  /** Caminhos em ordem estável (ordem alfabética do caminho). */
  caminhos: string[];
  /** Verdadeiro quando a busca parou no limite ou com erro parcial. */
  parcial: boolean;
}

/** Busca no corpo dos arquivos, fora do índice (ripgrep). */
export interface BuscaTextual {
  /** Todos os arquivos das pastas que casam com o padrão, até o limite. */
  arquivos(parametros: { padrao: string; pastas: readonly string[]; maxArquivos: number }): Promise<ArquivosEncontrados>;
  /** A primeira ocorrência do padrão em cada arquivo, para mostrar o trecho. */
  trechos(parametros: { padrao: string; caminhos: readonly string[] }): Promise<OcorrenciaTexto[]>;
}

export type StatusMudanca = 'A' | 'M' | 'D';

export interface Mudanca {
  status: StatusMudanca;
  caminho: string;
}

/** Operações git do comando sync. */
export interface RepositorioGit {
  existe(): Promise<boolean>;
  /** URL do remoto origin do clone, ou null. */
  remotoAtual(): Promise<string | null>;
  clonar(pastas: readonly string[]): Promise<void>;
  definirPastas(pastas: readonly string[]): Promise<void>;
  atualizar(): Promise<void>;
  head(): Promise<string>;
  temCommit(commit: string): Promise<boolean>;
  mudancas(de: string, ate: string, pathspecs: readonly string[]): AsyncIterable<Mudanca>;
  arquivos(commit: string, pathspecs: readonly string[]): AsyncIterable<string>;
  logAutoria(pathspecs: readonly string[], intervalo: string | null): AsyncIterable<string>;
}

/** Leitura de arquivos do clone durante o sync. */
export interface LeitorArquivos {
  ler(caminho: string): Promise<string | null>;
}

export interface Relogio {
  agora(): Date;
}
