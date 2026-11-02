export interface ResultadoTachado {
  texto: string;
  removidos: number;
}

const HTML_TACHADO = /<(del|s|strike)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** Separa parágrafos e guarda o separador (índices ímpares do split). */
const SEPARADOR_DE_PARAGRAFO = /(\n[ \t]*\n)/;
const PAR_DE_TACHADO = /~~([\s\S]*?)~~/g;

/** Mantém só as quebras de linha de um trecho, para não mudar a numeração das linhas. */
function soQuebras(trecho: string): string {
  return trecho.replace(/[^\n]/g, '');
}

/**
 * Remove as redações tachadas: `~~texto~~` (html2md fora de tabelas) e `<del>`, `<s>`,
 * `<strike>` (dentro de tabelas HTML). O número de linhas do texto não muda.
 *
 * Um par de `~~` só vale dentro do mesmo parágrafo. Um parágrafo com número ímpar de
 * marcas (ruído de OCR, por exemplo) fica como está: sem par seguro, nada é apagado.
 */
export function removerTachado(texto: string): ResultadoTachado {
  let removidos = 0;
  const semHtml = texto.replace(HTML_TACHADO, (trecho) => {
    removidos += 1;
    return soQuebras(trecho);
  });
  const partes = semHtml.split(SEPARADOR_DE_PARAGRAFO).map((parte, indice) => {
    if (indice % 2 === 1) return parte;
    const marcas = parte.split('~~').length - 1;
    if (marcas === 0 || marcas % 2 === 1) return parte;
    return parte.replace(PAR_DE_TACHADO, (trecho, miolo: string) => {
      if (miolo.trim() === '') return trecho;
      removidos += 1;
      return soQuebras(miolo);
    });
  });
  return { texto: partes.join(''), removidos };
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
