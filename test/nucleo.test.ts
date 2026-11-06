import { describe, expect, it } from 'vitest';
import { LeitorLogAutoria, interpretarRegistroDeLog } from '../src/core/autoria.js';
import { separarCabecalho } from '../src/core/cabecalho.js';
import { analisarCaminho, falhasAncestrais, normalizarEscopo, pastasDoCheckoutDaEntrada, recorteDoFiltro } from '../src/core/caminho.js';
import { analisarReferencia, normalizarNumero } from '../src/core/citacao.js';
import { lerCobertura, lerProgresso, padraoTocaRecorte, progressoDoRecorte, resumirFalhas } from '../src/core/cobertura.js';
import { montarConsultaFts, padroesDaBusca } from '../src/core/consulta-fts.js';
import { codificarCursor, decodificarCursor, numeroDoCursor } from '../src/core/cursor.js';
import { analisarDocumento, derivarEmenta } from '../src/core/documento.js';
import { estruturar, localizarDispositivo, paginar, type Estrutura } from '../src/core/dispositivos.js';
import { ErroLeis } from '../src/core/erros.js';
import { registroDaNorma } from '../src/core/indexacao.js';
import { removerTachado } from '../src/core/tachado.js';
import { chaveDeTipo, chaveDeTipoDaNorma } from '../src/core/vocabulario.js';
import { CAMINHO_CDC, lerFixture } from './apoio.js';

function estruturaDe(caminho: string): Estrutura {
  const { corpo } = separarCabecalho(lerFixture(caminho));
  return estruturar(removerTachado(corpo).texto.split('\n'));
}

function textoDe(estrutura: Estrutura, inicio: number, fim: number): string {
  return estrutura.linhas.slice(inicio, fim).join('\n').trim();
}

describe('cabeçalho YAML', () => {
  it('lê strings, datas, booleanos e nulos, e devolve o corpo', () => {
    const { cabecalho, corpo, temCabecalho } = separarCabecalho(
      '---\ntitulo: "Lei nº 1"\ndata: 2002-01-10\nrevogada: false\nsituacao: null\nano: "2002"\n---\n# Lei nº 1\n\nTexto.',
    );
    expect(temCabecalho).toBe(true);
    expect(cabecalho).toEqual({ titulo: 'Lei nº 1', data: '2002-01-10', revogada: false, situacao: null, ano: '2002' });
    expect(corpo).toBe('# Lei nº 1\n\nTexto.');
  });

  it('aceita aspas simples, bloco literal, comentário e CRLF', () => {
    const { cabecalho, corpo } = separarCabecalho(
      "---\r\nementa: 'D''água'\r\nnota: |\r\n  linha 1\r\n  linha 2\r\nuf: \"SP\"   # comentário\r\n---\r\ncorpo",
    );
    expect(cabecalho['ementa']).toBe("D'água");
    expect(cabecalho['nota']).toBe('linha 1\nlinha 2');
    expect(cabecalho['uf']).toBe('SP');
    expect(corpo).toBe('corpo');
  });

  it('sem cabeçalho, devolve o texto inteiro como corpo', () => {
    const { temCabecalho, corpo } = separarCabecalho('# Constituição\n\nTexto.');
    expect(temCabecalho).toBe(false);
    expect(corpo).toBe('# Constituição\n\nTexto.');
  });
});

