import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FORMATO_LOG_AUTORIA } from '../core/autoria.js';
import { ErroLeis } from '../core/erros.js';
import type { Mudanca, RepositorioGit } from '../core/portas.js';
import { ErroProcesso, executar, fluxo, type ResultadoProcesso } from './processo.js';

export interface OpcoesGit {
  binario: string;
  diretorio: string;
  remoto: string;
  ramo: string;
}

const COMMIT = /^[0-9a-f]{7,64}$/;
const PATHSPEC = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

function validarPathspecs(pathspecs: readonly string[]): void {
  for (const spec of pathspecs) {
    if (!PATHSPEC.test(spec) || spec.split('/').includes('..')) {
      throw new ErroLeis('entrada_invalida', `Pasta de escopo inválida: "${spec}".`, 'Corrija LEIS_ESCOPO.');
    }
  }
}

function validarCommit(commit: string): void {
  if (!COMMIT.test(commit)) throw new ErroLeis('sincronizacao', `Commit inválido: "${commit}".`, 'Rode o sync de novo.');
}

/** Argumentos do clone parcial e esparso. O remoto e a pasta vêm depois de "--". */
export function argumentosDeClone(remoto: string, ramo: string, diretorio: string): string[] {
  return ['clone', '--filter=blob:none', '--sparse', '--no-tags', '--branch', ramo, '--', remoto, diretorio];
}

/** Git do clone local. Só leitura do remoto: clone, sparse-checkout, pull --ff-only, diff, ls-tree e log. */
export class GitLocal implements RepositorioGit {
  constructor(private readonly opcoes: OpcoesGit) {}

  private get ambiente(): NodeJS.ProcessEnv {
    return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  }

  private base(): string[] {
    return ['-C', this.opcoes.diretorio, '-c', 'core.quotePath=false'];
  }

  private async git(argumentos: readonly string[], entrada?: string): Promise<string> {
    let resultado: ResultadoProcesso;
    try {
      resultado = await executar(this.opcoes.binario, [...this.base(), ...argumentos], { ambiente: this.ambiente, entrada });
    } catch (erro) {
      throw this.erroDeGit(erro, argumentos[0] ?? 'git');
    }
    if (resultado.codigo !== 0) {
      throw new ErroLeis(
        'sincronizacao',
        `git ${argumentos[0] ?? ''} falhou: ${resultado.erro.trim().slice(0, 500)}`,
        'Confira a rede, LEIS_REMOTO, LEIS_RAMO e a pasta LEIS_CLONE.',
      );
    }
    return resultado.saida;
  }

