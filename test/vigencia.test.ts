import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AcervoLocal } from '../src/adaptadores/acervo-local.js';
import { RipgrepLocal } from '../src/adaptadores/ripgrep.js';
import { abrirIndiceEscrita, type IndiceSqlite } from '../src/adaptadores/sqlite/indice.js';
import { registroDaNorma, vigenciaNaFonte } from '../src/core/indexacao.js';
import { avisoDaPendencia, lerRegistroDePendencias } from '../src/core/integralidade.js';
import { ServicoLeis } from '../src/core/servico.js';
import { VERSAO_ESQUEMA } from '../src/core/sincronizacao.js';
import type { RegistroNorma } from '../src/core/tipos.js';

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) throw new Error('não é objeto');
  return valor as Objeto;
}

function lista(valor: unknown): Objeto[] {
  if (!Array.isArray(valor)) throw new Error('não é lista');
  return valor.map(objeto);
}

function textos(valor: unknown): string[] {
  if (!Array.isArray(valor)) throw new Error('não é lista');
  return valor.map((item) => String(item));
}

// Arquivos do acervo: o cabeçalho é o do arquivo real, e o corpo é um trecho dele.
const SEM_VIGOR = 'federal/decretos/1988/dec-95732-1988-02-12.md';
const REVOGADA = 'federal/decretos/2023/dec-11510-2023-04-28.md';
const NAO_REVOGADA = 'federal/leis-ordinarias/1990/lei-8078-1990-09-11.md';
const SEM_INFORMACAO = 'federal/decretos/1944/dec-15187-1944-03-29.md';

const ARQUIVOS: Record<string, string> = {
  [SEM_VIGOR]: [
    '---',
    'titulo: "Decreto nº 95.732 de 12/02/1988"',
    'tipo: "Decreto"',
    'numero: "95732"',
    'data: 1988-02-12',
    'ementa: "APROVA O REGULAMENTO DA ESCOLA SUPERIOR DE GUERRA."',
    'revogada: null',
    'forca_legal_fonte: "[\\"NotInForce\\"]"',
    'fonte_metadados: "https://normas.leg.br/api/public/normas?urn=urn:lex:br:federal:decreto:1988-02-12;95732&tipo_documento=maior-detalhe"',
    'sha256_metadados_fonte: "96a97620559281ff8620d931d09811befa59c2b3e47e7ad7dbd2b506f2cf39e1"',
    'versao_texto: "original"',
    'urn: "urn:lex:br:federal:decreto:1988-02-12;95732"',
    'fonte: "https://normas.leg.br/?urn=urn:lex:br:federal:decreto:1988-02-12;95732"',
    'baixado_em: 2026-10-16',
    '---',
    '',
    '# Decreto nº 95.732 de 12/02/1988',
    '',
    'DECRETO N° 95.732, DE 12 DE FEVEREIRO DE 1988',
    '',
    'Aprova o Regulamento da Escola Superior de Guerra.',
    '',
    '**Art. 1°** Fica aprovado o Regulamento da Escola Superior de Guerra (ESG) que com este baixa, assinado pelo Ministro de Estado Chefe do Estado-Maior das Forças Armadas.',
    '',
    '**Art. 2°** Este Decreto entra em vigor na data de sua publicação.',
    '',
  ].join('\n'),
  [REVOGADA]: [
    '---',
    'titulo: "Decreto nº 11.510 de 28/04/2023"',
    'tipo: "Decreto"',
    'numero: "11510"',
    'data: 2023-04-28',
    'ementa: "Institui o Comitê Interministerial de Coordenação, Planejamento e Acompanhamento das Ações de Desintrusão de Terras Indígenas."',
    'revogada: true',
    'versao_texto: "original"',
    'urn: "urn:lex:br:federal:decreto:2023-04-28;11510"',
    'fonte: "https://normas.leg.br/?urn=urn:lex:br:federal:decreto:2023-04-28;11510"',
    'baixado_em: 2026-10-15',
    '---',
    '',
    '# Decreto nº 11.510 de 28/04/2023',
    '',
    '**Art. 1º** Fica instituído o Comitê Interministerial de Coordenação, Planejamento e Acompanhamento das Ações de Desintrusão de Terras Indígenas.',
    '',
  ].join('\n'),
  [NAO_REVOGADA]: [
    '---',
    'titulo: "Lei nº 8.078 de 11/09/1990"',
    'tipo: "Lei Ordinária"',
    'numero: "8078"',
    'data: 1990-09-11',
    'ementa: "Dispõe sobre a proteção do consumidor e dá outras providências."',
    'revogada: false',
    'versao_texto: "compilada (texto vigente)"',
    'urn: "urn:lex:br:federal:lei:1990-09-11;8078"',
    'fonte: "https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078"',
    'baixado_em: 2026-10-13',
    '---',
    '',
    '# Lei nº 8.078 de 11/09/1990',
    '',
    '**Art. 1º** O presente código estabelece normas de proteção e defesa do consumidor, de ordem pública e interesse social, nos termos dos arts. 5º, inciso XXXII, 170, inciso V, da Constituição Federal e art. 48 de suas Disposições Transitórias.',
    '',
  ].join('\n'),
  [SEM_INFORMACAO]: [
    '---',
    'titulo: "Decreto nº 15.187 de 29/03/1944"',
    'tipo: "Decreto"',
    'numero: "15187"',
    'data: 1944-03-29',
    'ementa: "ALTERA O REGIME DA DIVISÃO DO IMPOSTO DE RENDA."',
    'revogada: null',
    'forca_legal_fonte: "[]"',
    'fonte_metadados: "https://normas.leg.br/api/public/normas?urn=urn:lex:br:federal:decreto:1944-03-29;15187&tipo_documento=maior-detalhe"',
    'sha256_metadados_fonte: "fe3e7653e97770e8a464f3090af51406767f3354ca620c5a819c414c1f460540"',
    'versao_texto: "original"',
    'urn: "urn:lex:br:federal:decreto:1944-03-29;15187"',
    'fonte: "https://normas.leg.br/?urn=urn:lex:br:federal:decreto:1944-03-29;15187"',
    'baixado_em: 2026-10-21',
    '---',
    '',
    '# Decreto nº 15.187 de 29/03/1944',
    '',
    'DECRETO N. 15.187 – DE 29 DE MARçO DE 1944',
    '',
    'Altera o regimento da Divisão do Impôsto de Renda',
    '',
  ].join('\n'),
};

