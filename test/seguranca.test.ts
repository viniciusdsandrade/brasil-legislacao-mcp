import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { AcervoLocal } from '../src/adaptadores/acervo-local.js';
import { argumentosDeClone } from '../src/adaptadores/git.js';
import { argumentosRipgrep } from '../src/adaptadores/ripgrep.js';
import { normalizarEscopo, validarCaminho } from '../src/core/caminho.js';
import { montarConsultaFts } from '../src/core/consulta-fts.js';
import { ErroLeis } from '../src/core/erros.js';
import { lerConfiguracao } from '../src/config.js';

describe('caminhos', () => {
  it.each([
    '../x.md',
    '/etc/passwd.md',
    'federal/../../x.md',
    'federal/leis-ordinarias/1990/..%2F..%2Fx.md',
    'federal\\leis-ordinarias\\x.md',
    'federal/_fonte/1990/x.md',
    'federal/.git/1990/x.md',
    'federal/leis-ordinarias/1990/x.txt',
    '',
    'README.md',
  ])('recusa %s', (caminho) => {
    expect(validarCaminho(caminho)).toBeNull();
  });

  it('aceita o caminho de uma norma', () => {
    expect(validarCaminho('federal/leis-ordinarias/1990/lei-8078-1990-09-11.md')).toBe(
      'federal/leis-ordinarias/1990/lei-8078-1990-09-11.md',
    );
    expect(validarCaminho('constituicao.md')).toBe('constituicao.md');
  });

  it('não segue link simbólico para fora do clone', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'leis-mcp-raiz-'));
    const fora = mkdtempSync(join(tmpdir(), 'leis-mcp-fora-'));
    try {
      writeFileSync(join(fora, 'segredo.md'), 'segredo');
      mkdirSync(join(raiz, 'federal/leis-ordinarias/2000'), { recursive: true });
      symlinkSync(join(fora, 'segredo.md'), join(raiz, 'federal/leis-ordinarias/2000/lei-1-2000-01-01.md'));
      await expect(new AcervoLocal(raiz).ler('federal/leis-ordinarias/2000/lei-1-2000-01-01.md')).rejects.toMatchObject({
        codigo: 'caminho_invalido',
      });
    } finally {
      rmSync(raiz, { recursive: true, force: true });
      rmSync(fora, { recursive: true, force: true });
    }
  });
});

describe('subprocessos', () => {
  it('ripgrep: sem configuração, sem --pre e com o padrão depois de --', () => {
    const argumentos = argumentosRipgrep('-e --pre=sh', ['federal']);
    const separador = argumentos.indexOf('--');
    expect(argumentos).toContain('--no-config');
    expect(argumentos.slice(0, separador).some((argumento) => argumento.startsWith('--pre'))).toBe(false);
    expect(argumentos[separador + 1]).toBe('-e --pre=sh');
    expect(argumentos.slice(separador + 2)).toEqual(['federal']);
  });

  it('git clone: o remoto e a pasta vêm depois de --', () => {
    const argumentos = argumentosDeClone('--upload-pack=x', 'main', 'destino');
    const separador = argumentos.indexOf('--');
    expect(argumentos.slice(separador + 1)).toEqual(['--upload-pack=x', 'destino']);
    expect(argumentos).toContain('--filter=blob:none');
    expect(argumentos).toContain('--sparse');
  });

  it('configuração recusa valores que parecem opções', () => {
    expect(() => lerConfiguracao({ LEIS_REMOTO: '--upload-pack=x' })).toThrow(ErroLeis);
    expect(() => lerConfiguracao({ LEIS_RAMO: 'main;rm' })).toThrow(ErroLeis);
    expect(() => lerConfiguracao({ LEIS_ESCOPO: 'federal/../x' })).toThrow(ErroLeis);
  });
});

describe('FTS5', () => {
  it('nenhuma entrada do usuário quebra a expressão MATCH', () => {
    const db = new Database(':memory:');
    try {
      db.exec("CREATE VIRTUAL TABLE t USING fts5(titulo, ementa, corpo, tokenize='unicode61 remove_diacritics 2')");
      db.prepare('INSERT INTO t (titulo, ementa, corpo) VALUES (?, ?, ?)').run('Lei do consumidor', 'proteção', 'texto');
      const consulta = db.prepare<[string], { rowid: number }>('SELECT rowid FROM t WHERE t MATCH ?');
      const hostis = ['") OR 1=1 --', 'titulo:abc', 'NEAR(a b)', '*', '"', '-abc', 'abc OR def', '{titulo} : x', '^abc', 'consumidor AND NOT x'];
      for (const entrada of hostis) {
        for (const colunas of [[], ['titulo', 'ementa']]) {
          const fts = montarConsultaFts(entrada, colunas);
          if (fts === null) continue;
          expect(() => consulta.all(fts.expressao)).not.toThrow();
        }
      }
      const achados = consulta.all(montarConsultaFts('protecao consumidor')?.expressao ?? '');
      expect(achados).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('o escopo só aceita esferas e pastas do acervo', () => {
    for (const entrada of ['../x', 'federal/../x', '-x', 'constituicao/x', 'scripts']) {
      expect(() => normalizarEscopo([entrada])).toThrow(ErroLeis);
    }
  });
});
