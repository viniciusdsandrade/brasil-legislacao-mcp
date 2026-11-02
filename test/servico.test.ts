import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AcervoLocal } from '../src/adaptadores/acervo-local.js';
import type { BuscaTextual } from '../src/core/portas.js';
import { AVISO_AUSENCIA, ServicoLeis, pastasDaBuscaTextual } from '../src/core/servico.js';
import {
  AUTORIAS_DE_TESTE,
  CAMINHO_CDC,
  ESCOPO_FIXTURES,
  PASTA_FIXTURES,
  criarIndiceDasFixtures,
  servicoDasFixtures,
  temRipgrep,
  type IndiceDeTeste,
} from './apoio.js';

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error('não é objeto');
  return valor as Objeto;
}

function lista(valor: unknown): Objeto[] {
  if (!Array.isArray(valor)) throw new Error('não é lista');
  return valor.map(objeto);
}

function texto(valor: unknown): string {
  if (typeof valor !== 'string') throw new Error('não é texto');
  return valor;
}

describe('serviço de consulta', () => {
  let teste: IndiceDeTeste;
  beforeAll(() => {
    teste = criarIndiceDasFixtures({ autorias: AUTORIAS_DE_TESTE });
  });
  afterAll(() => teste.fechar());

  describe('leis_buscar', () => {
    it('devolve itens compactos com fonte, versão do texto, data da captura e marca de OCR', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'consumidor' });
      expect(resposta['motor']).toBe('fts5');
      const [item] = lista(resposta['itens']);
      expect(item).toMatchObject({
        caminho: CAMINHO_CDC,
        tipo: 'Lei Ordinária',
        numero: '8078',
        data: '1990-09-11',
        fonte: 'https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078',
        versao_texto: 'compilada (texto vigente)',
        baixado_em: '2026-10-13',
        ocr: false,
      });
      expect(item).not.toHaveProperty('uf');
      expect(item).not.toHaveProperty('uri');
    });

    it('formato completo traz todos os metadados e a URI do recurso', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'consumidor', formato: 'completo' });
      const [item] = lista(resposta['itens']);
      expect(item).toMatchObject({ uri: `leis://${encodeURIComponent(CAMINHO_CDC)}`, esfera: 'federal', tem_tachado: true });
    });

    it('pagina com cursor e recusa cursor de outra consulta', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const primeira = await servico.buscar({ tipo: 'lei', limite: 2 });
      const cursor = texto(primeira['cursor']);
      const segunda = await servico.buscar({ tipo: 'lei', limite: 2, cursor });
      const caminhosPrimeira = lista(primeira['itens']).map((item) => item['caminho']);
      const caminhosSegunda = lista(segunda['itens']).map((item) => item['caminho']);
      expect(caminhosPrimeira).toHaveLength(2);
      expect(caminhosSegunda).toHaveLength(2);
      expect(caminhosSegunda.some((caminho) => caminhosPrimeira.includes(caminho))).toBe(false);
      expect(primeira['total']).toBe(7);
      await expect(servico.buscar({ tipo: 'decreto', cursor })).rejects.toMatchObject({ codigo: 'cursor_invalido' });
    });

    it('resultado vazio informa a cobertura do recorte', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'inexistentexyz', esfera: 'estaduais', uf: 'SP' });
      expect(resposta['itens']).toEqual([]);
      expect(texto(resposta['mensagem'])).toContain(AVISO_AUSENCIA);
      expect(objeto(resposta['cobertura'])).toMatchObject({ recorte: 'estaduais/SP', recorte_no_escopo: true, normas_no_recorte: 2 });
    });

    it('busca no corpo indexado com FTS5', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'asilo inviolável', alcance: 'texto', esfera: 'constituicao' });
      expect(resposta['motor']).toBe('fts5');
      expect(lista(resposta['itens']).map((item) => item['caminho'])).toEqual(['constituicao.md']);
    });

    it.skipIf(!temRipgrep)('busca no corpo com ripgrep nas pastas do filtro quando o corpo não está no índice', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'combustores', alcance: 'texto', esfera: 'estaduais', uf: 'SP' });
      expect(resposta['motor']).toBe('ripgrep');
      const [item] = lista(resposta['itens']);
      expect(item).toMatchObject({ caminho: 'estaduais/SP/leis-ordinarias/1880/lei-1-1880-02-25-id137931.md' });
      expect(texto(item?.['trecho'])).toContain('combustores');
    });

    it.skipIf(!temRipgrep)('com UF e sem esfera, a busca no texto inclui as normas municipais', async () => {
      const resposta = await servicoDasFixtures(teste.indice).buscar({ texto: 'Valinhos', alcance: 'texto', uf: 'SP' });
      expect(resposta['motor']).toBe('ripgrep');
      expect(lista(resposta['itens']).map((item) => item['caminho'])).toEqual([
        'municipais/SP/campinas/leis-ordinarias/1956/leis-ordinarias-1581-1956-sapl-15126.md',
      ]);
      expect(resposta['total_aproximado']).toBe(false);
    });

    it('a busca no texto procura nas pastas da esfera e da UF, não na pasta do tipo', () => {
      expect(pastasDaBuscaTextual(ESCOPO_FIXTURES, { uf: 'SP' })).toEqual(['estaduais/SP', 'municipais/SP']);
      expect(pastasDaBuscaTextual(['federal'], { esfera: 'federal', tipoChave: 'decretos' })).toEqual(['federal']);
      expect(pastasDaBuscaTextual(['federal'], { esfera: 'estaduais' })).toEqual([]);
    });

    it('marca o resultado como aproximado quando a busca no texto para no limite', async () => {
      const caminho = 'estaduais/SP/leis-ordinarias/1990/lei-8078-1990-12-01-id900001.md';
      const chamadas: string[][] = [];
      const busca: BuscaTextual = {
        arquivos: async ({ pastas }) => {
          chamadas.push([...pastas]);
          return { caminhos: [caminho], parcial: true };
        },
        trechos: async () => [{ caminho, linha: 3, trecho: 'texto achado' }],
      };
      const servico = new ServicoLeis({ indice: () => teste.indice, acervo: new AcervoLocal(PASTA_FIXTURES), buscaTextual: busca });
      const resposta = await servico.buscar({ texto: 'qualquer', alcance: 'texto', esfera: 'estaduais' });
      expect(resposta).toMatchObject({ motor: 'ripgrep', total: 1, total_aproximado: true });
      expect(resposta['avisos']).toEqual([expect.stringContaining('parou')]);
      expect(lista(resposta['itens'])[0]).toMatchObject({ caminho, trecho: 'texto achado' });
      // Poucas normas no filtro: a busca lê só os arquivos que o índice indica.
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0]?.every((alvo) => alvo.startsWith('estaduais/') && alvo.endsWith('.md'))).toBe(true);
    });

    it('corta os itens para caber no orçamento de tokens e devolve cursor', async () => {
      const resposta = await servicoDasFixtures(teste.indice, 500).buscar({ tipo: 'lei', limite: 50, formato: 'completo' });
      const itens = lista(resposta['itens']);
      expect(itens.length).toBeGreaterThan(0);
      expect(itens.length).toBeLessThan(7);
      expect(resposta['cursor']).not.toBeNull();
    });
  });

  describe('leis_obter', () => {
    it('lê um inciso pela citação, prefere a norma federal e omite o tachado com aviso', async () => {
      const resposta = await servicoDasFixtures(teste.indice).obter({ referencia: 'Lei 8.078/1990', artigo: '6', inciso: 'III' });
      expect(objeto(resposta['norma'])['caminho']).toBe(CAMINHO_CDC);
      const dispositivo = objeto(resposta['dispositivo']);
      expect(dispositivo['citacao']).toBe('art. 6º, III');
      expect(texto(dispositivo['texto'])).toContain('informação adequada e clara');
      expect(texto(dispositivo['texto'])).not.toContain('redação antiga');
      expect(texto(dispositivo['caput'])).toContain('São direitos básicos do consumidor');
      const avisos = (resposta['avisos'] as string[]).join(' ');
      expect(avisos).toContain('2 trecho(s) tachado(s) omitido(s)');
      expect(avisos).toContain('outra(s) norma(s) com o mesmo número');
    });

    it('mostra a redação tachada quando pedida, no artigo certo', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const comTachado = objeto((await servico.obter({ referencia: 'CDC art. 49', incluir_tachado: true }))['dispositivo']);
      expect(texto(comTachado['texto'])).toContain('cinco dias, na redação antiga');
      expect(texto(comTachado['texto'])).toContain('prazo de 7 dias');
      const semTachado = objeto((await servico.obter({ referencia: 'CDC art. 49' }))['dispositivo']);
      expect(texto(semTachado['texto'])).not.toContain('cinco dias');
      const artigo20 = objeto((await servico.obter({ referencia: CAMINHO_CDC, artigo: '20', incluir_tachado: true }))['dispositivo']);
      expect(texto(artigo20['texto'])).not.toContain('Art. 49');
    });

    it('lê a Constituição e o ADCT', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const casa = await servico.obter({ referencia: 'CF art. 5º, XI' });
      expect(objeto(resposta(casa)['dispositivo'])['texto']).toMatch(/^XI - a casa é asilo inviolável/);
      const adct = objeto((await servico.obter({ referencia: 'ADCT art. 10' }))['dispositivo']);
      expect(adct['bloco']).toBe('ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS');
      expect(texto(adct['texto'])).toMatch(/^\*\*Art\. 10\.\*\*/);
      const primeiro = await servico.obter({ referencia: 'constituicao.md', artigo: '1' });
      expect((primeiro['avisos'] as string[]).join(' ')).toContain('Há outro art. 1º');
    });

    it('desempata pela esfera e devolve erro acionável quando não acha', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const estadual = await servico.obter({ referencia: 'Lei 8.078/1990', esfera: 'estaduais' });
      expect(objeto(estadual['norma'])['uf']).toBe('SP');
      await expect(servico.obter({ referencia: 'Lei 99.999/2099' })).rejects.toMatchObject({
        codigo: 'nao_encontrada',
        proximoPasso: expect.stringContaining('leis_buscar'),
      });
      await expect(servico.obter({ referencia: 'xyz' })).rejects.toMatchObject({ codigo: 'entrada_invalida' });
    });

    it('avisa OCR e norma sem texto', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const ocr = await servico.obter({ referencia: 'estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md' });
      expect((ocr['avisos'] as string[]).join(' ')).toContain('OCR');
      expect(texto(ocr['texto'])).toContain('Art. 1o');
      expect(objeto(ocr['norma'])['ocr']).toBe(true);
      const vazia = await servico.obter({ referencia: 'estaduais/RS/leis-ordinarias/1950/lei-1-1950-id1.md' });
      expect(vazia['texto']).toBe('');
      expect((vazia['avisos'] as string[]).join(' ')).toContain('não disponibiliza o texto');
    });

    it('pagina a norma inteira por artigo dentro do orçamento', async () => {
      const servico = servicoDasFixtures(teste.indice, 500);
      const primeira = await servico.obter({ referencia: 'constituicao.md' });
      const pagina = objeto(primeira['pagina']);
      const cursor = texto(pagina['cursor']);
      expect(texto(primeira['texto']).length).toBeLessThanOrEqual(1_000);
      const segunda = await servico.obter({ referencia: 'constituicao.md', cursor });
      expect(segunda['texto']).not.toBe(primeira['texto']);
      expect(objeto(segunda['pagina'])['de']).not.toBe(pagina['de']);
    });
  });

  describe('leis_facetas, leis_cobertura e leis_autoria', () => {
    it('conta por dimensão', async () => {
      const resposta = await servicoDasFixtures(teste.indice).facetas({ dimensoes: ['uf', 'tipo'] });
      const facetas = objeto(resposta['facetas']);
      expect(lista(facetas['uf'])[0]).toEqual({ valor: 'SP', quantidade: 3 });
      expect(lista(facetas['tipo'])[0]).toMatchObject({ valor: 'leis-ordinarias', quantidade: 7, rotulo: 'Lei Ordinária' });
      await expect(servicoDasFixtures(teste.indice).facetas({ dimensoes: ['cor'] })).rejects.toMatchObject({ codigo: 'entrada_invalida' });
    });

    it('mostra lacunas, falhas e o estado do índice para um recorte', async () => {
      const resposta = await servicoDasFixtures(teste.indice).cobertura({ esfera: 'estaduais', uf: 'SP' });
      expect(resposta['recorte']).toBe('estaduais/SP');
      expect(objeto(resposta['indice'])).toMatchObject({ commit: 'a'.repeat(40), recorte_no_escopo: true, normas_no_recorte: 2 });
      expect(lista(resposta['progresso']).map((linha) => linha['tipo_de_norma'])).toEqual(['Leis ordinárias estaduais']);
      expect(objeto(resposta['cobertura_uf'])['uf']).toBe('SP');
      expect(lista(resposta['falhas'])[0]).toMatchObject({ arquivo: 'estaduais/SP/_falhas.jsonl', total: 3 });
      const lacunas = (resposta['lacunas'] as string[]).join(' ');
      expect(lacunas).toContain('Leis ordinárias estaduais: o acervo tem 279355 de cerca de 330000');
      expect(resposta['aviso']).toBe(AVISO_AUSENCIA);
    });

    it('mostra a autoria de uma norma e as normas de um signatário', async () => {
      const servico = servicoDasFixtures(teste.indice);
      const daNorma = await servico.autoria({ referencia: 'Lei 8.078/1990' });
      expect(objeto(daNorma['autoria'])).toEqual({
        autor: 'Fernando Collor',
        coautores: ['Fulana de Tal'],
        origem: 'assinatura no texto.',
        data: '1990-09-11',
      });
      const doSignatario = await servico.autoria({ signatario: 'Fernando Collor' });
      expect(lista(doSignatario['itens']).map((item) => item['caminho'])).toEqual([CAMINHO_CDC]);
      await expect(servico.autoria({ signatario: 'Collor' })).rejects.toMatchObject({
        codigo: 'nao_encontrada',
        sugestoes: ['Fernando Collor'],
      });
      await expect(servico.autoria({})).rejects.toMatchObject({ codigo: 'entrada_invalida' });
    });

    it('recusa recurso fora do acervo', async () => {
      await expect(servicoDasFixtures(teste.indice).lerRecurso('../segredo.md')).rejects.toMatchObject({ codigo: 'caminho_invalido' });
    });
  });
});

function resposta(valor: Record<string, unknown>): Record<string, unknown> {
  return valor;
}
