import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirIndiceEscrita, type IndiceSqlite } from '../src/adaptadores/sqlite/indice.js';
import { registroDaNorma } from '../src/core/indexacao.js';
import type { Acervo, BuscaTextual } from '../src/core/portas.js';
import { ServicoLeis } from '../src/core/servico.js';
import { VERSAO_ESQUEMA } from '../src/core/sincronizacao.js';
import type { RegistroNorma } from '../src/core/tipos.js';

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error('não é objeto');
  return valor as Objeto;
}

function texto(valor: unknown): string {
  if (typeof valor !== 'string') throw new Error('não é texto');
  return valor;
}

function textos(valor: unknown): string[] {
  if (!Array.isArray(valor)) throw new Error('não é lista');
  return valor.map((item) => String(item));
}

// Arquivos do acervo: o cabeçalho é o do arquivo real, e o corpo é um trecho dele.
const CONSTITUICAO_SP = 'estaduais/SP/constituicao/1989/constituicao-sp.md';
const CONSTITUICAO_MG = 'estaduais/MG/constituicao/1989/con-1989-1989.md';
const HISTORICA_SP = 'estaduais/SP/constituicoes-historicas/1967/ce-0-1967-05-13-id201948.md';

const ARQUIVOS: Record<string, string> = {
  [CONSTITUICAO_SP]: [
    '---',
    'titulo: "Constituição do Estado de São Paulo"',
    'uf: "SP"',
    'tipo: "Constituição Estadual"',
    'numero: ""',
    'data: 1989-10-05',
    'ementa: ""',
    'versao_texto: "Texto anotado da ALESP; anotações identificadas até EC 55, de 27/11/2024; cabeçalho menciona ADI-STF 7436, de 23/08/2023; data-limite global de atualização não declarada"',
    'fonte: "https://www.al.sp.gov.br/repositorio/legislacao/constituicao/1989/constituicao-0-05.10.1989.html"',
    'baixado_em: 2026-10-15',
    '---',
    '# Constituição do Estado de São Paulo',
    '',
    'CONSTITUIÇÃO ESTADUAL, DE 05 DE OUTUBRO DE 1989',
    '',
    '**Artigo 1° -** O Estado de São Paulo, integrante da República Federativa do Brasil, exerce as competências que não lhe são vedadas pela Constituição Federal.',
    '',
    '**Artigo 2° -** A lei estabelecerá procedimentos judiciários abreviados e de custos reduzidos para as ações cujo objeto principal seja a salvaguarda dos direitos e liberdades fundamentais.',
    '',
  ].join('\n'),
  [CONSTITUICAO_MG]: [
    '---',
    'titulo: "Constituição do Estado de Minas Gerais (1989)"',
    'uf: "MG"',
    'tipo: "Constituição Estadual"',
    'numero: "1989"',
    'data: 1989-09-21',
    'ementa: "CONSTITUIÇÃO DO ESTADO DE MINAS GERAIS."',
    'situacao: "Vigente"',
    'revogada: false',
    'versao_texto: "Texto atualizado da ALMG; anotações identificadas até Emenda à Constituição 122, de 15/04/2026; data-limite global não declarada"',
    'fonte: "https://dadosabertos.almg.gov.br/api/v2/legislacao/mineira/CON/1989/1989/documento?tipoDoc=572"',
    'baixado_em: 2026-10-13',
    '---',
    '# Constituição do Estado de Minas Gerais (1989)',
    '',
    '**Art. 1º** - O Estado de Minas Gerais integra, com autonomia político-administrativa, a República Federativa do Brasil.',
    '',
    '**§ 1º** - Todo o poder do Estado emana do povo, que o exerce por meio de representantes eleitos ou diretamente, nos termos da Constituição da República e desta Constituição.',
    '',
  ].join('\n'),
  // A constituição anterior tem o mesmo tipo e a mesma UF, mas fica em outra pasta.
  [HISTORICA_SP]: [
    '---',
    'titulo: "Constituição de 13/05/1967"',
    'uf: "SP"',
    'tipo: "Constituição Estadual"',
    'numero: "0"',
    'data: 1967-05-13',
    'ementa: ""',
    'situacao: "Revogada"',
    'revogada: true',
    'versao_texto: "original"',
    'publicacao: "Poder Executivo, 17/05/1967, p.41"',
    'fonte: "https://www.al.sp.gov.br/norma/201948"',
    'baixado_em: 2026-11-01',
    '---',
    '# Constituição de 13/05/1967',
    '',
    'CONSTITUIÇÃO ESTADUAL DE 13 DE MAIO DE 1967',
    '',
  ].join('\n'),
};

