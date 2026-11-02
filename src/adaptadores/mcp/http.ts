import { createServer } from 'node:http';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';
import type { Log } from '../../log.js';

/** Caminho do endpoint MCP. */
export const CAMINHO_MCP = '/mcp';
/** O transporte HTTP só escuta em endereço local: não há autenticação. */
export const HOSTS_LOCAIS: readonly string[] = ['127.0.0.1', '::1', 'localhost'];

export interface ServidorHttpMcp {
  /** URL do endpoint MCP, por exemplo http://127.0.0.1:3920/mcp. */
  url: string;
  fechar(): Promise<void>;
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

/**
 * Serve o MCP por Streamable HTTP em CAMINHO_MCP, só em endereço local. Cada requisição usa
 * uma instância nova do servidor MCP, sobre o mesmo serviço e o mesmo índice. Os cabeçalhos
 * Host e Origin passam pela validação contra DNS rebinding antes do SDK.
 */
export async function servirHttp(
  fabrica: () => McpServer,
  opcoes: { host: string; porta: number; log: Log },
): Promise<ServidorHttpMcp> {
  if (!HOSTS_LOCAIS.includes(opcoes.host)) {
    throw new Error(`O transporte HTTP escuta só em endereço local (${HOSTS_LOCAIS.join(', ')}), não em "${opcoes.host}".`);
  }
  const manipulador = createMcpHandler(() => fabrica());
  const tratar = toNodeHandler(manipulador, {
    onerror: (erro) => opcoes.log.erro('erro no transporte HTTP', { erro: erro.message }),
  });
  const hostValido = localhostHostValidation();
  const origemValida = localhostOriginValidation();
  const servidor = createServer((pedido, resposta) => {
    const caminho = new URL(pedido.url ?? '/', 'http://localhost').pathname;
    if (caminho !== CAMINHO_MCP) {
      resposta.writeHead(404, { 'content-type': 'application/json' });
      resposta.end(JSON.stringify({ erro: `Caminho desconhecido. Use ${CAMINHO_MCP}.` }));
      return;
    }
    if (!hostValido(pedido, resposta) || !origemValida(pedido, resposta)) return;
    tratar(pedido, resposta).catch((erro: unknown) => opcoes.log.erro('erro no transporte HTTP', { erro: mensagemDeErro(erro) }));
  });
  await new Promise<void>((resolver, rejeitar) => {
    servidor.once('error', rejeitar);
    servidor.listen(opcoes.porta, opcoes.host, () => {
      servidor.off('error', rejeitar);
      resolver();
    });
  });
  const endereco = servidor.address();
  if (endereco === null || typeof endereco === 'string') throw new Error('O servidor HTTP não informou a porta.');
  const host = endereco.family === 'IPv6' ? `[${endereco.address}]` : endereco.address;
  return {
    url: `http://${host}:${endereco.port}${CAMINHO_MCP}`,
    fechar: async () => {
      await manipulador.close();
      await new Promise<void>((resolver) => {
        servidor.close(() => resolver());
        servidor.closeAllConnections();
      });
    },
  };
}
