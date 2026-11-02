const MARCAS_DIACRITICAS = /\p{M}+/gu;

/** Remove acentos e passa para minúsculas: "Transitórias" vira "transitorias". */
export function dobrar(texto: string): string {
  return texto.normalize('NFD').replace(MARCAS_DIACRITICAS, '').toLowerCase();
}

/** Forma das chaves do CANONICO: minúsculas, sem acento, palavras separadas por um espaço. */
export function normalizarChave(texto: string): string {
  return dobrar(texto)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Slug no padrão das pastas do acervo: "Rio de Janeiro" vira "rio-de-janeiro". */
export function slug(texto: string): string {
  return normalizarChave(texto).replace(/ /g, '-');
}

/** Corta o texto no limite, de preferência num espaço, e acrescenta reticências. */
export function truncar(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, Math.max(1, maximo - 1));
  const espaco = corte.lastIndexOf(' ');
  const base = espaco > maximo * 0.6 ? corte.slice(0, espaco) : corte;
  return `${base.trimEnd()}…`;
}

/** Tira a marcação Markdown e HTML de uma linha e junta os espaços. */
export function limparMarkdown(texto: string): string {
  return texto
    .replace(/<[^>]{1,200}>/g, ' ')
    .replace(/~~/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/(^|\s)[*_](?=\S)|(?<=\S)[*_](?=\s|$)/g, '$1')
    .replace(/\\([\\*_#>|-])/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valor textual de um campo: texto não vazio, ou null. */
export function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

/** Data ISO (AAAA-MM-DD) válida no calendário, ou null. */
export function dataIso(valor: unknown): string | null {
  const texto = textoOuNulo(valor);
  if (texto === null || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [ano, mes, dia] = texto.split('-').map((parte) => Number(parte));
  if (ano === undefined || mes === undefined || dia === undefined) return null;
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const valida = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return valida ? texto : null;
}

/** Hash FNV-1a de 32 bits em hexadecimal. Serve para conferir cursores, não para segurança. */
export function fnv1a(texto: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const ROMANOS: ReadonlyArray<readonly [number, string]> = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Número arábico em romano (1 a 3999). */
export function paraRomano(numero: number): string {
  let resto = Math.trunc(numero);
  let saida = '';
  for (const [valor, simbolo] of ROMANOS) {
    while (resto >= valor) {
      saida += simbolo;
      resto -= valor;
    }
  }
  return saida;
}

/** Ordinal das leis brasileiras: 1º a 9º; do 10 em diante, o número puro. */
export function ordinal(chave: string): string {
  const [numero = '', ...sufixo] = chave.split('-');
  const resto = sufixo.length > 0 ? `-${sufixo.join('-')}` : '';
  if (/^\d+$/.test(numero) && Number(numero) < 10) return `${numero}º${resto}`;
  return `${numero}${resto}`;
}
