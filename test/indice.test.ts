import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { montarConsultaFts } from '../src/core/consulta-fts.js';
import type { FiltroNormas } from '../src/core/tipos.js';
import { AUTORIAS_DE_TESTE, CAMINHO_CDC, CAMINHO_SP_1880, criarIndiceDasFixtures, registrosDasFixtures, type IndiceDeTeste } from './apoio.js';

function fts(texto: string, colunas: readonly string[] = ['titulo', 'ementa']): string {
  const consulta = montarConsultaFts(texto, colunas);
  if (consulta === null) throw new Error(`consulta vazia: ${texto}`);
  return consulta.expressao;
}

describe('índice SQLite FTS5', () => {
  let teste: IndiceDeTeste;
  beforeAll(() => {
    teste = criarIndiceDasFixtures({ autorias: AUTORIAS_DE_TESTE });
  });
  afterAll(() => teste.fechar());

  const buscar = (texto: string | null, filtro: FiltroNormas = {}): string[] =>
    teste.indice
      .buscar({ fts: texto === null ? null : fts(texto), filtro, limite: 50, deslocamento: 0 })
      .map((norma) => norma.caminho);

  it('indexa só as normas e ignora as pastas que começam com "_"', () => {
    expect(teste.indice.contarNormas()).toBe(14);
    expect(teste.indice.porCaminho('municipais/_fonte/ignorado.md')).toBeNull();
  });

  it('busca no título e na ementa sem considerar acentos', () => {
    expect(buscar('consumidor')).toEqual([CAMINHO_CDC]);
    expect(buscar('protecao')).toContain(CAMINHO_CDC);
    expect(buscar('8078').sort()).toEqual([CAMINHO_CDC, 'estaduais/SP/leis-ordinarias/1990/lei-8078-1990-12-01-id900001.md'].sort());
  });

  it('aplica os filtros de metadados', () => {
    expect(buscar(null, { uf: 'SP' })).toHaveLength(3);
    expect(buscar(null, { esfera: 'estaduais', uf: 'SP' })).toHaveLength(2);
    expect(buscar(null, { tipoChave: 'leis-ordinarias' })).toHaveLength(7);
    expect(buscar(null, { dataDe: '1990-01-01', dataAte: '1990-12-31' })).toHaveLength(3);
    expect(buscar(null, { revogada: false })).toHaveLength(7);
    expect(buscar(null, { orgao: 'rfb' })).toEqual(['reguladores/rfb/2014/rfb-sijut-50055.md']);
    expect(buscar(null, { tribunal: 'stj' })).toEqual(['jurisprudencia/stj/sumulas/sumula-7.md']);
  });

  it('marca OCR, texto ausente, tachado e chave de tipo', () => {
    expect(teste.indice.porCaminho('estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md')?.ocr).toBe(true);
    expect(teste.indice.porCaminho('tratados/oit/C100.md')?.ocr).toBe(true);
    expect(teste.indice.porCaminho('estaduais/RS/leis-ordinarias/1950/lei-1-1950-id1.md')).toMatchObject({ semTexto: true, ano: 1950 });
    expect(teste.indice.porCaminho(CAMINHO_CDC)).toMatchObject({ temTachado: true, ocr: false, numeroNormalizado: '8078' });
    expect(teste.indice.porCaminho('reguladores/rfb/2014/rfb-sijut-50055.md')?.tipoChave).toBe('instrucoes-normativas');
    expect(teste.indice.porCaminho('constituicao.md')).toMatchObject({ tipoChave: 'constituicao', data: '1988-10-05' });
  });

  it('acha por referência e por URN', () => {
    const achadas = teste.indice.porReferencia({
      pastas: ['leis-ordinarias', 'leis-promulgadas'],
      numero: '8078',
      anos: [1990],
      data: null,
      esfera: null,
      uf: null,
      tribunal: null,
      limite: 20,
    });
    expect(achadas.map((norma) => norma.esfera)).toEqual(['federal', 'estaduais']);
    expect(teste.indice.porUrn('urn:lex:br:federal:lei:1990-09-11;8078').map((norma) => norma.caminho)).toEqual([CAMINHO_CDC]);
  });

  it('conta por dimensão', () => {
    const ufs = teste.indice.facetas({ dimensao: 'uf', fts: null, filtro: {}, limite: 10 });
    expect(ufs[0]).toEqual({ valor: 'SP', quantidade: 3 });
    const decadas = teste.indice.facetas({ dimensao: 'decada', fts: null, filtro: {}, limite: 20 });
    expect(decadas.find((contagem) => contagem.valor === '1990')).toMatchObject({ quantidade: 3, rotulo: '1990 a 1999' });
  });

  it('liga a autoria pelo caminho e, quando o caminho mudou, pela fonte', () => {
    expect(teste.indice.autoriaDe(CAMINHO_CDC)).toMatchObject({ autor: 'Fernando Collor', coautores: ['Fulana de Tal'] });
    expect(teste.indice.autoriaDe(CAMINHO_SP_1880)?.autor).toBe('Estado de São Paulo');
    const doSignatario = teste.indice.normasDoSignatario({ nome: 'fernando collor', limite: 10, deslocamento: 0 });
    expect(doSignatario).toMatchObject({ nome: 'Fernando Collor', total: 1 });
    expect(teste.indice.signatariosParecidos('Collor', 5)).toEqual(['Fernando Collor']);
  });

  it('mostra o estado do índice', () => {
    expect(teste.indice.estado()).toMatchObject({ commit: 'a'.repeat(40), total: 14, corpo: ['constituicao', 'federal'] });
    expect(teste.indice.arquivosDeFalhas()).toEqual(['estaduais/SP/_falhas.jsonl']);
  });
});

