export type CodigoErro =
  | 'entrada_invalida'
  | 'caminho_invalido'
  | 'nao_encontrada'
  | 'dispositivo_nao_encontrado'
  | 'indice_ausente'
  | 'indice_desatualizado'
  | 'fora_do_escopo'
  | 'cursor_invalido'
  | 'busca_textual_indisponivel'
  | 'consulta_vazia'
  | 'sincronizacao'
  | 'interno';

/** Erro de domínio com mensagem em português e o próximo passo para quem chamou. */
export class ErroLeis extends Error {
  readonly codigo: CodigoErro;
  readonly proximoPasso: string;
  readonly sugestoes: string[];

  constructor(codigo: CodigoErro, mensagem: string, proximoPasso: string, sugestoes: string[] = []) {
    super(mensagem);
    this.name = 'ErroLeis';
    this.codigo = codigo;
    this.proximoPasso = proximoPasso;
    this.sugestoes = sugestoes;
  }
}

export function ehErroLeis(erro: unknown): erro is ErroLeis {
  return erro instanceof ErroLeis;
}

export function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
