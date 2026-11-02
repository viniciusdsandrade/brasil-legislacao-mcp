import { request } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { servirHttp, type ServidorHttpMcp } from '../src/adaptadores/mcp/http.js';
import { criarServidorMcp } from '../src/adaptadores/mcp/servidor.js';
import { criarLog } from '../src/log.js';
import { CAMINHO_CDC, criarIndiceDasFixtures, servicoDasFixtures, type IndiceDeTeste } from './apoio.js';

/** POST cru com cabeçalhos escolhidos, para testar a validação de Host e Origin. */
function postarCom(url: string, cabecalhos: Record<string, string>): Promise<number> {
  const alvo = new URL(url);
  return new Promise((resolver, rejeitar) => {
    const pedido = request(
      {
        hostname: alvo.hostname,
        port: alvo.port,
        path: alvo.pathname,
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...cabecalhos },
      },
      (resposta) => {
        resposta.resume();
        resolver(resposta.statusCode ?? 0);
      },
    );
    pedido.on('error', rejeitar);
    pedido.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
  });
}

describe('transporte Streamable HTTP', () => {
  let teste: IndiceDeTeste;
  let servidor: ServidorHttpMcp;
  let cliente: Client;

  beforeAll(async () => {
    teste = criarIndiceDasFixtures();
    const log = criarLog('erro', { write: () => true });
    const servico = servicoDasFixtures(teste.indice);
    servidor = await servirHttp(() => criarServidorMcp(servico, { versao: '0.0.0-teste', log }), { host: '127.0.0.1', porta: 0, log });
    cliente = new Client({ name: 'teste-http', version: '0.0.0' });
    await cliente.connect(new StreamableHTTPClientTransport(new URL(servidor.url)));
  });

  afterAll(async () => {
    await cliente.close();
    await servidor.fechar();
    teste.fechar();
  });

  it('escuta em endereço local, no caminho /mcp', () => {
    expect(servidor.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });

  it('lista as ferramentas e responde a uma busca', async () => {
    const { tools } = await cliente.listTools();
    expect(tools.map((ferramenta) => ferramenta.name)).toContain('leis_buscar');
    const resultado = await cliente.callTool({ name: 'leis_buscar', arguments: { texto: 'consumidor' } });
    expect(resultado.isError).not.toBe(true);
    expect(JSON.stringify(resultado.structuredContent)).toContain(CAMINHO_CDC);
  });

  it('recusa Host e Origin que não são locais', async () => {
    expect(await postarCom(servidor.url, { host: 'exemplo.invalid' })).toBe(403);
    expect(await postarCom(servidor.url, { origin: 'http://exemplo.invalid' })).toBe(403);
  });

  it('responde 404 fora do caminho /mcp', async () => {
    const resposta = await fetch(servidor.url.replace(/\/mcp$/, '/outro'));
    expect(resposta.status).toBe(404);
  });

  it('não escuta em endereço que não é local', async () => {
    const log = criarLog('erro', { write: () => true });
    await expect(servirHttp(() => criarServidorMcp(servicoDasFixtures(teste.indice), { versao: '0', log }), { host: '0.0.0.0', porta: 0, log })).rejects.toThrow(
      /endereço local/,
    );
  });
});
