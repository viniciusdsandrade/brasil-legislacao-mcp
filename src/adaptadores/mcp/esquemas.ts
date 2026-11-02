import type { JsonSchemaType } from '@modelcontextprotocol/server';
import { DIMENSOES, ESFERAS } from '../../core/tipos.js';

/*
 * Esquemas planos para qualquer harness: só type, properties, required, items, enum,
 * default, minimum, maximum e description. Sem oneOf, anyOf, allOf, $ref ou $schema.
 */

const FORMATO: JsonSchemaType = {
  type: 'string',
  enum: ['resumido', 'completo'],
  default: 'resumido',
  description: 'resumido: campos essenciais e ementa curta. completo: todos os metadados do índice.',
};

const CURSOR: JsonSchemaType = {
  type: 'string',
  description: 'Cursor da resposta anterior, para a próxima página. Use sem mudar os outros parâmetros.',
};

const FILTROS: Record<string, JsonSchemaType> = {
  esfera: { type: 'string', enum: [...ESFERAS], description: 'Esfera do acervo.' },
  uf: { type: 'string', description: 'Sigla da UF, por exemplo SP. Vale para estaduais e municipais.' },
  municipio: { type: 'string', description: 'Município como na pasta do acervo, por exemplo campinas ou rio-de-janeiro.' },
  orgao: { type: 'string', description: 'Órgão regulador como na pasta, por exemplo anvisa, rfb ou contran.' },
  tribunal: { type: 'string', description: 'Tribunal, por exemplo stf, stj ou tst.' },
  tipo: {
    type: 'string',
    description: 'Tipo de norma: nome, sigla ou pasta. Exemplos: lei, lei complementar, decreto, decreto-lei, mp, sumula, leis-ordinarias.',
  },
  numero: { type: 'string', description: 'Número da norma, por exemplo 8.078, 123 ou 2200-2.' },
  data_de: { type: 'string', description: 'Data mínima da norma: AAAA-MM-DD ou só o ano AAAA.' },
  data_ate: { type: 'string', description: 'Data máxima da norma: AAAA-MM-DD ou só o ano AAAA.' },
  revogada: { type: 'boolean', description: 'true: só normas marcadas como revogadas. false: só as não revogadas.' },
};

export const ESQUEMA_BUSCAR: JsonSchemaType = {
  type: 'object',
  properties: {
    texto: {
      type: 'string',
      description: 'Palavras para buscar. Use aspas para uma frase exata e * no fim de uma palavra para prefixo. Sem texto, lista pelos filtros.',
    },
    ...FILTROS,
    alcance: {
      type: 'string',
      enum: ['cabecalho', 'texto'],
      default: 'cabecalho',
      description: 'cabecalho: título e ementa. texto: corpo da norma (índice do corpo, ou ripgrep nas pastas do filtro).',
    },
    limite: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Itens por página.' },
    cursor: CURSOR,
    formato: FORMATO,
  },
};

export const ESQUEMA_OBTER: JsonSchemaType = {
  type: 'object',
  properties: {
    referencia: {
      type: 'string',
      description:
        'Caminho do acervo (campo caminho de leis_buscar), URI leis://, URN LexML ou citação: "Lei 8.078/1990", "LC 123/2006", "CF art. 5º, XI", "ADCT art. 10", "CDC art. 49", "Súmula 7 do STJ".',
    },
    artigo: { type: 'string', description: 'Artigo, por exemplo 5, 5º, 4-A ou 1.000. Tem precedência sobre o artigo da citação.' },
    paragrafo: { type: 'string', description: 'Parágrafo: 2, 2º ou único.' },
    inciso: { type: 'string', description: 'Inciso em romano ou número: XI ou 11.' },
    alinea: { type: 'string', description: 'Alínea: a, b, c.' },
    bloco: {
      type: 'string',
      description: 'Bloco da norma quando a numeração recomeça, por exemplo adct na Constituição. Use o índice ou parte do título.',
    },
    esfera: { type: 'string', enum: [...ESFERAS], description: 'Esfera, para desempatar uma citação.' },
    uf: { type: 'string', description: 'UF, para desempatar uma citação de norma estadual ou municipal.' },
    incluir_tachado: {
      type: 'boolean',
      default: false,
      description: 'true mostra as redações tachadas (antigas ou revogadas). O padrão omite e avisa.',
    },
    formato: FORMATO,
    cursor: CURSOR,
  },
  required: ['referencia'],
};

export const ESQUEMA_FACETAS: JsonSchemaType = {
  type: 'object',
  properties: {
    dimensoes: {
      type: 'array',
      items: { type: 'string', enum: [...DIMENSOES] },
      description: 'Dimensões a contar. Padrão: esfera, tipo e decada.',
    },
    texto: { type: 'string', description: 'Restringe as contagens às normas cujo título ou ementa têm estas palavras.' },
    ...FILTROS,
    limite: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Valores por dimensão.' },
  },
};

export const ESQUEMA_COBERTURA: JsonSchemaType = {
  type: 'object',
  properties: {
    esfera: FILTROS['esfera'] ?? { type: 'string' },
    uf: FILTROS['uf'] ?? { type: 'string' },
    municipio: FILTROS['municipio'] ?? { type: 'string' },
    orgao: FILTROS['orgao'] ?? { type: 'string' },
    tribunal: FILTROS['tribunal'] ?? { type: 'string' },
    tipo: FILTROS['tipo'] ?? { type: 'string' },
  },
};

export const ESQUEMA_AUTORIA: JsonSchemaType = {
  type: 'object',
  properties: {
    referencia: {
      type: 'string',
      description: 'Norma cuja autoria você quer ver: caminho, URN ou citação. Use referencia ou signatario.',
    },
    signatario: {
      type: 'string',
      description: 'Nome de quem assinou, para listar as normas dessa pessoa ou instituição. Use referencia ou signatario.',
    },
    limite: { type: 'integer', minimum: 1, maximum: 50, default: 10, description: 'Itens por página.' },
    cursor: CURSOR,
    formato: FORMATO,
  },
};