// Itens do registro real de 2026-11-01. O segundo é de uma norma que não está neste índice.
const PENDENCIA_DO_DECRETO = {
  estado: 'anexo_ausente_na_fonte_textual',
  motivo: 'Suplemento próprio baixado pelo decreto ausente do HTML: somente fecho, assinaturas e eventual nota de publicação; sem tabela, conteúdo visual ou link.',
};
const FORA_DO_INDICE = 'estaduais/PE/decretos-lei/sem-ano/dl-207-sem-ano-id5667.md';
const PENDENCIA_DE_CARACTERES = {
  estado: 'representacao_unicode_divergente',
  motivo: 'Diferença literal de dupla decodificação demonstrada entre MD publicado e fonte UTF-8; recuperação ainda retida pelos gates individuais. Não afirma ausência normativa.',
};

const REGISTRO = {
  data: '2026-11-01',
  criterio: 'Textos preservados; integralidade não validada. Pendências não contam para progresso até revisão com fonte complementar. Estado conservador não afirma ausência definitiva.',
  pendentes: [
    {
      path: SEM_VIGOR,
      sha256_md: 'ee690dea697fe3a544cd73351e61483d16302caccae3c5d54fcb3d9e24fc542a',
      ...PENDENCIA_DO_DECRETO,
      evidencia: { fonte: 'https://normas.leg.br/?urn=urn:lex:br:federal:decreto:1988-02-12;95732' },
    },
    { path: FORA_DO_INDICE, sha256_md: '069113de1be57dfa838c8cb86e9a76a08107d0fadab2b3081123e4dca069da22', ...PENDENCIA_DE_CARACTERES },
    // Itens que o leitor ignora: caminho fora do acervo, caminho repetido e valor que não é objeto.
    { path: '../fora-do-acervo.md', estado: 'x', motivo: 'y' },
    { path: SEM_VIGOR, estado: 'repetida', motivo: 'O mesmo caminho vale uma vez.' },
    'não é um item',
  ],
};

