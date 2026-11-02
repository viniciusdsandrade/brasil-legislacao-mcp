import { ErroLeis } from '../core/erros.js';
import type { BuscaTextual, OcorrenciaTexto } from '../core/portas.js';
import { ErroProcesso, fluxo } from './processo.js';

const PASTA = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/**
 * Argumentos do ripgrep. Sem arquivo de configuração e sem pré-processador (`--pre`
 * executa um comando). O padrão e as pastas vêm depois de "--".
 */
export function argumentosRipgrep(padrao: string, pastas: readonly string[], maxPorArquivo = 3): string[] {
  return [
    '--json',
    '--ignore-case',
    '--no-config',
    '--no-messages',
    '--max-count',
    String(maxPorArquivo),
    '--max-columns',
    '500',
    '--max-columns-preview',
    '--max-filesize',
    '50M',
    '--glob',
    '*.md',
    '--glob',
    '!_*',
    '--',
    padrao,
    ...pastas,
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

/** Busca no corpo dos arquivos do clone com o ripgrep, só nas pastas do filtro. */
export class RipgrepLocal implements BuscaTextual {
  constructor(private readonly opcoes: { binario: string; raiz: string; tempoMaximoMs?: number }) {}

  async buscar(parametros: { padrao: string; pastas: readonly string[]; maxArquivos: number }): Promise<OcorrenciaTexto[]> {
    for (const pasta of parametros.pastas) {
      if (!PASTA.test(pasta) || pasta.split('/').includes('..')) {
        throw new ErroLeis('entrada_invalida', `Pasta inválida para a busca: "${pasta}".`, 'Corrija o filtro.');
      }
    }
    const ocorrencias: OcorrenciaTexto[] = [];
    const vistos = new Set<string>();
    try {
      for await (const linha of fluxo(this.opcoes.binario, argumentosRipgrep(parametros.padrao, parametros.pastas), {
        cwd: this.opcoes.raiz,
        separador: '\n',
        codigosAceitos: [0, 1, 2],
        tempoMaximoMs: this.opcoes.tempoMaximoMs ?? 30_000,
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
        if (vistos.has(caminho)) continue;
        vistos.add(caminho);
        ocorrencias.push({ caminho, linha: numero, trecho: trecho.replace(/\s+$/, '') });
        if (vistos.size >= parametros.maxArquivos) break;
      }
    } catch (erro) {
      if (erro instanceof ErroProcesso && erro.ausente) {
        throw new ErroLeis(
          'busca_textual_indisponivel',
          'O ripgrep (rg) não foi encontrado.',
          'Instale o ripgrep, informe o caminho em LEIS_RG, ou indexe o corpo com LEIS_CORPO e rode `npx leis-mcp sync`.',
        );
      }
      throw new ErroLeis('busca_textual_indisponivel', `A busca no texto falhou: ${erro instanceof Error ? erro.message : String(erro)}`, 'Tente uma busca com alcance=cabecalho.');
    }
    return ocorrencias;
  }
}