describe('caminhos e escopo', () => {
  it('lê as partes do caminho de cada esfera', () => {
    expect(analisarCaminho('federal/leis-ordinarias/1990/lei-8078-1990-09-11.md')).toMatchObject({
      esfera: 'federal',
      pasta: 'leis-ordinarias',
      anoPasta: 1990,
    });
    expect(analisarCaminho('estaduais/SC/decretos/sem-ano/dec-1.md')).toMatchObject({ uf: 'SC', pasta: 'decretos', anoPasta: null });
    expect(analisarCaminho('municipais/SP/campinas/leis-ordinarias/1956/x.md')).toMatchObject({
      uf: 'SP',
      municipio: 'campinas',
      pasta: 'leis-ordinarias',
    });
    expect(analisarCaminho('reguladores/rfb/2014/rfb-sijut-50055.md')).toMatchObject({ orgao: 'rfb', pasta: null, anoPasta: 2014 });
    expect(analisarCaminho('jurisprudencia/stj/sumulas/sumula-7.md')).toMatchObject({ tribunal: 'stj', pasta: 'sumulas' });
    expect(analisarCaminho('jurisprudencia/regimentos/regimento-tst.md')).toMatchObject({ tribunal: null, pasta: 'regimentos' });
    expect(analisarCaminho('tratados/oit/C100.md')).toMatchObject({ esfera: 'tratados', pasta: 'oit' });
    expect(analisarCaminho('constituicao.md')).toMatchObject({ esfera: 'constituicao' });
  });

  it('lê o tribunal de jurisprudencia/outros-tribunais e monta o recorte dele', () => {
    expect(analisarCaminho('jurisprudencia/outros-tribunais/tcu/sumula-1.md')).toMatchObject({ tribunal: 'tcu', pasta: null });
    expect(recorteDoFiltro({ esfera: 'jurisprudencia', tribunal: 'tcu', pasta: 'sumulas' })).toBe('jurisprudencia/outros-tribunais/tcu');
    expect(recorteDoFiltro({ tribunal: 'stj', pasta: 'sumulas' })).toBe('jurisprudencia/stj/sumulas');
  });

  it('lista os _falhas.jsonl das pastas acima de uma entrada do escopo', () => {
    expect(falhasAncestrais('estaduais/SP/leis-ordinarias')).toEqual(['estaduais/_falhas.jsonl', 'estaduais/SP/_falhas.jsonl']);
    expect(falhasAncestrais('federal')).toEqual([]);
    expect(falhasAncestrais('constituicao.md')).toEqual([]);
  });

  it('tira do checkout as subpastas que nunca têm normas, em qualquer nível', () => {
    const pastas = [
      'federal',
      'federal/_fonte',
      'federal/_fonte/lote-1',
      'federal/decretos',
      'federal/decretos/1991',
      'federal/decretos/_lotes',
      'federal/leis-ordinarias',
      'federal/leis-ordinarias/1990',
    ];
    expect(pastasDoCheckoutDaEntrada('federal', pastas)).toEqual(['federal/decretos/1991', 'federal/leis-ordinarias']);
    expect(pastasDoCheckoutDaEntrada('federal', ['federal', 'federal/leis-ordinarias', 'federal/leis-ordinarias/1990'])).toEqual(['federal']);
    // Sem subpasta válida, a pasta fica inteira, para não perder os arquivos dela.
    expect(pastasDoCheckoutDaEntrada('jurisprudencia/stf/sumulas', ['jurisprudencia/stf/sumulas', 'jurisprudencia/stf/sumulas/_fonte'])).toEqual([
      'jurisprudencia/stf/sumulas',
    ]);
    // Uma entrada que não existe no commit fica como está.
    expect(pastasDoCheckoutDaEntrada('estaduais/XX', [])).toEqual(['estaduais/XX']);
  });

  it('deixa a pasta inteira quando uma subpasta válida tem nome fora do padrão do escopo', () => {
    // O adaptador git recusa nomes com espaço ou acento: o sync baixa a mais, mas não para.
    const pastas = [
      'reguladores',
      'reguladores/_indice',
      'reguladores/anvisa',
      'reguladores/anvisa/_fonte',
      'reguladores/anvisa/Resoluções RDC',
      'reguladores/anvisa/portarias',
      'reguladores/rfb',
    ];
    expect(pastasDoCheckoutDaEntrada('reguladores', pastas)).toEqual(['reguladores/anvisa', 'reguladores/rfb']);
  });

  it('não trata como norma o que fica fora das pastas de normas', () => {
    for (const caminho of ['municipais/_fonte/x.md', 'estaduais/SP/_falhas.jsonl', 'scripts/comum.md', 'federal/x.md', 'README.md']) {
      expect(analisarCaminho(caminho)).toBeNull();
    }
  });

  it('normaliza o escopo e o recorte', () => {
    expect(normalizarEscopo(['federal', 'federal/leis-ordinarias', 'estaduais/SP', ' constituicao '])).toEqual([
      'constituicao',
      'estaduais/SP',
      'federal',
    ]);
    expect(recorteDoFiltro({ esfera: 'estaduais', uf: 'SP', pasta: 'decretos' })).toBe('estaduais/SP/decretos');
    expect(recorteDoFiltro({ uf: 'SP', municipio: 'campinas' })).toBe('municipais/SP/campinas');
    expect(recorteDoFiltro({})).toBe('');
  });
});

describe('vocabulário e números', () => {
  it('converte tipos para a chave canônica', () => {
    expect(chaveDeTipo('Lei ordinária')).toBe('leis-ordinarias');
    expect(chaveDeTipo('LC')).toBe('leis-complementares');
    expect(chaveDeTipo('decretos-nao-numerados')).toBe('decretos-nao-numerados');
    expect(chaveDeTipo('Convenção da OIT')).toBe('convencao-da-oit');
    expect(chaveDeTipoDaNorma('Instrução Normativa', null)).toBe('instrucoes-normativas');
    expect(chaveDeTipoDaNorma('Tema repetitivo', 'repetitivos')).toBe('tema-repetitivo');
  });

  it('normaliza números de normas', () => {
    expect(normalizarNumero('19.493')).toBe('19493');
    expect(normalizarNumero('01-a')).toBe('1-A');
    expect(normalizarNumero('2.200-2')).toBe('2200-2');
    expect(normalizarNumero('SDI1-123')).toBe('SDI1-123');
    expect(normalizarNumero('')).toBeNull();
  });
});

