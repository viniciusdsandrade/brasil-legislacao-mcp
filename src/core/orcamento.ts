/** Estimativa usada para o orçamento: cerca de 4 caracteres por token. */
export const CARACTERES_POR_TOKEN = 4;
export const ORCAMENTO_MINIMO = 500;
export const ORCAMENTO_MAXIMO = 200_000;
export const ORCAMENTO_PADRAO = 8_000;

export function tokensEstimados(texto: string): number {
  return Math.ceil(texto.length / CARACTERES_POR_TOKEN);
}

export function caracteresDoOrcamento(tokens: number): number {
  return Math.max(ORCAMENTO_MINIMO, tokens) * CARACTERES_POR_TOKEN;
}

/** Orçamento válido a partir do valor configurado. */
export function normalizarOrcamento(valor: number | undefined): number {
  if (valor === undefined || !Number.isFinite(valor)) return ORCAMENTO_PADRAO;
  return Math.min(ORCAMENTO_MAXIMO, Math.max(ORCAMENTO_MINIMO, Math.trunc(valor)));
}

/** Verdadeiro quando a resposta serializada cabe no orçamento. */
export function cabe(resposta: unknown, tokens: number): boolean {
  return JSON.stringify(resposta).length <= caracteresDoOrcamento(tokens);
}