describe('escrita idempotente do índice', () => {
  let teste: IndiceDeTeste;
  beforeAll(() => {
    teste = criarIndiceDasFixtures();
  });
  afterAll(() => teste.fechar());

  it('regravar não duplica normas nem linhas do FTS5', () => {
    teste.indice.gravarNormas(registrosDasFixtures(['constituicao', 'federal']));
    expect(teste.indice.contarNormas()).toBe(14);
    expect(teste.indice.buscar({ fts: fts('consumidor'), filtro: {}, limite: 10, deslocamento: 0 })).toHaveLength(1);
  });

  it('busca no corpo indexado', () => {
    const caminhos = teste.indice
      .buscar({ fts: fts('probidade', []), filtro: {}, limite: 10, deslocamento: 0 })
      .map((norma) => norma.caminho);
    expect(caminhos).toEqual(['federal/leis-ordinarias/2002/lei-10406-2002-01-10.md']);
  });

  it('mantém as falhas permitidas fora do escopo, conta a autoria e poda signatários sem autoria', () => {
    const outro = criarIndiceDasFixtures({ autorias: AUTORIAS_DE_TESTE });
    try {
      expect(outro.indice.contarComAutoria()).toBe(2);
      outro.indice.removerForaDoEscopo(['federal'], ['estaduais/SP/_falhas.jsonl']);
      expect(outro.indice.arquivosDeFalhas()).toEqual(['estaduais/SP/_falhas.jsonl']);
      expect(outro.indice.contarComAutoria()).toBe(1);
      expect(outro.indice.podarSignatarios()).toBe(1);
      expect(outro.indice.signatariosParecidos('Estado de São Paulo', 5)).toEqual([]);
      expect(outro.indice.podarSignatarios()).toBe(0);
    } finally {
      outro.fechar();
    }
  });

  it('remove normas e tudo fora do escopo', () => {
    expect(teste.indice.removerNormas(['federal/medidas-provisorias/2001/mpv-2200-2-2001-08-24.md'])).toBe(1);
    expect(teste.indice.contarNormas()).toBe(13);
    expect(teste.indice.removerForaDoEscopo(['federal'])).toBe(11);
    expect(teste.indice.contarNormas()).toBe(2);
    expect(teste.indice.arquivosDeFalhas()).toEqual([]);
    expect(teste.indice.buscar({ fts: fts('consumidor'), filtro: {}, limite: 10, deslocamento: 0 })).toHaveLength(1);
  });
});
