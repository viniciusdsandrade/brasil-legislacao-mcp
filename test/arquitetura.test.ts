import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { criarLog } from '../src/log.js';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function arquivos(pasta: string): Array<{ relativo: string; texto: string }> {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((caminho) => caminho.endsWith('.ts'))
    .map((caminho) => ({ relativo: caminho.split(sep).join('/'), texto: readFileSync(join(pasta, caminho), 'utf8') }));
}

describe('arquitetura hexagonal', () => {
  it('o núcleo não depende de MCP, SQLite, git, sistema de arquivos nem adaptadores', () => {
    for (const { relativo, texto } of arquivos(join(SRC, 'core'))) {
      expect(texto, relativo).not.toMatch(/from '@modelcontextprotocol\//);
      expect(texto, relativo).not.toMatch(/from 'better-sqlite3'/);
      expect(texto, relativo).not.toMatch(/from 'node:(child_process|fs|fs\/promises|net|http|https)'/);
      expect(texto, relativo).not.toMatch(/from '\.\.\/(adaptadores|cli|config|log)/);
    }
  });

  it('só o adaptador MCP e a CLI importam o SDK', () => {
    for (const { relativo, texto } of arquivos(SRC)) {
      if (/from '@modelcontextprotocol\//.test(texto)) {
        expect(relativo.startsWith('adaptadores/mcp/') || relativo === 'cli.ts', relativo).toBe(true);
      }
    }
  });

  it('não escreve no stdout com console.log', () => {
    for (const { relativo, texto } of arquivos(SRC)) {
      expect(texto, relativo).not.toMatch(/console\.(log|info|debug)\(/);
    }
  });

  it('o log vai para a saída de erro e respeita o nível', () => {
    const linhas: string[] = [];
    const log = criarLog('aviso', { write: (texto: string) => linhas.push(texto) });
    log.info('não aparece');
    log.aviso('aparece', { chave: 1 });
    expect(linhas).toEqual(['[leis-mcp] aviso: aparece {"chave":1}\n']);
  });
});