function registros(): RegistroNorma[] {
  return Object.entries(ARQUIVOS).map(([caminho, conteudo]) => {
    const registro = registroDaNorma(caminho, conteudo, false);
    if (registro === null) throw new Error(`fixture inválida: ${caminho}`);
    return registro;
  });
}

describe('vigência segundo a fonte', () => {
  it('lê o campo forca_legal_fonte do cabeçalho', () => {
    expect(vigenciaNaFonte('["NotInForce"]')).toBe('sem_vigor');
    expect(vigenciaNaFonte('["InForce"]')).toBe('em_vigor');
    expect(vigenciaNaFonte('["PartiallyInForce"]')).toBe('parcial');
    expect(vigenciaNaFonte('NotInForce')).toBe('sem_vigor');
    // Valores diferentes na mesma lista: a fonte não dá uma vigência única.
    expect(vigenciaNaFonte('["InForce", "NotInForce"]')).toBe('parcial');
    // Lista vazia, valor desconhecido ou campo ausente: a fonte não informa.
    expect(vigenciaNaFonte('[]')).toBeNull();
    expect(vigenciaNaFonte('["Unknown"]')).toBeNull();
    expect(vigenciaNaFonte(null)).toBeNull();
    expect(vigenciaNaFonte(undefined)).toBeNull();
  });

  it('guarda a vigência da fonte sem mudar o campo revogada', () => {
    const [semVigor, revogada, naoRevogada, semInformacao] = registros();
    expect(semVigor).toMatchObject({ vigenciaNaFonte: 'sem_vigor', revogada: null });
    expect(revogada).toMatchObject({ vigenciaNaFonte: null, revogada: true });
    expect(naoRevogada).toMatchObject({ vigenciaNaFonte: null, revogada: false });
    expect(semInformacao).toMatchObject({ vigenciaNaFonte: null, revogada: null });
  });
});

