import { normalizarChave } from './texto.js';

/**
 * Vocabulário canônico do acervo, igual ao CANONICO de scripts/comum.py:
 * chave normalizada -> [pasta, rótulo].
 */
export const CANONICO: ReadonlyMap<string, readonly [string, string]> = new Map<string, readonly [string, string]>([
  ['constituicao estadual', ['constituicao', 'Constituição Estadual']],
  ['constituicao do estado', ['constituicao', 'Constituição Estadual']],
  ['emenda constitucional', ['emendas-constitucionais', 'Emenda Constitucional']],
  ['emenda a constituicao', ['emendas-constitucionais', 'Emenda Constitucional']],
  ['emenda a constituicao estadual', ['emendas-constitucionais', 'Emenda Constitucional']],
  ['emenda a ce', ['emendas-constitucionais', 'Emenda Constitucional']],
  ['lei', ['leis-ordinarias', 'Lei Ordinária']],
  ['lei ordinaria', ['leis-ordinarias', 'Lei Ordinária']],
  ['lei nao numerada', ['leis-ordinarias', 'Lei Ordinária']],
  ['lei complementar', ['leis-complementares', 'Lei Complementar']],
  ['lei complementar consolidada', ['leis-complementares', 'Lei Complementar']],
  ['lei delegada', ['leis-delegadas', 'Lei Delegada']],
  ['lei constitucional', ['leis-constitucionais', 'Lei Constitucional']],
  ['lei promulgada', ['leis-promulgadas', 'Lei Promulgada']],
  ['lei ordinaria promulgada', ['leis-promulgadas', 'Lei Promulgada']],
  ['decreto lei', ['decretos-lei', 'Decreto-Lei']],
  ['decreto lei complementar', ['decretos-lei-complementares', 'Decreto-Lei Complementar']],
  ['lei organica', ['lei-organica', 'Lei Orgânica']],
  ['emenda a lei organica', ['emendas-lei-organica', 'Emenda à Lei Orgânica']],
  ['emenda constitucional de revisao', ['emendas-constitucionais', 'Emenda Constitucional de Revisão']],
  ['decreto', ['decretos', 'Decreto']],
  ['decreto numerado', ['decretos', 'Decreto']],
  ['decreto executivo', ['decretos', 'Decreto']],
  ['decreto do executivo', ['decretos', 'Decreto']],
  ['decreto nao numerado', ['decretos-nao-numerados', 'Decreto (não numerado)']],
  ['decreto legislativo', ['decretos-legislativos', 'Decreto Legislativo']],
  ['decreto do poder legislativo', ['decretos-legislativos', 'Decreto do Poder Legislativo']],
  ['medida provisoria', ['medidas-provisorias', 'Medida Provisória']],
  ['resolucao do senado federal', ['resolucoes-senado', 'Resolução do Senado Federal']],
  ['resolucao da camara dos deputados', ['resolucoes-camara', 'Resolução da Câmara dos Deputados']],
  ['resolucao do congresso nacional', ['resolucoes-congresso', 'Resolução do Congresso Nacional']],
  ['resolucao da revisao constitucional', ['resolucoes-congresso', 'Resolução da Revisão Constitucional']],
  ['regimento interno', ['regimentos', 'Regimento Interno']],
  ['resolucao', ['resolucoes', 'Resolução']],
  ['resolucao normativa', ['resolucoes', 'Resolução']],
  ['resolucao legislativa', ['resolucoes', 'Resolução']],
  ['resolucao da assembleia', ['resolucoes', 'Resolução']],
  ['resolucao de plenario', ['resolucoes', 'Resolução']],
  ['resolucao de mesa', ['resolucoes', 'Resolução']],
  ['regimento interno resolucao 08 2023', ['regimentos', 'Regimento Interno']],
  ['resolucao da diretoria colegiada', ['resolucoes', 'Resolução da Diretoria Colegiada']],
  ['deliberacao', ['deliberacoes', 'Deliberação']],
  ['portaria', ['portarias', 'Portaria']],
  ['instrucao normativa', ['instrucoes-normativas', 'Instrução Normativa']],
  ['circular', ['circulares', 'Circular']],
  ['parecer normativo', ['pareceres-normativos', 'Parecer Normativo']],
  ['provimento', ['provimentos', 'Provimento']],
  ['norma regulamentadora', ['normas-regulamentadoras', 'Norma Regulamentadora']],
  ['solucao de consulta', ['solucoes-de-consulta', 'Solução de Consulta']],
  ['ato normativo', ['atos-normativos', 'Ato Normativo']],
  ['recomendacao', ['recomendacoes', 'Recomendação']],
  ['ato declaratorio interpretativo', ['atos-declaratorios', 'Ato Declaratório Interpretativo']],
  ['ato declaratorio normativo', ['atos-declaratorios', 'Ato Declaratório Normativo']],
  ['convenio icms', ['convenios', 'Convênio ICMS']],
  ['protocolo icms', ['protocolos', 'Protocolo ICMS']],
  ['ajuste sinief', ['ajustes-sinief', 'Ajuste SINIEF']],
  ['sumula', ['sumulas', 'Súmula']],
  ['sumula vinculante', ['sumulas-vinculantes', 'Súmula Vinculante']],
  ['tratado', ['tratados', 'Tratado']],
  ['convencao', ['tratados', 'Convenção']],
]);

