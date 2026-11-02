import {
  fromJsonSchema,
  McpServer,
  ResourceNotFoundError,
  ResourceTemplate,
  type CallToolResult,
  type ReadResourceResult,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import { ehErroLeis, mensagemDe } from '../../core/erros.js';
import type {
  EntradaAutoria,
  EntradaBuscar,
  EntradaCobertura,
  EntradaFacetas,
  EntradaObter,
  ServicoLeis,
} from '../../core/servico.js';
import type { Log } from '../../log.js';
import { ESQUEMA_AUTORIA, ESQUEMA_BUSCAR, ESQUEMA_COBERTURA, ESQUEMA_FACETAS, ESQUEMA_OBTER } from './esquemas.js';

export const INSTRUCOES = [
  'Acervo local da legislação brasileira (viniciusdsandrade/leis), somente leitura.',
  'Fluxo: 1) leis_buscar acha normas por palavras e filtros (esfera, uf, municipio, orgao, tribunal, tipo, numero, datas, revogada); alcance=texto busca no corpo.',
  '2) leis_obter lê a norma ou um dispositivo (artigo, paragrafo, inciso, alinea). Aceita caminho, URN ou citação como "Lei 8.078/1990", "CF art. 5º, XI" ou "ADCT art. 10".',
  '3) Cite sempre o campo fonte e repasse os avisos: OCR, revogação, texto não compilado e tachado omitido.',
  'Resultado vazio não prova que a norma não existe: use leis_cobertura para ver o recorte do acervo local.',
  'leis_facetas conta normas por tipo, UF, órgão, tribunal, município e década. leis_autoria mostra os signatários da base inicial do histórico.',
  'O texto é informativo e não substitui a publicação no Diário Oficial.',
].join('\n');

const DICAS: ToolAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

/** Resultado com structuredContent e o mesmo JSON no bloco de texto. */
export function resultado(saida: Record<string, unknown>): CallToolResult {
  const texto = JSON.stringify(saida);
  return {
    content: [{ type: 'text', text: texto }],
    structuredContent: JSON.parse(texto) as Record<string, unknown>,
  };
}

/** Erro como resultado da ferramenta, com o próximo passo para o modelo. */
export function resultadoDeErro(erro: unknown): CallToolResult {
  const corpo = ehErroLeis(erro)
    ? {
        erro: {
          codigo: erro.codigo,
          mensagem: erro.message,
          proximo_passo: erro.proximoPasso,
          sugestoes: erro.sugestoes,
        },
      }
    : {
        erro: {
          codigo: 'interno',
          mensagem: mensagemDe(erro),
          proximo_passo: 'Tente de novo. Se o erro continuar, rode `npx leis-mcp status` e leia o log em stderr.',
          sugestoes: [],
        },
      };
  const texto = JSON.stringify(corpo);
  return {
    content: [{ type: 'text', text: texto }],
    structuredContent: JSON.parse(texto) as Record<string, unknown>,
    isError: true,
  };
}

export interface OpcoesServidorMcp {
  versao: string;
  log: Log;
}

/**
 * Cria o servidor MCP. É um adaptador fino: valida a entrada pelo esquema, chama o
 * serviço do núcleo e serializa a saída. Serve stdio agora e HTTP depois.
 */
export function criarServidorMcp(servico: ServicoLeis, opcoes: OpcoesServidorMcp): McpServer {
  const servidor = new McpServer({ name: 'leis-mcp', version: opcoes.versao }, { instructions: INSTRUCOES });
  const executar = async (nome: string, chamada: () => Promise<Record<string, unknown>>): Promise<CallToolResult> => {
    const inicio = Date.now();
    try {
      const saida = await chamada();
      opcoes.log.depuracao('ferramenta concluída', { ferramenta: nome, ms: Date.now() - inicio });
      return resultado(saida);
    } catch (erro) {
      if (!ehErroLeis(erro)) opcoes.log.erro('falha na ferramenta', { ferramenta: nome, erro: mensagemDe(erro) });
      return resultadoDeErro(erro);
    }
  };

  servidor.registerTool(
    'leis_buscar',
    {
      title: 'Buscar normas',
      description:
        'Busca normas no acervo local por palavras e filtros. Devolve itens compactos com caminho, título, tipo, número, data, UF, ementa, situação, fonte, versao_texto, baixado_em e marca de OCR. Use o cursor para a próxima página.',
      inputSchema: fromJsonSchema<EntradaBuscar>(ESQUEMA_BUSCAR),
      annotations: { ...DICAS, title: 'Buscar normas' },
    },
    async (entrada) => executar('leis_buscar', () => servico.buscar(entrada)),
  );

  servidor.registerTool(
    'leis_obter',
    {
      title: 'Ler norma ou dispositivo',
      description:
        'Lê uma norma por caminho, URN ou citação, inteira (paginada por artigo) ou só um dispositivo. Omite redações tachadas por padrão e avisa. Se a citação for ambígua, devolve candidatos.',
      inputSchema: fromJsonSchema<EntradaObter>(ESQUEMA_OBTER),
      annotations: { ...DICAS, title: 'Ler norma ou dispositivo' },
    },
    async (entrada) => executar('leis_obter', () => servico.obter(entrada)),
  );

  servidor.registerTool(
    'leis_facetas',
    {
      title: 'Contar normas',
      description: 'Conta normas por esfera, tipo, UF, órgão, tribunal, município e década, com os mesmos filtros de leis_buscar.',
      inputSchema: fromJsonSchema<EntradaFacetas>(ESQUEMA_FACETAS),
      annotations: { ...DICAS, title: 'Contar normas' },
    },
    async (entrada) => executar('leis_facetas', () => servico.facetas(entrada)),
  );

  servidor.registerTool(
    'leis_cobertura',
    {
      title: 'Cobertura do acervo',
      description:
        'Mostra as lacunas de um recorte (COBERTURA.md, PROGRESSO.md e _falhas.jsonl) e o estado do índice local: commit, data do sync, escopo e totais.',
      inputSchema: fromJsonSchema<EntradaCobertura>(ESQUEMA_COBERTURA),
      annotations: { ...DICAS, title: 'Cobertura do acervo' },
    },
    async (entrada) => executar('leis_cobertura', () => servico.cobertura(entrada)),
  );

  servidor.registerTool(
    'leis_autoria',
    {
      title: 'Autoria das normas',
      description:
        'Mostra quem assinou uma norma (autor, coautores e origem da autoria) ou lista as normas de um signatário. Vem da base inicial do histórico; as datas vêm do cabeçalho.',
      inputSchema: fromJsonSchema<EntradaAutoria>(ESQUEMA_AUTORIA),
      annotations: { ...DICAS, title: 'Autoria das normas' },
    },
    async (entrada) => executar('leis_autoria', () => servico.autoria(entrada)),
  );

  servidor.registerResource(
    'norma',
    new ResourceTemplate('leis://{caminho}', { list: undefined }),
    {
      title: 'Norma do acervo',
      description: 'Texto Markdown de uma norma. O caminho vai codificado, por exemplo leis://federal%2Fleis-ordinarias%2F1990%2Flei-8078-1990-09-11.md.',
      mimeType: 'text/markdown',
    },
    async (uri, variaveis): Promise<ReadResourceResult> => {
      const bruto = variaveis['caminho'];
      const valor = Array.isArray(bruto) ? bruto[0] : bruto;
      let caminho: string;
      try {
        caminho = decodeURIComponent(valor ?? '');
      } catch {
        throw new ResourceNotFoundError(uri.href, 'O caminho da URI não está codificado corretamente.');
      }
      try {
        const texto = await servico.lerRecurso(caminho);
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: texto }] };
      } catch (erro) {
        if (ehErroLeis(erro)) throw new ResourceNotFoundError(uri.href, `${erro.message} ${erro.proximoPasso}`);
        throw erro;
      }
    },
  );

  return servidor;
}
