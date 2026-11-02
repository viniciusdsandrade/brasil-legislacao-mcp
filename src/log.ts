/** Log em stderr. stdout é o canal JSON-RPC do servidor e não recebe log. */
export type NivelLog = 'erro' | 'aviso' | 'info' | 'depuracao';

const ORDEM: Record<NivelLog, number> = { erro: 0, aviso: 1, info: 2, depuracao: 3 };

export interface Log {
  erro(mensagem: string, dados?: Record<string, unknown>): void;
  aviso(mensagem: string, dados?: Record<string, unknown>): void;
  info(mensagem: string, dados?: Record<string, unknown>): void;
  depuracao(mensagem: string, dados?: Record<string, unknown>): void;
}

export interface SaidaDeLog {
  write(texto: string): unknown;
}

export function nivelDeLog(valor: string | undefined): NivelLog {
  const nivel = (valor ?? '').trim().toLowerCase();
  if (nivel === 'erro' || nivel === 'error') return 'erro';
  if (nivel === 'aviso' || nivel === 'warn' || nivel === 'warning') return 'aviso';
  if (nivel === 'depuracao' || nivel === 'debug') return 'depuracao';
  return 'info';
}

export function criarLog(nivel: NivelLog = 'info', saida: SaidaDeLog = process.stderr): Log {
  const escrever = (atual: NivelLog, mensagem: string, dados?: Record<string, unknown>): void => {
    if (ORDEM[atual] > ORDEM[nivel]) return;
    const extra = dados !== undefined && Object.keys(dados).length > 0 ? ` ${JSON.stringify(dados)}` : '';
    saida.write(`[leis-mcp] ${atual}: ${mensagem}${extra}\n`);
  };
  return {
    erro: (mensagem, dados) => escrever('erro', mensagem, dados),
    aviso: (mensagem, dados) => escrever('aviso', mensagem, dados),
    info: (mensagem, dados) => escrever('info', mensagem, dados),
    depuracao: (mensagem, dados) => escrever('depuracao', mensagem, dados),
  };
}
