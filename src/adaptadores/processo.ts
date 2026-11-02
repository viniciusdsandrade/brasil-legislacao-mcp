import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

/** Falha de um subprocesso: binário ausente ou código de saída não aceito. */
export class ErroProcesso extends Error {
  readonly binario: string;
  readonly codigo: number | null;
  readonly saidaDeErro: string;
  readonly ausente: boolean;

  constructor(binario: string, codigo: number | null, saidaDeErro: string, ausente = false) {
    super(
      ausente
        ? `O programa "${binario}" não foi encontrado.`
        : `O programa "${binario}" terminou com código ${String(codigo)}: ${saidaDeErro.trim().slice(0, 500)}`,
    );
    this.name = 'ErroProcesso';
    this.binario = binario;
    this.codigo = codigo;
    this.saidaDeErro = saidaDeErro;
    this.ausente = ausente;
  }
}

export interface OpcoesProcesso {
  cwd?: string | undefined;
  ambiente?: NodeJS.ProcessEnv | undefined;
  entrada?: string | undefined;
  tempoMaximoMs?: number | undefined;
}

export interface ResultadoProcesso {
  codigo: number;
  saida: string;
  erro: string;
}

function ehAusente(erro: unknown): boolean {
  return typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === 'ENOENT';
}

/**
 * Executa um programa com uma lista de argumentos, sem shell, e devolve a saída inteira.
 * Não lança erro por código de saída: quem chama decide.
 */
export function executar(binario: string, argumentos: readonly string[], opcoes: OpcoesProcesso = {}): Promise<ResultadoProcesso> {
  return new Promise((resolver, rejeitar) => {
    const filho = spawn(binario, [...argumentos], {
      cwd: opcoes.cwd,
      env: opcoes.ambiente ?? process.env,
      shell: false,
      windowsHide: true,
    });
    const saida: Buffer[] = [];
    const erro: Buffer[] = [];
    const temporizador =
      opcoes.tempoMaximoMs === undefined ? undefined : setTimeout(() => filho.kill('SIGKILL'), opcoes.tempoMaximoMs);
    filho.stdout.on('data', (pedaco: Buffer) => saida.push(pedaco));
    filho.stderr.on('data', (pedaco: Buffer) => erro.push(pedaco));
    filho.stdin.on('error', () => undefined);
    filho.on('error', (falha) => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      rejeitar(new ErroProcesso(binario, null, String(falha), ehAusente(falha)));
    });
    filho.on('close', (codigo) => {
      if (temporizador !== undefined) clearTimeout(temporizador);
      resolver({ codigo: codigo ?? -1, saida: Buffer.concat(saida).toString('utf8'), erro: Buffer.concat(erro).toString('utf8') });
    });
    filho.stdin.end(opcoes.entrada ?? '');
  });
}

export interface OpcoesFluxo extends OpcoesProcesso {
  /** Separador dos registros. Sem separador, o fluxo entrega os pedaços como chegam. */
  separador?: string | undefined;
  /** Códigos de saída aceitos sem erro. Padrão: só 0. */
  codigosAceitos?: readonly number[] | undefined;
}

interface Termino {
  codigo: number | null;
  falha: unknown;
}

/**
 * Lê a saída de um programa em fluxo, sem guardar tudo na memória. Se quem lê parar
 * antes do fim, o processo é encerrado.
 */
export async function* fluxo(binario: string, argumentos: readonly string[], opcoes: OpcoesFluxo = {}): AsyncGenerator<string, void, undefined> {
  const filho = spawn(binario, [...argumentos], {
    cwd: opcoes.cwd,
    env: opcoes.ambiente ?? process.env,
    shell: false,
    windowsHide: true,
  });
  filho.stdin.on('error', () => undefined);
  filho.stdin.end();
  const erros: Buffer[] = [];
  let tamanhoErros = 0;
  filho.stderr.on('data', (pedaco: Buffer) => {
    if (tamanhoErros < 64_000) {
      erros.push(pedaco);
      tamanhoErros += pedaco.length;
    }
  });
  const termino = new Promise<Termino>((resolver) => {
    filho.on('error', (falha) => resolver({ codigo: null, falha }));
    filho.on('close', (codigo) => resolver({ codigo, falha: null }));
  });
  const temporizador =
    opcoes.tempoMaximoMs === undefined ? undefined : setTimeout(() => filho.kill('SIGKILL'), opcoes.tempoMaximoMs);
  const decodificador = new StringDecoder('utf8');
  let pendente = '';
  let completo = false;
  try {
    for await (const pedaco of filho.stdout) {
      const texto = decodificador.write(Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(String(pedaco)));
      if (opcoes.separador === undefined) {
        if (texto !== '') yield texto;
        continue;
      }
      pendente += texto;
      const partes = pendente.split(opcoes.separador);
      pendente = partes.pop() ?? '';
      for (const parte of partes) if (parte !== '') yield parte;
    }
    const resto = pendente + decodificador.end();
    if (resto !== '') yield resto;
    const fim = await termino;
    completo = true;
    if (fim.falha !== null) throw new ErroProcesso(binario, null, String(fim.falha), ehAusente(fim.falha));
    const aceitos = opcoes.codigosAceitos ?? [0];
    if (fim.codigo === null || !aceitos.includes(fim.codigo)) {
      throw new ErroProcesso(binario, fim.codigo, Buffer.concat(erros).toString('utf8'));
    }
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
    if (!completo && filho.exitCode === null) filho.kill();
  }
}
