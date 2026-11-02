import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarIndiceDasFixtures, PASTA_FIXTURES, type IndiceDeTeste } from './apoio.js';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

function ambienteComo(extra: Record<string, string>): Record<string, string> {
  const ambiente: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(process.env)) if (valor !== undefined) ambiente[chave] = valor;
  return { ...ambiente, LEIS_LOG: 'erro', ...extra };
}

async function conectar(extra: Record<string, string>): Promise<Client> {
  const transporte = new StdioClientTransport({
    command: process.execPath,
    args: [CLI],
    env: ambienteComo(extra),
    stderr: 'ignore',
  });
  const cliente = new Client({ name: 'teste-stdio', version: '0.0.0' });
  await cliente.connect(transporte);
  return cliente;
}

/** Usa o dist/cli.js do build, o mesmo arquivo que o npx executa. No CI o build roda antes dos testes. */
describe.skipIf(!existsSync(CLI))('servidor por stdio', () => {
  let teste: IndiceDeTeste;
  let semIndice: string;

  beforeAll(() => {
    teste = criarIndiceDasFixtures();
    semIndice = mkdtempSync(join(tmpdir(), 'leis-mcp-sem-indice-'));
  });

  afterAll(() => {
    teste.fechar();
    rmSync(semIndice, { recursive: true, force: true });
  });

  it('completa o handshake sem índice e devolve o próximo passo na chamada', async () => {
    const cliente = await conectar({ LEIS_INDICE: join(semIndice, 'indice.sqlite'), LEIS_CLONE: PASTA_FIXTURES });
    try {
      const { tools } = await cliente.listTools();
      expect(tools).toHaveLength(5);
      const resultado = await cliente.callTool({ name: 'leis_buscar', arguments: { texto: 'consumidor' } });
      expect(resultado.isError).toBe(true);
      expect(resultado.structuredContent).toMatchObject({
        erro: { codigo: 'indice_ausente', proximo_passo: expect.stringContaining('sync') },
      });
    } finally {
      await cliente.close();
    }
  });

  it('responde pelo stdio com o índice das fixtures', async () => {
    const cliente = await conectar({ LEIS_INDICE: teste.arquivo, LEIS_CLONE: PASTA_FIXTURES });
    try {
      const resultado = await cliente.callTool({ name: 'leis_obter', arguments: { referencia: 'CDC art. 49' } });
      expect(resultado.isError).toBeFalsy();
      expect(JSON.stringify(resultado.structuredContent)).toContain('prazo de 7 dias');
    } finally {
      await cliente.close();
    }
  });
});