function registros(): RegistroNorma[] {
  return Object.entries(ARQUIVOS).map(([caminho, conteudo]) => {
    const registro = registroDaNorma(caminho, conteudo, false);
    if (registro === null) throw new Error(`fixture inválida: ${caminho}`);
    return registro;
  });
}

describe('citação de constituição estadual', () => {
  let pasta: string;
  let indice: IndiceSqlite;
  let servico: ServicoLeis;

  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'leis-mcp-constituicao-estadual-'));
    indice = abrirIndiceEscrita(join(pasta, 'indice.sqlite'));
    indice.gravarNormas(registros());
    indice.gravarMeta({
      versao_esquema: String(VERSAO_ESQUEMA),
      commit: 'a'.repeat(40),
      sincronizado_em: '2026-11-07T12:00:00.000Z',
      escopo: JSON.stringify(['estaduais']),
      corpo: JSON.stringify([]),
      remoto: 'file:///fixtures',
      ramo: 'main',
    });
    const acervo: Acervo = {
      ler: async (caminho) => {
        const conteudo = ARQUIVOS[caminho];
        if (conteudo === undefined) throw new Error(`arquivo fora da fixture: ${caminho}`);
        return conteudo;
      },
      lerRaiz: async () => null,
      lerFalhas: async () => null,
    };
    const busca: BuscaTextual = { arquivos: async () => ({ caminhos: [], parcial: false }), trechos: async () => [] };
    servico = new ServicoLeis({ indice: () => indice, acervo, buscaTextual: busca });
  });

  afterAll(() => {
    indice?.fechar();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('as três normas têm o mesmo tipo, e só a pasta distingue a constituição anterior', () => {
    expect(registros().map((registro) => registro.tipoChave)).toEqual(['constituicao', 'constituicao', 'constituicao']);
    expect(indice.porCaminho(HISTORICA_SP)).toMatchObject({ uf: 'SP', pasta: 'constituicoes-historicas', revogada: true });
  });

  it('resolve a constituição pela UF da citação e deixa a constituição anterior de fora', async () => {
    const sp = await servico.obter({ referencia: 'Constituição do Estado de SP', artigo: '1' });
    expect(objeto(sp['norma'])).toMatchObject({ caminho: CONSTITUICAO_SP, uf: 'SP' });
    expect(objeto(sp['dispositivo'])['citacao']).toBe('art. 1º');
    expect(texto(objeto(sp['dispositivo'])['texto'])).toContain('O Estado de São Paulo, integrante da República Federativa do Brasil');
    expect(textos(sp['avisos']).join(' ')).not.toContain('esfera');
    const mg = await servico.obter({ referencia: 'Constituição Estadual de MG art. 1º' });
    expect(objeto(mg['norma'])['caminho']).toBe(CONSTITUICAO_MG);
    expect(texto(objeto(mg['dispositivo'])['texto'])).toMatch(/^\*\*Art\. 1º\*\* - O Estado de Minas Gerais integra/);
  });

  it('aceita a UF no parâmetro uf, também em leis_autoria', async () => {
    const resposta = await servico.obter({ referencia: 'Constituição Estadual', uf: 'mg' });
    expect(objeto(resposta['norma'])['caminho']).toBe(CONSTITUICAO_MG);
    const autoria = await servico.autoria({ referencia: 'Constituição do Estado de SP' });
    expect(objeto(autoria['norma'])['caminho']).toBe(CONSTITUICAO_SP);
    expect(autoria['autoria']).toBeNull();
  });

  it('sem UF, o erro pede a sigla na citação ou o parâmetro uf', async () => {
    const pedido = servico.obter({ referencia: 'Constituição do Estado de São Paulo' });
    await expect(pedido).rejects.toThrow('não diz a UF');
    await expect(pedido).rejects.toMatchObject({
      codigo: 'entrada_invalida',
      proximoPasso: expect.stringContaining('parâmetro uf'),
    });
  });

  it('sem a norma no índice, distingue o recorte fora do escopo do recorte sem a norma', async () => {
    await expect(servico.obter({ referencia: 'Constituição do Estado de RJ' })).rejects.toMatchObject({
      codigo: 'nao_encontrada',
      proximoPasso: expect.stringContaining('leis_buscar'),
    });
    indice.gravarMeta({ escopo: JSON.stringify(['estaduais/MG', 'estaduais/SP']) });
    try {
      await expect(servico.obter({ referencia: 'Constituição do Estado de RJ' })).rejects.toMatchObject({
        codigo: 'fora_do_escopo',
        proximoPasso: expect.stringContaining('estaduais/RJ/constituicao'),
      });
    } finally {
      indice.gravarMeta({ escopo: JSON.stringify(['estaduais']) });
    }
  });
});