describe('registro de pendências de integralidade', () => {
  it('lê o registro do acervo e ignora os itens sem caminho de norma', () => {
    const registro = lerRegistroDePendencias(JSON.stringify(REGISTRO));
    expect(registro).toMatchObject({ data: '2026-11-01', criterio: REGISTRO.criterio });
    expect(registro?.pendentes).toEqual([
      { caminho: SEM_VIGOR, ...PENDENCIA_DO_DECRETO },
      { caminho: FORA_DO_INDICE, ...PENDENCIA_DE_CARACTERES },
    ]);
  });

  it('devolve null quando o conteúdo não é o registro', () => {
    expect(lerRegistroDePendencias('não é JSON')).toBeNull();
    expect(lerRegistroDePendencias('[]')).toBeNull();
    expect(lerRegistroDePendencias('{"data": "2026-11-01"}')).toBeNull();
    // Sem data, sem critério e sem os campos opcionais, o registro ainda vale.
    expect(lerRegistroDePendencias(`{"pendentes": [{"path": "${SEM_VIGOR}"}]}`)).toEqual({
      data: null,
      criterio: null,
      pendentes: [{ caminho: SEM_VIGOR, estado: 'pendente', motivo: '' }],
    });
  });

  it('monta o aviso com o motivo do registro e sem afirmar que falta texto', () => {
    const anexo = avisoDaPendencia({ caminho: SEM_VIGOR, ...PENDENCIA_DO_DECRETO }, '2026-11-01');
    expect(anexo).toBe(
      'Integralidade pendente: o registro de pendências do acervo de 2026-11-01 lista esta norma. O texto está preservado, mas ainda não foi validado como completo. ' +
        'O texto pode não trazer um anexo, um suplemento ou outro objeto a que a norma remete. ' +
        'Motivo registrado: "Suplemento próprio baixado pelo decreto ausente do HTML: somente fecho, assinaturas e eventual nota de publicação; sem tabela, conteúdo visual ou link". ' +
        'Confira a fonte antes de citar.',
    );
    // "Material não reproduzido" é um objeto que acompanha a norma: item real de uma resolução de MG.
    const naoReproduzido = avisoDaPendencia(
      {
        caminho: 'estaduais/MG/resolucoes/1986/ral-3996-1986.md',
        estado: 'ausencia_confirmada_na_fonte_textual_por_aviso_explicito',
        motivo: 'Aviso explícito de material não reproduzido na fonte textual.',
      },
      '2026-11-01',
    );
    expect(naoReproduzido).toContain('O texto pode não trazer um anexo, um suplemento ou outro objeto a que a norma remete.');
    // Sem a data do registro, o aviso não cita a data.
    const caracteres = avisoDaPendencia({ caminho: FORA_DO_INDICE, ...PENDENCIA_DE_CARACTERES }, null);
    expect(caracteres).toContain('o registro de pendências do acervo lista esta norma');
    expect(caracteres).toContain('O texto pode ter caracteres diferentes dos da fonte.');
    expect(caracteres).toContain('Motivo registrado: "Diferença literal de dupla decodificação');
    // Estado do registro que não trata de anexo nem de caracteres: item real de uma lei orgânica municipal.
    const outro = avisoDaPendencia(
      {
        caminho: 'municipais/MA/vitoria-do-mearim/lei-organica/1990/lei-organica-1-1990-sapl-1.md',
        estado: 'cor_sem_significado_juridico_esclarecido',
        motivo: 'Disposição em vermelho sem nota suficiente para inferir seu status; manter cor/rótulo e edição ou obter esclarecimento oficial.',
      },
      '2026-11-01',
    );
    expect(outro).toContain('O texto ou os dados da norma podem estar incompletos ou diferentes da fonte.');
    expect(outro).toContain('Motivo registrado: "Disposição em vermelho sem nota suficiente');
    // Sem motivo, o aviso não cita motivo. Um motivo longo é cortado.
    const semMotivo = avisoDaPendencia({ caminho: FORA_DO_INDICE, estado: 'pendente', motivo: '' }, null);
    expect(semMotivo).not.toContain('Motivo registrado');
    const longo = avisoDaPendencia({ caminho: FORA_DO_INDICE, estado: 'pendente', motivo: 'palavra '.repeat(200) }, '2026-11-01');
    expect(longo).toContain('palavra…". Confira a fonte antes de citar.');
    expect(longo.length).toBeLessThan(650);
  });
});

