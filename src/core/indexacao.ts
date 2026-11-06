import { separarCabecalho } from './cabecalho.js';
import { analisarCaminho, CAMINHO_CONSTITUICAO } from './caminho.js';
import { normalizarNumero } from './citacao.js';
import { analisarDocumento } from './documento.js';
import { removerTachado } from './tachado.js';
import { dataIso, limparMarkdown, slug, textoOuNulo } from './texto.js';
import type { RegistroNorma, VigenciaNaFonte } from './tipos.js';
import { chaveDeTipoDaNorma } from './vocabulario.js';

/** Limite do corpo guardado no índice FTS5 por norma. */
export const MAX_CORPO_INDEXADO = 2_000_000;

const FONTE_DA_CONSTITUICAO = /^>\s*Fonte:\s*\[[^\]]*\]\((https?:[^)\s]+)\)(?:,\s*obtido em (\d{4}-\d{2}-\d{2}))?/m;

/** Texto do corpo para o FTS5: sem tachado, sem marcação, com espaços simples. */
export function corpoParaIndice(corpo: string): string {
  const semTachado = removerTachado(corpo).texto;
  const linhas = semTachado
    .split('\n')
    .filter((linha) => !/^\s*>/.test(linha))
    .map((linha) => limparMarkdown(linha.replace(/^#+\s*/, '')))
    .filter((linha) => linha !== '');
  const texto = linhas.join('\n');
  return texto.length > MAX_CORPO_INDEXADO ? texto.slice(0, MAX_CORPO_INDEXADO) : texto;
}

/** Valores do legislationLegalForce da fonte, sem maiúsculas nem separadores. */
const FORCA_LEGAL: Readonly<Record<string, VigenciaNaFonte>> = {
  inforce: 'em_vigor',
  notinforce: 'sem_vigor',
  partiallyinforce: 'parcial',
};

/**
 * Lê o campo `forca_legal_fonte` do cabeçalho: uma lista JSON com o legislationLegalForce da
 * fonte oficial, por exemplo ["NotInForce"]. Uma lista vazia quer dizer que a fonte não
 * informa. Valores diferentes na mesma lista viram "parcial".
 */
export function vigenciaNaFonte(valor: unknown): VigenciaNaFonte | null {
  const texto = textoOuNulo(valor);
  if (texto === null) return null;
  let lido: unknown;
  try {
    lido = JSON.parse(texto);
  } catch {
    lido = texto;
  }
  const lidas = new Set<VigenciaNaFonte>();
  for (const item of Array.isArray(lido) ? (lido as unknown[]) : [lido]) {
    if (typeof item !== 'string') continue;
    const vigencia = FORCA_LEGAL[item.replace(/[^A-Za-z]/g, '').toLowerCase()];
    if (vigencia !== undefined) lidas.add(vigencia);
  }
  const [unica] = [...lidas];
  if (unica === undefined) return null;
  return lidas.size === 1 ? unica : 'parcial';
}

function anoInteiro(valor: unknown): number | null {
  const texto = textoOuNulo(valor);
  if (texto === null || !/^\d{4}$/.test(texto)) return null;
  return Number(texto);
}

/**
 * Monta o registro do índice a partir do caminho e do conteúdo do arquivo.
 * Devolve null quando o caminho não é de norma.
 */
export function registroDaNorma(caminho: string, conteudo: string, indexarCorpo: boolean): RegistroNorma | null {
  const info = analisarCaminho(caminho);
  if (info === null) return null;
  const { cabecalho, corpo } = separarCabecalho(conteudo);
  const analise = analisarDocumento(cabecalho, corpo);

  let fonte = textoOuNulo(cabecalho['fonte']);
  let baixadoEm = dataIso(cabecalho['baixado_em']) ?? textoOuNulo(cabecalho['baixado_em']);
  let tipo = textoOuNulo(cabecalho['tipo']);
  let data = dataIso(cabecalho['data']);
  let versaoTexto = textoOuNulo(cabecalho['versao_texto']);
  if (caminho === CAMINHO_CONSTITUICAO) {
    const origem = FONTE_DA_CONSTITUICAO.exec(corpo);
    fonte = fonte ?? origem?.[1] ?? null;
    baixadoEm = baixadoEm ?? origem?.[2] ?? null;
    tipo = tipo ?? 'Constituição Federal';
    data = data ?? '1988-10-05';
    versaoTexto = versaoTexto ?? 'compilada (texto compilado do Planalto, sem redações tachadas)';
  }
  const tribunalCabecalho = textoOuNulo(cabecalho['tribunal']);
  const ementa = textoOuNulo(cabecalho['ementa']);
  const numero = textoOuNulo(cabecalho['numero']);
  const revogada = cabecalho['revogada'];
  const ano = data !== null ? Number(data.slice(0, 4)) : (anoInteiro(cabecalho['ano']) ?? info.anoPasta);
  return {
    caminho,
    esfera: info.esfera,
    uf: info.uf ?? textoOuNulo(cabecalho['uf'])?.toUpperCase() ?? null,
    municipio: info.municipio,
    orgao: info.orgao,
    tribunal:
      info.esfera === 'jurisprudencia'
        ? (tribunalCabecalho !== null ? slug(tribunalCabecalho) : null) || info.tribunal
        : null,
    pasta: info.pasta,
    tipo,
    tipoChave: caminho === CAMINHO_CONSTITUICAO ? 'constituicao' : chaveDeTipoDaNorma(tipo, info.pasta),
    numero,
    numeroNormalizado: normalizarNumero(numero),
    data,
    ano,
    titulo: textoOuNulo(cabecalho['titulo']) ?? analise.titulo ?? caminho,
    ementa: ementa ?? analise.ementaDerivada,
    ementaDerivada: ementa === null && analise.ementaDerivada !== null,
    situacao: textoOuNulo(cabecalho['situacao']),
    revogada: typeof revogada === 'boolean' ? revogada : null,
    vigenciaNaFonte: vigenciaNaFonte(cabecalho['forca_legal_fonte']),
    versaoTexto,
    fonte,
    baixadoEm,
    urn: textoOuNulo(cabecalho['urn']),
    ocr: analise.ocr,
    semTexto: analise.semTexto,
    temTachado: analise.temTachado,
    corpo: indexarCorpo && !analise.semTexto ? corpoParaIndice(corpo) : null,
  };
}