  private erroDeGit(erro: unknown, comando: string): ErroLeis {
    if (erro instanceof ErroProcesso && erro.ausente) {
      return new ErroLeis('sincronizacao', 'O git não foi encontrado.', 'Instale o git ou informe o caminho em LEIS_GIT.');
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    return new ErroLeis('sincronizacao', `git ${comando} falhou: ${mensagem.slice(0, 500)}`, 'Confira LEIS_REMOTO, LEIS_RAMO e LEIS_CLONE.');
  }

  async existe(): Promise<boolean> {
    try {
      await stat(join(this.opcoes.diretorio, '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async remotoAtual(): Promise<string | null> {
    try {
      // O valor cru da configuração: `git remote get-url` aplica as regras insteadOf e mudaria a URL.
      const url = (await this.git(['config', '--get', 'remote.origin.url'])).trim();
      return url === '' ? null : url;
    } catch {
      return null;
    }
  }

  async clonar(pastas: readonly string[]): Promise<void> {
    validarPathspecs(pastas);
    await mkdir(dirname(this.opcoes.diretorio), { recursive: true });
    let resultado: ResultadoProcesso;
    try {
      resultado = await executar(
        this.opcoes.binario,
        argumentosDeClone(this.opcoes.remoto, this.opcoes.ramo, this.opcoes.diretorio),
        { ambiente: this.ambiente },
      );
    } catch (erro) {
      throw this.erroDeGit(erro, 'clone');
    }
    if (resultado.codigo !== 0) {
      throw new ErroLeis(
        'sincronizacao',
        `git clone falhou: ${resultado.erro.trim().slice(0, 500)}`,
        'Confira a rede e LEIS_REMOTO. Apague a pasta LEIS_CLONE se um clone anterior ficou pela metade.',
      );
    }
    await this.definirPastas(pastas);
  }

  async definirPastas(pastas: readonly string[]): Promise<void> {
    validarPathspecs(pastas);
    const entrada = pastas.length > 0 ? `${pastas.join('\n')}\n` : '';
    await this.git(['sparse-checkout', 'set', '--cone', '--stdin'], entrada);
  }

  async atualizar(): Promise<void> {
    await this.git(['pull', '--ff-only', '--no-rebase', '--no-tags', 'origin', this.opcoes.ramo]);
  }

  async head(): Promise<string> {
    const commit = (await this.git(['rev-parse', 'HEAD'])).trim();
    validarCommit(commit);
    return commit;
  }

  async temCommit(commit: string): Promise<boolean> {
    if (!COMMIT.test(commit)) return false;
    try {
      const resultado = await executar(this.opcoes.binario, [...this.base(), 'cat-file', '-e', `${commit}^{commit}`], {
        ambiente: this.ambiente,
      });
      return resultado.codigo === 0;
    } catch {
      return false;
    }
  }

  async *mudancas(de: string, ate: string, pathspecs: readonly string[]): AsyncIterable<Mudanca> {
    validarCommit(de);
    validarCommit(ate);
    validarPathspecs(pathspecs);
    const argumentos = [...this.base(), 'diff', '--name-status', '--no-renames', '-z', de, ate, '--', ...pathspecs];
    let status: string | null = null;
    try {
      for await (const parte of fluxo(this.opcoes.binario, argumentos, { ambiente: this.ambiente, separador: '\0' })) {
        if (status === null) {
          status = parte;
          continue;
        }
        const letra = status.charAt(0);
        status = null;
        if (letra === 'D') yield { status: 'D', caminho: parte };
        else if (letra === 'A') yield { status: 'A', caminho: parte };
        else if (letra === 'M' || letra === 'T') yield { status: 'M', caminho: parte };
      }
    } catch (erro) {
      throw this.erroDeGit(erro, 'diff');
    }
  }

  async *arquivos(commit: string, pathspecs: readonly string[]): AsyncIterable<string> {
    validarCommit(commit);
    validarPathspecs(pathspecs);
    const argumentos = [...this.base(), 'ls-tree', '-r', '-z', '--name-only', commit, '--', ...pathspecs];
    try {
      yield* fluxo(this.opcoes.binario, argumentos, { ambiente: this.ambiente, separador: '\0' });
    } catch (erro) {
      throw this.erroDeGit(erro, 'ls-tree');
    }
  }

  async *logAutoria(pathspecs: readonly string[], intervalo: string | null): AsyncIterable<string> {
    validarPathspecs(pathspecs);
    if (intervalo !== null && !/^[0-9a-f]{7,64}\.\.[0-9a-f]{7,64}$/.test(intervalo)) {
      throw new ErroLeis('sincronizacao', `Intervalo inválido: "${intervalo}".`, 'Rode o sync de novo.');
    }
    const argumentos = [
      ...this.base(),
      'log',
      '--no-renames',
      '--diff-filter=A',
      // Lista todos os arquivos do commit, não só os do pathspec: assim um lote nunca parece um commit de uma norma.
      '--full-diff',
      '--grep=^Autoria:',
      `--format=${FORMATO_LOG_AUTORIA}`,
      '--name-only',
      ...(intervalo === null ? [] : [intervalo]),
      '--',
      ...pathspecs,
    ];
    try {
      yield* fluxo(this.opcoes.binario, argumentos, { ambiente: this.ambiente });
    } catch (erro) {
      throw this.erroDeGit(erro, 'log');
    }
  }
}
