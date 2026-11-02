import { ErroLeis } from './erros.js';

export const MAX_TERMOS = 12;
const COLUNA = /^[a-z_]+$/;

export interface ConsultaFts {
  /** Expressão FTS5 montada só com termos entre aspas. Nunca contém texto cru do usuário. */
  expressao: string;
  termos: string[];
}

export interface Termo {
  /** Palavra, ou palavras de uma frase separadas por um espaço. */
  valor: string;
  prefixo: boolean;
}

function aspas(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * Lê os termos da busca: frases entre aspas, palavras e prefixos ("palavra*", 3 letras ou mais).
 * Operadores, filtros de coluna e parênteses do usuário viram texto. O FTS5 e o ripgrep usam
 * os mesmos termos, então as duas buscas têm a mesma regra: o documento precisa ter todos.
 */
export function extrairTermos(texto: string): Termo[] {
  const termos: Termo[] = [];
  const semFrases = texto.normalize('NFC').replace(/["“”]([^"“”]{1,200})["“”]/g, (_trecho, frase: string) => {
    const palavras = frase.split(/[^\p{L}\p{N}]+/u).filter((palavra) => palavra !== '');
    if (palavras.length > 0 && termos.length < MAX_TERMOS) termos.push({ valor: palavras.join(' '), prefixo: false });
    return ' ';
  });
  for (const encontrado of semFrases.matchAll(/([\p{L}\p{N}]+)(\*)?/gu)) {
    if (termos.length >= MAX_TERMOS) break;
    const valor = encontrado[1] ?? '';
    if (valor.length < 2 && !/\d/.test(valor)) continue;
    termos.push({ valor, prefixo: encontrado[2] === '*' && valor.length >= 3 });
  }
  return termos;
}

/**
 * Monta uma expressão FTS5 segura: cada palavra vira uma string entre aspas; frases entre
 * aspas viram uma frase. Termos são unidos por AND. "palavra*" vira busca por prefixo.
 */
export function montarConsultaFts(texto: string, colunas: readonly string[] = []): ConsultaFts | null {
  for (const coluna of colunas) {
    if (!COLUNA.test(coluna)) throw new ErroLeis('interno', `Coluna FTS inválida: ${coluna}.`, 'Corrija o código.');
  }
  const termos = extrairTermos(texto);
  if (termos.length === 0) return null;
  const filtro = colunas.length > 0 ? `{${colunas.join(' ')}} : ` : '';
  return {
    expressao: termos.map((termo) => `${filtro}${aspas(termo.valor)}${termo.prefixo ? '*' : ''}`).join(' AND '),
    termos: termos.map((termo) => termo.valor),
  };
}

const VARIANTES: Readonly<Record<string, string>> = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôõö',
  u: 'uúùûü',
  c: 'cç',
  n: 'nñ',
};

/** Fora de letra e dígito: o limite de um termo, como no tokenizador unicode61 do FTS5. */
const SEPARADOR = '[^\\p{L}\\p{N}]';

/** Uma palavra com classes que ignoram acento: "acao" casa "ação". Caracteres especiais são escapados. */
function semAcento(palavra: string): string {
  return [...palavra]
    .map((caractere) => {
      const base = caractere.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
      const variantes = VARIANTES[base];
      if (variantes) return `[${variantes}${variantes.toUpperCase()}]`;
      return caractere.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
    })
    .join('');
}

/**
 * Padrões de regex para o ripgrep, um por termo. O arquivo precisa casar todos (AND), como no
 * FTS5. Cada termo casa a palavra inteira; "palavra*" casa o prefixo; uma frase casa as palavras
 * em sequência. Os padrões ignoram acentos e usam a mesma sintaxe no ripgrep e no JavaScript.
 */
export function padroesDaBusca(texto: string): string[] {
  return extrairTermos(texto).map((termo) => {
    const miolo = termo.valor.split(' ').map(semAcento).join(`${SEPARADOR}+`);
    return `(?:^|${SEPARADOR})${miolo}${termo.prefixo ? '' : `(?:${SEPARADOR}|$)`}`;
  });
}