describe('vigência e integralidade no índice e nas ferramentas', () => {
  let pasta: string;
  let indice: IndiceSqlite;
  let servico: ServicoLeis;

  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), 'leis-mcp-vigencia-'));
    const acervo = join(pasta, 'acervo');
    for (const [caminho, conteudo] of Object.entries(ARQUIVOS)) {
      mkdirSync(dirname(join(acervo, caminho)), { recursive: true });
      writeFileSync(join(acervo, caminho), conteudo);
    }
    indice = abrirIndiceEscrita(join(pasta, 'indice.sqlite'));
    indice.gravarNormas(registros());
    const registro = lerRegistroDePendencias(JSON.stringify(REGISTRO));
    indice.substituirPendencias(registro?.pendentes ?? []);
    indice.gravarMeta({
      versao_esquema: String(VERSAO_ESQUEMA),
      commit: 'a'.repeat(40),
      sincronizado_em: '2026-11-06T12:00:00.000Z',
      escopo: JSON.stringify(['federal']),
      corpo: JSON.stringify([]),
      remoto: 'file:///fixtures',
      ramo: 'main',
      pendencias_data: registro?.data ?? '',
      pendencias_criterio: registro?.criterio ?? '',
    });
    servico = new ServicoLeis({ indice: () => indice, acervo: new AcervoLocal(acervo), buscaTextual: new RipgrepLocal({ binario: 'rg', raiz: acervo }) });
  });

  afterAll(() => {
    indice?.fechar();
    rmSync(pasta, { recursive: true, force: true });
  });

  const caminhos = (filtro: { revogada?: boolean }): string[] =>
    indice
      .buscar({ fts: null, filtro, limite: 50, deslocamento: 0 })
      .map((norma) => norma.caminho)
      .sort();

  it('o filtro revogada junta as normas revogadas e as sem vigor segundo a fonte', () => {
    expect(caminhos({ revogada: true })).toEqual([SEM_VIGOR, REVOGADA].sort());
    // As normas sem informação de vigência continuam do lado das não revogadas.
    expect(caminhos({ revogada: false })).toEqual([SEM_INFORMACAO, NAO_REVOGADA].sort());
    expect(caminhos({})).toHaveLength(4);
    expect(indice.porCaminho(SEM_VIGOR)?.vigenciaNaFonte).toBe('sem_vigor');
  });

  it('guarda as pendências do registro, também as de normas fora do índice', () => {
    expect(indice.pendenciaDe(SEM_VIGOR)).toEqual({ caminho: SEM_VIGOR, ...PENDENCIA_DO_DECRETO });
    expect(indice.pendenciaDe(FORA_DO_INDICE)).toEqual({ caminho: FORA_DO_INDICE, ...PENDENCIA_DE_CARACTERES });
    expect(indice.pendenciaDe(NAO_REVOGADA)).toBeNull();
    expect(indice.caminhosComPendencia([NAO_REVOGADA, SEM_VIGOR, REVOGADA])).toEqual([SEM_VIGOR]);
    // O registro tem duas normas; só uma está no índice.
    expect(indice.resumoDasPendencias()).toEqual({ data: '2026-11-01', criterio: REGISTRO.criterio, total: 2 });
    expect(indice.contarPendencias({})).toBe(1);
    expect(indice.contarPendencias({ esfera: 'federal', tipoChave: 'leis-ordinarias' })).toBe(0);
  });

  it('leis_buscar marca a vigência e a integralidade nos itens compactos', async () => {
    const resposta = await servico.buscar({ esfera: 'federal', limite: 10 });
    const itens = new Map(lista(resposta['itens']).map((item) => [String(item['caminho']), item]));
    expect(itens.get(SEM_VIGOR)).toMatchObject({ vigencia_na_fonte: 'sem vigor', integralidade: 'pendente' });
    expect(itens.get(SEM_VIGOR)).not.toHaveProperty('revogada');
    expect(itens.get(REVOGADA)).toMatchObject({ revogada: true });
    expect(itens.get(REVOGADA)).not.toHaveProperty('vigencia_na_fonte');
    // Sem informação, o item compacto não leva nenhum dos campos.
    for (const caminho of [NAO_REVOGADA, SEM_INFORMACAO]) {
      expect(itens.get(caminho)).not.toHaveProperty('revogada');
      expect(itens.get(caminho)).not.toHaveProperty('vigencia_na_fonte');
      expect(itens.get(caminho)).not.toHaveProperty('integralidade');
    }
    const emVigor = await servico.buscar({ esfera: 'federal', revogada: false });
    expect(lista(emVigor['itens']).map((item) => item['caminho']).sort()).toEqual([SEM_INFORMACAO, NAO_REVOGADA].sort());
    const completo = await servico.buscar({ numero: '95732', formato: 'completo' });
    expect(lista(completo['itens'])[0]).toMatchObject({ revogada: null, vigencia_na_fonte: 'sem vigor', integralidade: 'pendente' });
  });

  it('leis_obter avisa que a fonte marca a norma como sem vigor e que a integralidade está pendente', async () => {
    const resposta = await servico.obter({ referencia: 'Decreto 95.732/1988', artigo: '1' });
    expect(objeto(resposta['norma'])).toMatchObject({ caminho: SEM_VIGOR, vigencia_na_fonte: 'sem vigor', integralidade: 'pendente' });
    expect(resposta['integralidade']).toEqual({ ...PENDENCIA_DO_DECRETO, registro_de: '2026-11-01' });
    const avisos = textos(resposta['avisos']);
    expect(avisos).toContainEqual(expect.stringContaining('A fonte oficial marca esta norma como sem vigor (NotInForce)'));
    expect(avisos).toContainEqual(expect.stringContaining('Integralidade pendente: o registro de pendências do acervo de 2026-11-01 lista esta norma'));
    expect(avisos).toContainEqual(expect.stringContaining('pode não trazer um anexo'));
    // O dispositivo vem com a marcação do arquivo.
    expect(objeto(resposta['dispositivo'])['texto']).toBe(
      '**Art. 1°** Fica aprovado o Regulamento da Escola Superior de Guerra (ESG) que com este baixa, assinado pelo Ministro de Estado Chefe do Estado-Maior das Forças Armadas.',
    );
  });

  it('leis_obter não dá esses avisos para uma norma sem pendência e sem marca da fonte', async () => {
    const resposta = await servico.obter({ referencia: NAO_REVOGADA });
    expect(resposta).not.toHaveProperty('integralidade');
    expect(objeto(resposta['norma'])).not.toHaveProperty('integralidade');
    const avisos = textos(resposta['avisos']).join(' ');
    expect(avisos).not.toContain('sem vigor');
    expect(avisos).not.toContain('Integralidade');
    const revogada = await servico.obter({ referencia: REVOGADA });
    expect(textos(revogada['avisos'])).toContainEqual(expect.stringContaining('revogada: true'));
  });

  it('o recurso leis:// de uma norma pendente termina com o aviso de integralidade', async () => {
    const pendente = await servico.lerRecurso(SEM_VIGOR);
    const arquivo = ARQUIVOS[SEM_VIGOR] ?? '';
    expect(pendente.startsWith(arquivo.trimEnd())).toBe(true);
    expect(pendente.slice(arquivo.trimEnd().length)).toBe(`\n\n[${avisoDaPendencia({ caminho: SEM_VIGOR, ...PENDENCIA_DO_DECRETO }, '2026-11-01')}]\n`);
    // Sem pendência, o recurso é o arquivo do acervo, sem mudança.
    expect(await servico.lerRecurso(NAO_REVOGADA)).toBe(ARQUIVOS[NAO_REVOGADA]);
    // O recurso não depende do índice: sem índice, vem o arquivo sem a nota.
    const semIndice = new ServicoLeis({
      indice: () => {
        throw new Error('sem índice');
      },
      acervo: new AcervoLocal(join(pasta, 'acervo')),
      buscaTextual: new RipgrepLocal({ binario: 'rg', raiz: join(pasta, 'acervo') }),
    });
    expect(await semIndice.lerRecurso(SEM_VIGOR)).toBe(arquivo);
    // O texto cortado pelo orçamento de tokens leva as duas notas. O arquivo real é curto: o teste alonga uma cópia.
    const acervoLongo = join(pasta, 'acervo-longo');
    mkdirSync(dirname(join(acervoLongo, SEM_VIGOR)), { recursive: true });
    writeFileSync(join(acervoLongo, SEM_VIGOR), `${arquivo}\n${'Linha de enchimento para o teste do corte.\n'.repeat(200)}`);
    const cortado = await new ServicoLeis({
      indice: () => indice,
      acervo: new AcervoLocal(acervoLongo),
      buscaTextual: new RipgrepLocal({ binario: 'rg', raiz: acervoLongo }),
      orcamentoTokens: 500,
    }).lerRecurso(SEM_VIGOR);
    expect(cortado.length).toBeLessThan(3_200);
    expect(cortado).toContain('[Texto truncado: ');
    expect(cortado.endsWith('Confira a fonte antes de citar.]')).toBe(true);
  });

  it('leis_cobertura conta as pendências de integralidade do recorte', async () => {
    const resposta = await servico.cobertura({ esfera: 'federal' });
    expect(resposta['integralidade']).toEqual({
      pendentes_no_recorte: 1,
      pendentes_no_registro: 2,
      registro_de: '2026-11-01',
      criterio: REGISTRO.criterio,
    });
    expect(textos(resposta['lacunas'])).toContainEqual(expect.stringContaining('1 norma(s) do recorte com integralidade pendente'));
    const leis = await servico.cobertura({ esfera: 'federal', tipo: 'lei' });
    expect(objeto(leis['integralidade'])['pendentes_no_recorte']).toBe(0);
    expect(textos(leis['lacunas']).join(' ')).not.toContain('integralidade pendente');
    // A cobertura resumida explica um resultado vazio: a integralidade das normas que existem não entra nela.
    const vazia = await servico.buscar({ texto: 'palavraquenaoexiste', esfera: 'federal' });
    expect(vazia['total']).toBe(0);
    const resumida = objeto(vazia['cobertura']);
    expect(resumida).not.toHaveProperty('integralidade');
    expect(textos(resumida['lacunas']).join(' ')).not.toContain('integralidade pendente');
  });

  it('trocar o registro tira as pendências que saíram dele, e limpar apaga todas', () => {
    const outra = abrirIndiceEscrita(join(pasta, 'outro.sqlite'));
    try {
      outra.gravarNormas(registros());
      outra.substituirPendencias([{ caminho: SEM_VIGOR, estado: 'a', motivo: 'b' }, { caminho: REVOGADA, estado: 'c', motivo: 'd' }]);
      expect(outra.contarPendencias({})).toBe(2);
      outra.substituirPendencias([{ caminho: REVOGADA, estado: 'c', motivo: 'd' }]);
      expect(outra.pendenciaDe(SEM_VIGOR)).toBeNull();
      expect(outra.resumoDasPendencias()).toEqual({ data: null, criterio: null, total: 1 });
      outra.limpar();
      expect(outra.resumoDasPendencias().total).toBe(0);
    } finally {
      outra.fechar();
    }
  });
});