describe('referências e citações', () => {
  it('lê a citação de uma lei com número e ano', () => {
    expect(analisarReferencia('Lei 8.078/1990')).toMatchObject({
      forma: 'citacao',
      numero: '8078',
      anos: [1990],
      pastas: ['leis-ordinarias', 'leis-promulgadas'],
    });
    expect(analisarReferencia('Lei nº 8.078, de 11 de setembro de 1990')).toMatchObject({ numero: '8078', data: '1990-09-11' });
    expect(analisarReferencia('LC 123/2006')).toMatchObject({ numero: '123', anos: [2006], pastas: ['leis-complementares'] });
    expect(analisarReferencia('MP 2.200-2/2001')).toMatchObject({ numero: '2200-2', anos: [2001], pastas: ['medidas-provisorias'] });
    expect(analisarReferencia('Lei 8078/90', 2026)).toMatchObject({ anos: [1990] });
    expect(analisarReferencia('Lei 1/20', 2026)).toMatchObject({ anos: [2020, 1920] });
    expect(analisarReferencia('Lei 10.000/1998 (SP)')).toMatchObject({ uf: 'SP', esfera: 'estaduais' });
  });

  it('lê a Constituição, o ADCT e os apelidos com dispositivo', () => {
    expect(analisarReferencia('CF art. 5º, XI')).toMatchObject({
      constituicao: true,
      dispositivo: { artigo: '5º', inciso: 'XI' },
    });
    expect(analisarReferencia('art. 5º, XI, da CF')).toMatchObject({ constituicao: true, dispositivo: { artigo: '5º', inciso: 'XI' } });
    expect(analisarReferencia('ADCT art. 10')).toMatchObject({ constituicao: true, bloco: 'adct', dispositivo: { artigo: '10' } });
    expect(analisarReferencia('CDC art. 49')).toMatchObject({ numero: '8078', anos: [1990], dispositivo: { artigo: '49' } });
    expect(analisarReferencia('art. 7º, § 2º, II, a, da CLT')).toMatchObject({
      numero: '5452',
      dispositivo: { artigo: '7º', paragrafo: '2º', inciso: 'II', alinea: 'a' },
    });
  });

  it('lê súmulas, URN, caminho e URI', () => {
    expect(analisarReferencia('Súmula 7 do STJ')).toMatchObject({ tribunal: 'stj', pastas: ['sumulas'], numero: '7' });
    expect(analisarReferencia('Súmula Vinculante 13')).toMatchObject({ tribunal: 'stf', pastas: ['sumulas-vinculantes'], numero: '13' });
    expect(analisarReferencia('urn:lex:br:federal:lei:1990-09-11;8078')).toMatchObject({
      forma: 'urn',
      numero: '8078',
      data: '1990-09-11',
    });
    expect(analisarReferencia(CAMINHO_CDC)).toEqual({ forma: 'caminho', caminho: CAMINHO_CDC });
    expect(analisarReferencia(`leis://${encodeURIComponent(CAMINHO_CDC)}`)).toEqual({ forma: 'caminho', caminho: CAMINHO_CDC });
  });

  it('devolve null para texto que não é referência', () => {
    expect(analisarReferencia('alguma coisa')).toBeNull();
    expect(analisarReferencia('art. 5º')).toBeNull();
    expect(analisarReferencia('')).toBeNull();
  });
});

describe('tachado', () => {
  it('não apaga texto quando um parágrafo tem número ímpar de ~~', () => {
    const texto = 'ruído de OCR ~~ no meio\ne ~~texto real~~ depois\n\n~~velho~~ novo';
    const resultado = removerTachado(texto);
    expect(resultado.texto).toContain('ruído de OCR ~~ no meio\ne ~~texto real~~ depois');
    expect(resultado.texto).not.toContain('velho');
    expect(resultado.removidos).toBe(1);
  });

  it('remove ~~ e <del> e mantém o número de linhas', () => {
    const texto = 'a\n~~velho~~ novo\n~~linha\ninteira~~\n\n~~não\n\nfecha~~\n<table><tr><td><del>x</del> y</td></tr></table>';
    const resultado = removerTachado(texto);
    expect(resultado.removidos).toBe(3);
    expect(resultado.texto.split('\n')).toHaveLength(texto.split('\n').length);
    expect(resultado.texto).toContain(' novo');
    expect(resultado.texto).not.toContain('velho');
    expect(resultado.texto).toContain('~~não');
    expect(resultado.texto).toContain('<td> y</td>');
  });
});

