import { separarCabecalho } from './cabecalho.js';
import { analisarCaminho, CAMINHO_CONSTITUICAO } from './caminho.js';
import { normalizarNumero } from './citacao.js';
import { analisarDocumento } from './documento.js';
import { removerTachado } from './tachado.js';
import { dataIso, limparMarkdown, slug, textoOuNulo } from './texto.js';
import type { RegistroNorma } from './tipos.js';
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