describe('índice de versão anterior', () => {
  it('ganha a coluna da vigência quando o sync o abre para escrita', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'leis-mcp-migra-'));
    const arquivo = join(pasta, 'indice.sqlite');
    try {
      // Tabela `normas` como a versão 3 do esquema a criava, sem a coluna vigencia_fonte.
      const antigo = new Database(arquivo);
      antigo.exec(`
        CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT NOT NULL) WITHOUT ROWID;
        CREATE TABLE normas (
          id INTEGER PRIMARY KEY, caminho TEXT NOT NULL UNIQUE, esfera TEXT NOT NULL, uf TEXT, municipio TEXT, orgao TEXT,
          tribunal TEXT, pasta TEXT, tipo TEXT, tipo_chave TEXT, numero TEXT, numero_norm TEXT, data TEXT, ano INTEGER,
          titulo TEXT NOT NULL, ementa TEXT, ementa_derivada INTEGER NOT NULL DEFAULT 0, situacao TEXT, revogada INTEGER,
          versao_texto TEXT, fonte TEXT, baixado_em TEXT, urn TEXT, ocr INTEGER NOT NULL DEFAULT 0,
          sem_texto INTEGER NOT NULL DEFAULT 0, tem_tachado INTEGER NOT NULL DEFAULT 0, corpo_indexado INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO meta (chave, valor) VALUES ('versao_esquema', '3');
        INSERT INTO normas (caminho, esfera, titulo) VALUES ('federal/decretos/1999/antiga.md', 'federal', 'Norma antiga');
      `);
      antigo.close();
      const indice = abrirIndiceEscrita(arquivo);
      try {
        expect(indice.lerMeta('versao_esquema')).toBe('3');
        expect(indice.porCaminho('federal/decretos/1999/antiga.md')?.vigenciaNaFonte).toBeNull();
        indice.gravarNormas(registros());
        expect(indice.porCaminho(SEM_VIGOR)?.vigenciaNaFonte).toBe('sem_vigor');
        expect(indice.resumoDasPendencias().total).toBe(0);
      } finally {
        indice.fechar();
      }
      // Abrir de novo não tenta criar a coluna outra vez.
      abrirIndiceEscrita(arquivo).fechar();
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
});