describe('análise do documento', () => {
  it('acha o OCR no aviso do corpo e no cabeçalho', () => {
    expect(analisarDocumento({}, '# T\n\n> Texto obtido por OCR a partir de PDF escaneado; pode conter erros.\n\nArt. 1o Texto.').ocr).toBe(true);
    expect(analisarDocumento({ ocr: true }, '# T\n\nTexto.').ocr).toBe(true);
    expect(analisarDocumento({ ocr: false }, '# T\n\nTexto.').ocr).toBe(false);
    expect(analisarDocumento({ ocr_motor: 'Tesseract 5' }, '# T\n\nTexto.').ocr).toBe(true);
    expect(analisarDocumento({}, '# T\n\nTexto.')).toMatchObject({ ocr: false, semTexto: false, titulo: 'T' });
  });

  it('acha a norma sem texto', () => {
    const aviso = '# T\n\n> A fonte oficial não disponibiliza o texto desta norma: o documento servido está vazio.';
    expect(analisarDocumento({}, aviso).semTexto).toBe(true);
    expect(analisarDocumento({}, '# Só o título').semTexto).toBe(true);
  });

  it('deriva a ementa quando o cabeçalho não tem', () => {
    const municipal = registroDaNorma(
      'municipais/SP/campinas/leis-ordinarias/1956/leis-ordinarias-1581-1956-sapl-15126.md',
      lerFixture('municipais/SP/campinas/leis-ordinarias/1956/leis-ordinarias-1581-1956-sapl-15126.md'),
      false,
    );
    expect(municipal?.ementa).toBe('DÁ O NOME DE "SERAFIM PIASON" A UMA VIA PÚBLICA DA CIDADE');
    expect(municipal?.ementaDerivada).toBe(true);
    expect(municipal?.tipoChave).toBe('leis-ordinarias');
    expect(
      derivarEmenta(['# T', 'DECRETO LEGISLATIVO N° 319, DE 10 DE ABRIL DE 2025. Autoriza o Poder Executivo a alterar as programações.']),
    ).toBe('Autoriza o Poder Executivo a alterar as programações.');
  });

  it('lê o texto de um bloco ```text e pula os dados de um bloco ```json', () => {
    // Texto pré-formatado de PDF: a lei inteira fica num bloco ```text.
    expect(derivarEmenta(['# T', '```text', 'ESTADO DO RIO DE JANEIRO', 'Dispõe sobre o plano diretor do município.', '```'])).toBe(
      'Dispõe sobre o plano diretor do município.',
    );
    // O verbo casa pelo começo da palavra: a ementa nominal também vale.
    expect(derivarEmenta(['# T', '```json', '{', '  "decisao": "MERITO",', '}', '```', 'Autorização para abertura de crédito especial.'])).toBe(
      'Autorização para abertura de crédito especial.',
    );
  });

  const ementaDe = (cabecalho: Record<string, string>, corpo: string): string | null =>
    analisarDocumento(cabecalho, corpo).ementaDerivada;

  // Os corpos abaixo copiam o formato dos arquivos do acervo. Todo registro de tribunal tem `tribunal` no cabeçalho.
  it('na jurisprudência, tira a ementa da seção do enunciado, nunca da situação', () => {
    // Súmula vinculante do Banco Nacional de Precedentes: o enunciado fica em "## Questão".
    const vinculante = '# Súmula vinculante nº 13 do STF\n\n## Questão\n\nA nomeação de cônjuge viola a Constituição Federal.\n\n## Tese\n\nnão informado\n\n## Situação\n\nAPROVADO\n';
    expect(ementaDe({ tribunal: 'STF', numero: '13', situacao: 'APROVADO' }, vinculante)).toBe('A nomeação de cônjuge viola a Constituição Federal.');
    // Súmula do STJ: o ramo do direito vem antes do rótulo "Enunciado", e o enunciado quebra linhas.
    const stj =
      '# Súmula nº 1 do STJ\n\nSúmula 1\n\nDIREITO PROCESSUAL CIVIL - COMPETÊNCIA\n\nEnunciado\nO FORO DO DOMICILIO DO ALIMENTANDO E O\nCOMPETENTE PARA A AÇÃO.\n\nÓrgão Julgador\nSEGUNDA SEÇÃO\n';
    expect(ementaDe({ tribunal: 'STJ', numero: '1' }, stj)).toBe('O FORO DO DOMICILIO DO ALIMENTANDO E O COMPETENTE PARA A AÇÃO.');
    // Súmula do STF: o enunciado fica no parágrafo da linha "SÚMULA 23".
    const stf = '# Súmula nº 23 do STF\n\nSÚMULA 23\nVerificados os pressupostos legais, não o impede a\ndeclaração de utilidade pública.\n\nData de Aprovação\nSessão Plenária de 13/12/1963\n';
    expect(ementaDe({ tribunal: 'STF', numero: '23' }, stf)).toBe('Verificados os pressupostos legais, não o impede a declaração de utilidade pública.');
    // Tema repetitivo do STJ: chaves dos dados abertos como subtítulos; a situação vem antes da questão.
    const repetitivo =
      '# Tema repetitivo nº 1116 do STJ\n\n## Registro 3334\n\n### situacao\n\nAfetado\n\n### informacoesComplementares\n\nHá determinação de suspensão do processamento dos recursos.\n\n### questaoSubmetidaAJulgamento\n\nValidade da contratação de empréstimo consignado por pessoa analfabeta.\n';
    expect(ementaDe({ tribunal: 'STJ', numero: '1116', situacao: 'Afetado' }, repetitivo)).toBe(
      'Validade da contratação de empréstimo consignado por pessoa analfabeta.',
    );
    // Súmula do TCU: o rótulo vem em maiúsculas.
    const tcu = '# Súmula nº 1 do TCU\n\n## Registro SUMULA-LEGADA-5\n\n### NUMERO\n\n1\n\n### ENUNCIADO\n\nSÚMULA TCU 1: Não se compreendem como vencimento as vantagens.\n\n### AREA\n\nPessoal\n';
    expect(ementaDe({ tribunal: 'TCU', numero: '1' }, tcu)).toBe('SÚMULA TCU 1: Não se compreendem como vencimento as vantagens.');
  });

  it('no controle concentrado, usa o textoEmenta do registro JSON e nunca uma linha do JSON', () => {
    const adi =
      '# ADI nº 1178 do STF\n\n## Registro original do CNJ\n\n```json\n{\n  "cautelar": "SIM",\n  "decisao": "MEDIDA_CAUTELAR",\n  "textoEmenta": "AÇÃO DIRETA - LIMINAR - DECRETO nº 1.006/93 - \\"CADIN\\"."\n}\n```\n';
    expect(ementaDe({ tribunal: 'STF', numero: '1178' }, adi)).toBe('AÇÃO DIRETA - LIMINAR - DECRETO nº 1.006/93 - "CADIN".');
    const semEmenta = '# ADI nº 1 do STF\n\n## Registro original do CNJ\n\n```json\n{\n  "decisao": "MERITO",\n  "textoDecisao": "Prejudicada."\n}\n```\n';
    expect(ementaDe({ tribunal: 'STF', numero: '1' }, semEmenta)).toBeNull();
    // O registro cresce com o histórico: o campo é lido também depois da linha 200.
    const historico = Array.from({ length: 250 }, (_, i) => `    { "situacao": "Andamento ${i}" },`);
    const longo = ['# ADI nº 2 do STF', '', '## Registro original do CNJ', '', '```json', '{', '  "historico": [', ...historico, '  ],', '  "textoEmenta": "AÇÃO DIRETA. LEI ESTADUAL. VÍCIO DE INICIATIVA."', '}', '```'];
    expect(ementaDe({ tribunal: 'STF', numero: '2' }, longo.join('\n'))).toBe('AÇÃO DIRETA. LEI ESTADUAL. VÍCIO DE INICIATIVA.');
  });

  it('num registro de tribunal, a seção vazia não dá lugar a outro texto', () => {
    // Sem questão informada, a situação não vira ementa: a norma fica sem ementa.
    const tema = '# Tema nº 1491 do STF\n\n## Questão\n\nNÃO INFORMADO\n\n## Situação\n\nRepercussão geral em análise. Leading case: afetado\n';
    expect(ementaDe({ tribunal: 'STF', numero: '1491', situacao: 'Repercussão geral em análise. Leading case: afetado' }, tema)).toBeNull();
    // O aviso de suspensão e uma situação diferente da do cabeçalho também não viram ementa.
    const semQuestao =
      '# Tema repetitivo nº 9 do STJ\n\n### situacao\n\nAfetado - Possível Revisão de Tese\n\n### informacoesComplementares\n\nHá determinação de suspensão do processamento dos recursos.\n\n### questaoSubmetidaAJulgamento\n\nnão informado\n';
    expect(ementaDe({ tribunal: 'STJ', numero: '9', situacao: 'Afetado' }, semQuestao)).toBeNull();
    // "Enunciado" sem texto: o bloco seguinte ("Órgão Julgador") não é o enunciado. Sobra o ramo do direito.
    const semEnunciado = '# Súmula nº 2 do STJ\n\nSúmula 2\n\nDIREITO PROCESSUAL CIVIL - COMPETÊNCIA\n\nEnunciado\n\nÓrgão Julgador\nSEGUNDA SEÇÃO\n';
    expect(ementaDe({ tribunal: 'STJ', numero: '2' }, semEnunciado)).toBe('DIREITO PROCESSUAL CIVIL - COMPETÊNCIA');
  });

  it('num registro de tribunal, uma linha "Art. N" é texto, e não o começo de uma lei', () => {
    const tema =
      '# Tema repetitivo nº 7 do STJ\n\n### informacoesComplementares\n\nArt. 1.037, II, do CPC: há determinação de suspensão.\n\n### questaoSubmetidaAJulgamento\n\nDiscute-se a aplicação do\nArt. 37 da Constituição aos conselhos profissionais.\n';
    expect(ementaDe({ tribunal: 'STJ', numero: '7' }, tema)).toBe('Discute-se a aplicação do Art. 37 da Constituição aos conselhos profissionais.');
    // No texto de uma lei, um rótulo depois do primeiro artigo não conta.
    expect(derivarEmenta(['# Lei nº 1', 'Dispõe sobre o serviço de táxi.', 'Art. 1º Fica criado o serviço.', 'Tese', 'Texto que não é ementa.'])).toBe(
      'Dispõe sobre o serviço de táxi.',
    );
  });

  it('num registro de tribunal sem seções, junta as linhas do primeiro parágrafo', () => {
    // Texto de PDF do TST: o título e o enunciado quebram em várias linhas.
    const tst =
      '# Súmula nº 238 do TST\n\nSUM-238 BANCÁRIO. SUBGERENTE (cancelada) - Res. 121/2003, DJ\n19, 20 e 21.11.2003\nO bancário no exercício da função de subgerente está inserido na\nexceção do § 2º do art. 224 da CLT.\n';
    expect(ementaDe({ tribunal: 'TST', numero: '238' }, tst)).toBe(
      'SUM-238 BANCÁRIO. SUBGERENTE (cancelada) - Res. 121/2003, DJ 19, 20 e 21.11.2003 O bancário no exercício da função de subgerente está inserido na exceção do § 2º do art. 224 da CLT.',
    );
    // A regra de verbo das leis não vale aqui: "da segunda-feira" não é o verbo "Dá".
    const tnu = '# Súmula nº 1 da TNU\n\nO prazo judicial será contado\nda segunda-feira imediata, inclusive.\n\n(DJ 8/10/2002, p. 292)\n';
    expect(ementaDe({ tribunal: 'TNU', numero: '1' }, tnu)).toBe('O prazo judicial será contado da segunda-feira imediata, inclusive.');
  });

  it('aceita a linha do número da súmula com a situação e ignora a citação de outra súmula', () => {
    // STM: o rótulo traz a situação e quebra de linha. O resto dele ("1)") não é o enunciado.
    const stm =
      '# Súmula nº 10 do STM\n\nPODER JUDICIÁRIO\nSUPERIOR TRIBUNAL MILITAR\n\nSÚMULA Nº 10 - Cancelada (BJM Nº 14, de 06.04.2018, p. 394, DJe Nº 103, de 12.06.2018, p.\n1)\n\n"Não se concede liberdade provisória a preso por deserção."\n\nReferências\n';
    expect(ementaDe({ tribunal: 'STM', numero: '10' }, stm)).toBe('"Não se concede liberdade provisória a preso por deserção."');
    // A citação de outra súmula no começo de uma linha não abre uma seção.
    const oj = '# Orientação Jurisprudencial 5 do TST\n\nOJ-SDI1-5 ADICIONAL DE PERICULOSIDADE. Aplica-se a\nSúmula 364 (item II) aos eletricitários.\n';
    expect(ementaDe({ tribunal: 'TST', numero: '5' }, oj)).toBe('OJ-SDI1-5 ADICIONAL DE PERICULOSIDADE. Aplica-se a Súmula 364 (item II) aos eletricitários.');
  });
});

