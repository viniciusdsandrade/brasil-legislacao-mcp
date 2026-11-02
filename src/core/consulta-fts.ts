import { ErroLeis } from './erros.js';

export const MAX_TERMOS = 12;
const COLUNA = /^[a-z_]+$/;

export interface ConsultaFts {
  /** Expressão FTS5 montada só com termos entre aspas. Nunca contém texto cru do usuário. */
  expressao: string;
  termos: string[];
}

interface Termo {
  valor: string;
  prefixo: boolean;
}

function aspas(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

/**
 * Monta uma expressão FTS5 segura: cada palavra vira uma string entre aspas; frases entre
 * aspas viram uma frase; operadores, filtros de coluna e parênteses do usuário viram texto.
 * Termos são unidos por AND. "palavra*" vira busca por prefixo (3 letras ou mais).
 */
export function montarConsultaFts(texto: string, colunas: readonly string[] = []): ConsultaFts | null {
  for (const coluna of colunas) {
    if (!COLUNA.test(coluna)) throw new ErroLeis('interno', `Coluna FTS inválida: ${coluna}.`, 'Corrija o código.');
  }
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

/**
 * Padrão de regex para o ripgrep que ignora acentos: "acao civil" casa "Ação  Civil".
 * A busca trata o texto como uma frase. Caracteres especiais são escapados.
 */
export function padraoSemAcento(texto: string): string | null {
  const palavras = texto
    .normalize('NFC')
    .split(/\s+/)
    .map((palavra) => palavra.trim())
    .filter((palavra) => palavra !== '')
    .slice(0, MAX_TERMOS);
  if (palavras.join('').replace(/[^\p{L}\p{N}]/gu, '').length < 2) return null;
  const regex = palavras
    .map((palavra) =>
      [...palavra]
        .map((caractere) => {
          const base = caractere.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
          const variantes = VARIANTES[base];
          if (variantes) return `[${variantes}${variantes.toUpperCase()}]`;
          return caractere.replace(/[\\^$.*+?()[\]{}|/-]/g, '\\$&');
        })
        .join(''),
    )
    .join('\\s+');
  return regex;
}