/** Siglas e formas curtas aceitas na entrada, além das chaves do CANONICO. */
const APELIDOS_TIPO: ReadonlyMap<string, string> = new Map<string, string>([
  ['lc', 'leis-complementares'],
  ['lcp', 'leis-complementares'],
  ['dl', 'decretos-lei'],
  ['del', 'decretos-lei'],
  ['mp', 'medidas-provisorias'],
  ['mpv', 'medidas-provisorias'],
  ['ec', 'emendas-constitucionais'],
  ['emc', 'emendas-constitucionais'],
  ['dec', 'decretos'],
  ['dlg', 'decretos-legislativos'],
  ['in', 'instrucoes-normativas'],
  ['res', 'resolucoes'],
  ['rdc', 'resolucoes'],
  ['sv', 'sumulas-vinculantes'],
  ['lei federal', 'leis-ordinarias'],
  ['lei estadual', 'leis-ordinarias'],
  ['lei municipal', 'leis-ordinarias'],
  ['constituicao', 'constituicao'],
  ['constituicao federal', 'constituicao'],
]);

const PASTAS_CANONICAS: ReadonlySet<string> = new Set([...CANONICO.values()].map(([pasta]) => pasta));

const ROTULO_DA_PASTA: ReadonlyMap<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const [pasta, rotulo] of CANONICO.values()) {
    if (!mapa.has(pasta)) mapa.set(pasta, rotulo);
  }
  return mapa;
})();

export function ehPastaCanonica(pasta: string): boolean {
  return PASTAS_CANONICAS.has(pasta);
}

/**
 * Chave de tipo para filtrar: a pasta canônica quando o tipo é conhecido,
 * senão o slug do rótulo. Aceita rótulo, sigla ou nome de pasta.
 */
export function chaveDeTipo(rotulo: string | null | undefined): string | null {
  if (!rotulo) return null;
  const chave = normalizarChave(rotulo.replace(/\s*\(\d{4}\)\s*$/, ''));
  if (chave === '') return null;
  const canonico = CANONICO.get(chave);
  if (canonico) return canonico[0];
  const apelido = APELIDOS_TIPO.get(chave);
  if (apelido) return apelido;
  return chave.replace(/ /g, '-');
}

/**
 * Chave de tipo de uma norma. O tipo do cabeçalho manda quando está no CANONICO;
 * senão vale a pasta canônica do caminho; senão o slug do tipo do cabeçalho.
 */
export function chaveDeTipoDaNorma(tipoCabecalho: string | null, pasta: string | null): string | null {
  if (tipoCabecalho) {
    const chave = normalizarChave(tipoCabecalho.replace(/\s*\(\d{4}\)\s*$/, ''));
    const canonico = CANONICO.get(chave);
    if (canonico) return canonico[0];
  }
  if (pasta && ehPastaCanonica(pasta)) return pasta;
  return chaveDeTipo(tipoCabecalho) ?? pasta;
}

/** Rótulo legível de uma chave de tipo. */
export function rotuloDeChave(chave: string): string | null {
  return ROTULO_DA_PASTA.get(chave) ?? null;
}