describe('dispositivos', () => {
  it('acha artigos, parágrafos, incisos e alíneas', () => {
    const cdc = estruturaDe(CAMINHO_CDC);
    expect(cdc.artigos.map((artigo) => artigo.chave)).toEqual(['1', '2', '6', '20', '49']);

    const inciso = localizarDispositivo(cdc, { artigo: '6', inciso: 'III' });
    expect(textoDe(cdc, inciso.inicio, inciso.fim)).toContain('informação adequada e clara');
    expect(inciso.citacao).toBe('art. 6º, III');
    expect(inciso.caput).not.toBeNull();

    const paragrafo = localizarDispositivo(cdc, { artigo: '20', paragrafo: '2º' });
    expect(textoDe(cdc, paragrafo.inicio, paragrafo.fim)).toMatch(/^\*\*§ 2º\*\* São impróprios/);

    const doCaput = localizarDispositivo(cdc, { artigo: '20', inciso: '2' });
    expect(textoDe(cdc, doCaput.inicio, doCaput.fim)).toMatch(/^II - a restituição imediata/);

    const unico = localizarDispositivo(cdc, { artigo: 'art. 2º', paragrafo: 'único' });
    expect(textoDe(cdc, unico.inicio, unico.fim)).toContain('Equipara-se a consumidor');
  });

  it('dá erro com sugestões quando o dispositivo não existe', () => {
    const cdc = estruturaDe(CAMINHO_CDC);
    expect(() => localizarDispositivo(cdc, { artigo: '99' })).toThrow(ErroLeis);
    let sugestoes: string[] = [];
    try {
      localizarDispositivo(cdc, { artigo: '20', paragrafo: '9' });
    } catch (erro) {
      if (erro instanceof ErroLeis) sugestoes = erro.sugestoes;
    }
    expect(sugestoes).toEqual(['§ 1º', '§ 2º']);
    expect(() => localizarDispositivo(cdc, { artigo: '6', inciso: 'IX' })).toThrow(/inciso IX não encontrado/);
  });

  it('separa a Constituição e o ADCT em blocos', () => {
    const cf = estruturaDe('constituicao.md');
    expect(cf.blocos).toHaveLength(2);
    expect(cf.blocos[1]?.titulo).toBe('ATO DAS DISPOSIÇÕES CONSTITUCIONAIS TRANSITÓRIAS');
    const adct = localizarDispositivo(cf, { artigo: '10', bloco: 'adct' });
    expect(textoDe(cf, adct.inicio, adct.fim)).toMatch(/^\*\*Art\. 10\.\*\*/);
    const primeiro = localizarDispositivo(cf, { artigo: '1' });
    expect(primeiro.outrosBlocos).toHaveLength(1);
    const casa = localizarDispositivo(cf, { artigo: '5', inciso: 'XI' });
    expect(textoDe(cf, casa.inicio, casa.fim)).toMatch(/^XI - a casa é asilo inviolável/);
  });

  it('aceita formas de OCR e ignora texto citado de outra lei', () => {
    const estrutura = estruturar([
      'Art. 1o Texto.',
      'Art. l97. Texto.',
      '**Artigo 2º** - Texto.',
      '**Art. 4º-A.** Texto.',
      'Art. 5º - A União.',
      '**Art. 6º** A Lei nº 1 passa a vigorar com a seguinte redação:',
      '“Art. 7º O texto novo.”',
    ]);
    expect(estrutura.artigos.map((artigo) => artigo.chave)).toEqual(['1', '197', '2', '4-A', '5', '6']);
  });

  it('pagina por unidade e continua do ponto do corte', () => {
    const primeira = paginar(['aaaa', 'bbbb', 'cccc'], { unidade: 0, deslocamento: 0 }, 10);
    expect(primeira.texto).toBe('aaaa\n\nbbbb');
    expect(primeira.proxima).toEqual({ unidade: 2, deslocamento: 0 });
    const longa = 'x'.repeat(25);
    const cortada = paginar([longa], { unidade: 0, deslocamento: 0 }, 10);
    expect(cortada).toMatchObject({ texto: 'x'.repeat(10), proxima: { unidade: 0, deslocamento: 10 }, cortadaNoMeio: true });
    const fim = paginar([longa], { unidade: 0, deslocamento: 20 }, 10);
    expect(fim).toMatchObject({ texto: 'x'.repeat(5), proxima: null });
  });

  it('a paginação avança mesmo quando o espaço pedido é zero ou negativo', () => {
    const longa = 'x'.repeat(30);
    for (const espaco of [0, -500]) {
      const pagina = paginar([longa], { unidade: 0, deslocamento: 0 }, espaco);
      expect(pagina.texto.length).toBeGreaterThan(0);
      expect(pagina.proxima?.deslocamento ?? longa.length).toBeGreaterThan(0);
    }
  });
});

