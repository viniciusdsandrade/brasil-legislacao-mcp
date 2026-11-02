import { ErroLeis } from '../core/erros.js';
import type { ArquivosEncontrados, BuscaTextual, OcorrenciaTexto } from '../core/portas.js';
import { ErroProcesso, fluxo } from './processo.js';

const ERRO_DO_RIPGREP = 2;

/** Recusa alvos que saem da raiz. Os alvos vêm do núcleo, mas a checagem fica também aqui. */
function validarAlvo(alvo: string): void {
  const invalido =
    alvo === '' ||
    alvo.startsWith('/') ||
    alvo.includes('\\') ||
    alvo.includes('\0') ||
    alvo.split('/').some((segmento) => segmento === '..' || segmento === '.');
  if (invalido) throw new ErroLeis('entrada_invalida', `Alvo inválido para a busca: "${alvo}".`, 'Corrija o filtro.');
}

/** Opções comuns: sem arquivo de configuração e sem pré-processador (`--pre` executa um comando). */
function opcoesComuns(): string[] {
  return ['--ignore-case', '--no-config', '--no-messages', '--max-filesize', '50M', '--glob', '*.md', '--glob', '!_*'];
}

/** Argumentos para listar os arquivos que casam, em ordem de caminho. O padrão e as pastas vêm depois de "--". */
export function argumentosRipgrepArquivos(padrao: string, pastas: readonly string[]): string[] {
  return ['--files-with-matches', '--null', '--sort', 'path', ...opcoesComuns(), '--', padrao, ...pastas];
}

/** Argumentos para ler os trechos em JSON. O padrão e os alvos vêm depois de "--". */
export function argumentosRipgrep(padrao: string, alvos: readonly string[], maxPorArquivo = 1): string[] {
  return [
    '--json',
    '--max-count',
    String(maxPorArquivo),
    '--max-columns',
    '500',
    '--max-columns-preview',
    ...opcoesComuns(),
    '--',
    padrao,
    ...alvos,
  ];
}

interface EventoRg {
  type?: unknown;
  data?: {
    path?: { text?: unknown };
    lines?: { text?: unknown };
    line_number?: unknown;
  };
}

function erroAusente(): ErroLeis {
  return new ErroLeis(
    'busca_textual_indisponivel',
    'O ripgrep (rg) não foi encontrado.',
    'Instale o ripgrep, informe o caminho em LEIS_RG, ou indexe o corpo com LEIS_CORPO e rode o comando sync do leis-mcp.',
  );
}

/** Arquivos por chamada quando os alvos são arquivos: mantém a linha de comando curta. */
const ALVOS_POR_CHAMADA = 500;

/** Busca no corpo dos arquivos do clone com o ripgrep, só nos alvos do filtro. */
export class RipgrepLocal implements BuscaTextual {
  constructor(private readonly opcoes: { binario: string; raiz: string; tempoMaximoMs?: number }) {}

  /**
   * Casa todos os padrões (AND): o primeiro padrão lê os alvos; cada padrão seguinte lê só
   * os arquivos que sobraram. A lista sai em ordem de caminho.
   */
  async arquivos(parametros: { padroes: readonly string[]; alvos: readonly string[]; maxArquivos: number }): Promise<ArquivosEncontrados> {
    parametros.alvos.forEach(validarAlvo);
    const [primeiro, ...resto] = parametros.padroes;
    if (primeiro === undefined || parametros.alvos.length === 0) return { caminhos: [], parcial: false };
    let atual = await this.listarEmLotes(primeiro, parametros.alvos, parametros.maxArquivos);
    for (const padrao of resto) {
      if (atual.caminhos.length === 0) break;
      const seguinte = await this.listarEmLotes(padrao, atual.caminhos, parametros.maxArquivos);
      atual = { caminhos: seguinte.caminhos, parcial: atual.parcial || seguinte.parcial };
    }
    return { caminhos: [...atual.caminhos].sort(), parcial: atual.parcial };
  }

  private async listarEmLotes(padrao: string, alvos: readonly string[], maxArquivos: number): Promise<ArquivosEncontrados> {
    const caminhos: string[] = [];
    let parcial = false;
    for (let i = 0; i < alvos.length && caminhos.length < maxArquivos; i += ALVOS_POR_CHAMADA) {
      const parte = await this.listar(padrao, alvos.slice(i, i + ALVOS_POR_CHAMADA), maxArquivos - caminhos.length);
      caminhos.push(...parte.caminhos);
      parcial = parcial || parte.parcial;
    }
    return { caminhos, parcial: parcial || caminhos.length >= maxArquivos };
  }

  private async listar(padrao: string, alvos: readonly string[], maxArquivos: number): Promise<ArquivosEncontrados> {
    const caminhos: string[] = [];
    let parcial = false;
    try {
      for await (const linha of fluxo(this.opcoes.binario, argumentosRipgrepArquivos(padrao, alvos), {
        cwd: this.opcoes.raiz,
        separador: '\0',
        codigosAceitos: [0, 1],
        tempoMaximoMs: this.opcoes.tempoMaximoMs ?? 60_000,
      })) {
        const caminho = linha.replace(/^\n+|\n+$/g, '');
        if (caminho === '') continue;
        caminhos.push(caminho);
        if (caminhos.length >= maxArquivos) {
          parcial = true;
          break;
        }
      }
    } catch (erro) {
      if (erro instanceof ErroProcesso && erro.ausente) throw erroAusente();
      if (erro instanceof ErroProcesso && erro.codigo === ERRO_DO_RIPGREP && caminhos.length > 0) return { caminhos, parcial: true };
      throw new ErroLeis(
        'busca_textual_indisponivel',
        `A busca no texto falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
        'Confira se as pastas do escopo estão no clone (rode o comando sync do leis-mcp), ou use alcance=cabecalho.',
      );
    }
    return { caminhos, parcial };
  }

  async trechos(parametros: { padroes: readonly string[]; caminhos: readonly string[] }): Promise<OcorrenciaTexto[]> {
    if (parametros.caminhos.length === 0 || parametros.padroes.length === 0) return [];
    parametros.caminhos.forEach(validarAlvo);
    const padrao = parametros.padroes.map((item) => `(?:${item})`).join('|');
    const ocorrencias: OcorrenciaTexto[] = [];
    try {
      for await (const linha of fluxo(this.opcoes.binario, argumentosRipgrep(padrao, parametros.caminhos), {
        cwd: this.opcoes.raiz,
        separador: '\n',
        codigosAceitos: [0, 1, ERRO_DO_RIPGREP],
        tempoMaximoMs: this.opcoes.tempoMaximoMs ?? 60_000,
      })) {
        let evento: EventoRg;
        try {
          evento = JSON.parse(linha) as EventoRg;
        } catch {
          continue;
        }
        if (evento.type !== 'match') continue;
        const caminho = evento.data?.path?.text;
        const trecho = evento.data?.lines?.text;
        const numero = evento.data?.line_number;
        if (typeof caminho !== 'string' || typeof trecho !== 'string' || typeof numero !== 'number') continue;
        ocorrencias.push({ caminho, linha: numero, trecho: trecho.replace(/\s+$/, '') });
      }
    } catch (erro) {
      if (erro instanceof ErroProcesso && erro.ausente) throw erroAusente();
      // O trecho é só ilustração: sem ele, o resultado continua válido.
      return ocorrencias;
    }
    return ocorrencias;
  }
}
