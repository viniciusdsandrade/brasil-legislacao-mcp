import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AcervoLocal } from '../src/adaptadores/acervo-local.js';
import { RipgrepLocal } from '../src/adaptadores/ripgrep.js';
import { abrirIndiceEscrita, type IndiceSqlite } from '../src/adaptadores/sqlite/indice.js';
import { escopoCobre } from '../src/core/caminho.js';
import { registroDaNorma } from '../src/core/indexacao.js';
import { ServicoLeis } from '../src/core/servico.js';
import { VERSAO_ESQUEMA } from '../src/core/sincronizacao.js';
import type { RegistroAutoria, RegistroNorma } from '../src/core/tipos.js';

export const PASTA_FIXTURES = fileURLToPath(new URL('./fixtures/acervo', import.meta.url));
export const ESCOPO_FIXTURES = ['constituicao', 'estaduais', 'federal', 'jurisprudencia', 'municipais', 'reguladores', 'tratados'];
export const CAMINHO_CDC = 'federal/leis-ordinarias/1990/lei-8078-1990-09-11.md';
export const CAMINHO_SP_1880 = 'estaduais/SP/leis-ordinarias/1880/lei-1-1880-02-25-id137931.md';

/** O ripgrep existe no CI. Sem ele, os testes de busca no corpo ficam de fora. */
export const temRipgrep = spawnSync('rg', ['--version'], { stdio: 'ignore' }).status === 0;

export const AUTORIAS_DE_TESTE: RegistroAutoria[] = [
  {
    commit: 'b'.repeat(40),
    autor: 'Fernando Collor',
    coautores: ['Fulana de Tal'],
    origem: 'assinatura no texto.',
    fonte: 'https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078',
    caminho: CAMINHO_CDC,
  },
  {
    commit: 'c'.repeat(40),
    autor: 'Estado de São Paulo',
    coautores: [],
    origem: 'signatário não identificado no texto; autoria institucional.',
    fonte: 'https://www.al.sp.gov.br/norma/137931',
    caminho: 'estaduais/SP/leis-ordinarias/sem-ano/lei-1-sem-ano-id137931.md',
  },
];

export function lerFixture(caminho: string): string {
  return readFileSync(join(PASTA_FIXTURES, caminho), 'utf8');
}

export function arquivosDasFixtures(): string[] {
  return readdirSync(PASTA_FIXTURES, { recursive: true, encoding: 'utf8' })
    .map((caminho) => caminho.split(sep).join('/'))
    .filter((caminho) => caminho.endsWith('.md') || caminho.endsWith('_falhas.jsonl'))
    .sort();
}

export function registrosDasFixtures(corpo: readonly string[]): RegistroNorma[] {
  const registros: RegistroNorma[] = [];
  for (const caminho of arquivosDasFixtures()) {
    if (!caminho.endsWith('.md')) continue;
    const registro = registroDaNorma(caminho, lerFixture(caminho), escopoCobre(corpo, caminho));
    if (registro !== null) registros.push(registro);
  }
  return registros;
}

export interface IndiceDeTeste {
  indice: IndiceSqlite;
  arquivo: string;
  fechar(): void;
}

/** Índice temporário montado das fixtures, sem git. */
export function criarIndiceDasFixtures(
  opcoes: { corpo?: readonly string[]; autorias?: readonly RegistroAutoria[] } = {},
): IndiceDeTeste {
  const pasta = mkdtempSync(join(tmpdir(), 'leis-mcp-indice-'));
  const arquivo = join(pasta, 'indice.sqlite');
  const indice = abrirIndiceEscrita(arquivo);
  const corpo = opcoes.corpo ?? ['constituicao', 'federal'];
  indice.gravarNormas(registrosDasFixtures(corpo));
  indice.registrarFalhas(arquivosDasFixtures().filter((caminho) => caminho.endsWith('_falhas.jsonl')));
  if (opcoes.autorias !== undefined) {
    indice.gravarAutoria(opcoes.autorias);
    indice.religarAutoria();
  }
  indice.gravarMeta({
    versao_esquema: String(VERSAO_ESQUEMA),
    commit: 'a'.repeat(40),
    sincronizado_em: '2026-11-02T12:00:00.000Z',
    escopo: JSON.stringify(ESCOPO_FIXTURES),
    corpo: JSON.stringify(corpo),
    remoto: 'file:///fixtures',
    ramo: 'main',
  });
  return {
    indice,
    arquivo,
    fechar: () => {
      indice.fechar();
      rmSync(pasta, { recursive: true, force: true });
    },
  };
}

export function servicoDasFixtures(indice: IndiceSqlite, orcamentoTokens?: number): ServicoLeis {
  return new ServicoLeis({
    indice: () => indice,
    acervo: new AcervoLocal(PASTA_FIXTURES),
    buscaTextual: new RipgrepLocal({ binario: 'rg', raiz: PASTA_FIXTURES }),
    orcamentoTokens,
  });
}