describe('consulta FTS5 e ripgrep', () => {
  it('põe cada termo entre aspas e neutraliza operadores', () => {
    expect(montarConsultaFts('proteção consumidor')?.expressao).toBe('"proteção" AND "consumidor"');
    expect(montarConsultaFts('"defesa do consumidor" código*')?.expressao).toBe('"defesa do consumidor" AND "código"*');
    expect(montarConsultaFts('a OR b NEAR(c d)')?.expressao).toBe('"OR" AND "NEAR"');
    expect(montarConsultaFts('titulo:abc', ['titulo', 'ementa'])?.expressao).toBe(
      '{titulo ementa} : "titulo" AND {titulo ementa} : "abc"',
    );
    expect(montarConsultaFts('!!! ---')).toBeNull();
  });

  it('monta um padrão por termo, com palavra inteira, prefixo, frase e sem acento', () => {
    const casa = (texto: string, linha: string): boolean[] =>
      padroesDaBusca(texto).map((padrao) => new RegExp(padrao, 'iu').test(linha));
    expect(casa('acao civil', 'Ação  Civil pública')).toEqual([true, true]);
    expect(casa('consumo', 'proteção do consumidor')).toEqual([false]);
    expect(casa('consum*', 'proteção do consumidor')).toEqual([true]);
    expect(casa('"defesa do consumidor"', 'a defesa  do consumidor.')).toEqual([true]);
    expect(casa('"defesa do consumidor"', 'defesa e do consumidor')).toEqual([false]);
    expect(padroesDaBusca('!!! ---')).toEqual([]);
  });
});

