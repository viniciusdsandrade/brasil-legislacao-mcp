import type { Cabecalho, ValorCabecalho } from './tipos.js';

export interface DocumentoSeparado {
  cabecalho: Cabecalho;
  corpo: string;
  temCabecalho: boolean;
}

const LINHA_CHAVE = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/;
const INDICADOR_BLOCO = /^[|>][+-]?$/;

/** Lê uma string entre aspas duplas no estilo JSON e ignora o que vem depois (por exemplo um comentário). */
function lerAspasDuplas(valor: string): string {
  let fim = -1;
  for (let i = 1; i < valor.length; i += 1) {
    const caractere = valor[i];
    if (caractere === '\\') {
      i += 1;
      continue;
    }
    if (caractere === '"') {
      fim = i;
      break;
    }
  }
  const literal = fim > 0 ? valor.slice(0, fim + 1) : `${valor}"`;
  try {
    const lido: unknown = JSON.parse(literal);
    if (typeof lido === 'string') return lido;
  } catch {
    // Escapes do YAML fora do JSON: cai na leitura simples abaixo.
  }
  return literal.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

function lerAspasSimples(valor: string): string {
  const fim = valor.indexOf("'", 1);
  let interno = valor.slice(1);
  if (fim > 0) {
    let i = 1;
    let saida = '';
    while (i < valor.length) {
      const caractere = valor[i];
      if (caractere === "'") {
        if (valor[i + 1] === "'") {
          saida += "'";
          i += 2;
          continue;
        }
        break;
      }
      saida += caractere ?? '';
      i += 1;
    }
    interno = saida;
  }
  return interno;
}

/** Converte o valor escalar de uma linha do cabeçalho. Datas e números ficam como texto. */
export function interpretarValor(bruto: string): ValorCabecalho {
  const valor = bruto.trim();
  if (valor === '' || valor === '~' || /^null$/i.test(valor)) return null;
  if (/^true$/i.test(valor)) return true;
  if (/^false$/i.test(valor)) return false;
  if (valor.startsWith('"')) return lerAspasDuplas(valor);
  if (valor.startsWith("'")) return lerAspasSimples(valor);
  const comentario = valor.search(/\s#/);
  return comentario >= 0 ? valor.slice(0, comentario).trimEnd() : valor;
}

/** Separa o cabeçalho YAML do corpo Markdown e lê as chaves do cabeçalho. */
export function separarCabecalho(texto: string): DocumentoSeparado {
  const normal = (texto.startsWith('\uFEFF') ? texto.slice(1) : texto).replace(/\r\n?/g, '\n');
  if (!normal.startsWith('---\n')) return { cabecalho: {}, corpo: normal, temCabecalho: false };
  const linhas = normal.split('\n');
  let fim = -1;
  for (let i = 1; i < linhas.length; i += 1) {
    if ((linhas[i] ?? '').trimEnd() === '---') {
      fim = i;
      break;
    }
  }
  if (fim < 0) return { cabecalho: {}, corpo: normal, temCabecalho: false };

  const cabecalho: Cabecalho = {};
  let chaveAtual: string | null = null;
  let bloco: { chave: string; dobrar: boolean; partes: string[] } | null = null;
  const fecharBloco = (): void => {
    if (bloco) {
      cabecalho[bloco.chave] = bloco.partes.join(bloco.dobrar ? ' ' : '\n').trim();
      bloco = null;
    }
  };
  for (const linha of linhas.slice(1, fim)) {
    const continuacao = /^[ \t]/.test(linha);
    if (bloco && (continuacao || linha.trim() === '')) {
      bloco.partes.push(linha.trim());
      continue;
    }
    if (continuacao && chaveAtual !== null) {
      const anterior = cabecalho[chaveAtual];
      if (typeof anterior === 'string') cabecalho[chaveAtual] = `${anterior} ${linha.trim()}`.trim();
      continue;
    }
    fecharBloco();
    const encontrado = LINHA_CHAVE.exec(linha);
    if (!encontrado) {
      chaveAtual = null;
      continue;
    }
    const chave = encontrado[1] ?? '';
    const resto = encontrado[2] ?? '';
    chaveAtual = chave;
    if (INDICADOR_BLOCO.test(resto.trim())) {
      bloco = { chave, dobrar: resto.trim().startsWith('>'), partes: [] };
      cabecalho[chave] = '';
      continue;
    }
    cabecalho[chave] = interpretarValor(resto);
  }
  fecharBloco();
  return { cabecalho, corpo: linhas.slice(fim + 1).join('\n'), temCabecalho: true };
}
