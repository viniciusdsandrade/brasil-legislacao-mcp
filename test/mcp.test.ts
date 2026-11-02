import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarServidorMcp } from '../src/adaptadores/mcp/servidor.js';
import { criarLog } from '../src/log.js';
import { CAMINHO_CDC, criarIndiceDasFixtures, servicoDasFixtures, type IndiceDeTeste } from './apoio.js';

const FERRAMENTAS = ['leis_autoria', 'leis_buscar', 'leis_cobertura', 'leis_facetas', 'leis_obter'];

describe('adaptador MCP', () => {
  let teste: IndiceDeTeste;
  let cliente: Client;

  beforeAll(async () => {
    teste = criarIndiceDasFixtures();
    const servidor = criarServidorMcp(servicoDasFixtures(teste.indice), {
      versao: '0.0.0-teste',
      log: criarLog('erro', { write: () => true }),
    });
    const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(ladoServidor);
    cliente = new Client({ name: 'teste', version: '0.0.0' });
    await cliente.connect(ladoCliente);
  });

  afterAll(async () => {
    await cliente.close();
    teste.fechar();
  });

  it('lista as cinco ferramentas com prefixo, dicas de leitura e esquemas planos', async () => {
    const { tools } = await cliente.listTools();
    expect(tools.map((ferramenta) => ferramenta.name).sort()).toEqual(FERRAMENTAS);
    for (const ferramenta of tools) {
      expect(ferramenta.annotations?.readOnlyHint).toBe(true);
      expect(ferramenta.annotations?.idempotentHint).toBe(true);
      expect(ferramenta.inputSchema.type).toBe('object');
      expect(JSON.stringify(ferramenta.inputSchema)).not.toMatch(/"(oneOf|anyOf|allOf|\$ref|\$defs)"/);
    }
  });

  it('envia instruções de uso com o aviso sobre o Diário Oficial', () => {
    expect(cliente.getInstructions()).toContain('leis_buscar');
    expect(cliente.getInstructions()).toContain('Diário Oficial');
  });

  it('devolve structuredContent e o mesmo JSON no texto', async () => {
    const resultado = await cliente.callTool({ name: 'leis_buscar', arguments: { texto: 'consumidor' } });
    expect(resultado.isError).toBeFalsy();
    const [bloco] = resultado.content ?? [];
    expect(bloco?.type).toBe('text');
    const textoDoBloco = bloco?.type === 'text' ? bloco.text : '';
    expect(JSON.parse(textoDoBloco)).toEqual(resultado.structuredContent);
    const itens = (resultado.structuredContent as { itens: Array<{ caminho: string }> }).itens;
    expect(itens.map((item) => item.caminho)).toEqual([CAMINHO_CDC]);
  });

  it('lê um dispositivo pela citação', async () => {
    const resultado = await cliente.callTool({ name: 'leis_obter', arguments: { referencia: 'CF art. 5º, XI' } });
    const dispositivo = (resultado.structuredContent as { dispositivo: { texto: string } }).dispositivo;
    expect(dispositivo.texto).toMatch(/^XI - a casa é asilo inviolável/);
  });

  it('devolve erro acionável, com o próximo passo', async () => {
    const resultado = await cliente.callTool({ name: 'leis_obter', arguments: { referencia: '../../etc/passwd.md' } });
    expect(resultado.isError).toBe(true);
    const erro = (resultado.structuredContent as { erro: { codigo: string; proximo_passo: string } }).erro;
    expect(erro.codigo).toBe('entrada_invalida');
    expect(erro.proximo_passo.length).toBeGreaterThan(10);
  });

  it('serve o template de recurso leis://{caminho}', async () => {
    const { resourceTemplates } = await cliente.listResourceTemplates();
    expect(resourceTemplates.map((modelo) => modelo.uriTemplate)).toContain('leis://{caminho}');
    const lido = await cliente.readResource({ uri: `leis://${encodeURIComponent(CAMINHO_CDC)}` });
    const [conteudo] = lido.contents;
    expect(conteudo !== undefined && 'text' in conteudo ? conteudo.text : '').toContain('# Lei nº 8.078 de 11/09/1990');
    await expect(cliente.readResource({ uri: `leis://${encodeURIComponent('federal/_fonte/x.md')}` })).rejects.toThrow();
  });
});