describe('cursor', () => {
  it('confere o tipo e a consulta', () => {
    const cursor = codificarCursor({ t: 'b', f: 'abc', o: 10 });
    expect(numeroDoCursor(decodificarCursor(cursor, 'b', 'abc'), 'o')).toBe(10);
    expect(() => decodificarCursor(cursor, 'b', 'outra')).toThrow(ErroLeis);
    expect(() => decodificarCursor('!!', 'b', 'abc')).toThrow(ErroLeis);
  });
});

describe('cobertura', () => {
  it('lê o PROGRESSO.md e casa os padrões de pasta com o recorte', () => {
    const progresso = lerProgresso(lerFixture('PROGRESSO.md'));
    expect(progresso.linhas).toHaveLength(4);
    expect(progresso.geradoEm).toBe('02/11/2026 15:38:22 (America/Recife)');
    expect(progressoDoRecorte(progresso, 'estaduais/SP').map((linha) => linha.tipoDeNorma)).toEqual(['Leis ordinárias estaduais']);
    expect(padraoTocaRecorte('municipais/*/*/decretos-legislativos', 'municipais/SP/campinas')).toBe(true);
    expect(padraoTocaRecorte('federal/leis-ordinarias', 'federal/decretos')).toBe(false);
  });

  it('lê o COBERTURA.md e resume as falhas', () => {
    const cobertura = lerCobertura(lerFixture('COBERTURA.md'));
    expect(cobertura.ufs.map((linha) => linha.uf)).toEqual(['SP', 'RS']);
    expect(cobertura.ufs[0]).toMatchObject({ normas: 40203, semTexto: 'sem link de texto: 88; erro: 58' });
    expect(cobertura.federal).toEqual([{ tipo: 'leis-ordinarias', normas: 16684 }]);
    const falhas = resumirFalhas('estaduais/SP/_falhas.jsonl', lerFixture('estaduais/SP/_falhas.jsonl'));
    expect(falhas.total).toBe(3);
    expect(falhas.motivos[0]).toEqual({ motivo: 'sem link de texto', quantidade: 2 });
  });
});

