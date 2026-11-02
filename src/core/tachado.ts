export interface ResultadoTachado {
  texto: string;
  removidos: number;
}

const HTML_TACHADO = /<(del|s|strike)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const PARAGRAFO = /\n[ \t]*\n/;

/** Mantém só as quebras de linha de um trecho, para não mudar a numeração das linhas. */
function soQuebras(trecho: string): string {
  return trecho.replace(/[^\n]/g, '');
}

/**
 * Remove as redações tachadas: `~~texto~~` (html2md fora de tabelas) e `<del>`, `<s>`,
 * `<strike>` (dentro de tabelas HTML). O número de linhas do texto não muda.
 */
export function removerTachado(texto: string): ResultadoTachado {
  let removidos = 0;
  const semHtml = texto.replace(HTML_TACHADO, (trecho) => {
    removidos += 1;
    return soQuebras(trecho);
  });
  let saida = '';
  let posicao = 0;
  while (posicao < semHtml.length) {
    const inicio = semHtml.indexOf('~~', posicao);
    if (inicio < 0) {
      saida += semHtml.slice(posicao);
      break;
    }
    const fim = semHtml.indexOf('~~', inicio + 2);
    if (fim < 0) {
      saida += semHtml.slice(posicao);
      break;
    }
    const miolo = semHtml.slice(inicio + 2, fim);
    if (PARAGRAFO.test(miolo) || miolo.trim() === '') {
      saida += semHtml.slice(posicao, inicio + 2);
      posicao = inicio + 2;
      continue;
    }
    saida += semHtml.slice(posicao, inicio) + soQuebras(miolo);
    removidos += 1;
    posicao = fim + 2;
  }
  return { texto: saida, removidos };
}

/** Verdadeiro quando a linha é só tachado (com espaços e marcas de ênfase). */
export function linhaSoTachada(linha: string): boolean {
  const semMarcas = linha.trim().replace(/^[*_]+|[*_]+$/g, '');
  return semMarcas.startsWith('~~') && semMarcas.endsWith('~~') && semMarcas.length > 4;
}

/** Tira as marcas `~~` de uma linha, para ler o rótulo de uma redação tachada. */
export function semMarcasDeTachado(linha: string): string {
  return linha.replace(/~~/g, '');
}

/**
 * Arruma o texto para exibir: tira linhas que ficaram só com marcas de ênfase
 * depois da remoção e junta linhas em branco repetidas.
 */
export function arrumarParaExibir(texto: string): string {
  return texto
    .split('\n')
    .map((linha) => (/^[\s*_\\]*$/.test(linha) ? '' : linha.replace(/[ \t]+$/g, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