describe('autoria no git log', () => {
  const base =
    `\x1eC${'a'.repeat(40)}\x1fAFernando Collor\x1fBLei nº 8.078 de 11/09/1990\n\nDispõe sobre a proteção do consumidor.\n\n` +
    'Autoria: assinatura no texto.\nFonte: https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078\n\n' +
    'Co-Authored-By: Fulana de Tal <fulana-de-tal-12345@exemplo.com>\n\x1fE\n\nfederal/leis-ordinarias/1990/lei-8078-1990-09-11.md\n';
  const lote = `\x1eC${'b'.repeat(40)}\x1fAAcervo\x1fBAcrescenta 2 normas\n\nAutoria: lote.\n\x1fE\n\nfederal/a/1990/x.md\nfederal/a/1990/y.md\n`;
  const desenvolvimento =
    `\x1eC${'c'.repeat(40)}\x1fAPessoa\x1fBfix: ajusta script\n\nCo-Authored-By: Ferramenta <noreply@example.com>\n\x1fE\n\n` +
    'federal/leis-ordinarias/2000/lei-1-2000-01-01.md\n';

  it('aceita só commits da base com uma norma e a linha Autoria', () => {
    expect(interpretarRegistroDeLog(base.slice(1))).toEqual({
      commit: 'a'.repeat(40),
      autor: 'Fernando Collor',
      coautores: ['Fulana de Tal'],
      origem: 'assinatura no texto.',
      fonte: 'https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078',
      caminho: 'federal/leis-ordinarias/1990/lei-8078-1990-09-11.md',
    });
    expect(interpretarRegistroDeLog(lote.slice(1))).toBeNull();
    expect(interpretarRegistroDeLog(desenvolvimento.slice(1))).toBeNull();
  });

  it('lê o log em pedaços', () => {
    const leitor = new LeitorLogAutoria();
    const fluxo = base + lote + desenvolvimento;
    const registros = [...leitor.alimentar(fluxo.slice(0, 37)), ...leitor.alimentar(fluxo.slice(37)), ...leitor.terminar()];
    expect(registros.map((registro) => registro.autor)).toEqual(['Fernando Collor']);
  });
});
