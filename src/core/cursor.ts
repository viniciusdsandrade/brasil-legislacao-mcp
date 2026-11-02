import { ErroLeis } from './erros.js';

export type ValorCursor = string | number | boolean | null;
export type DadosCursor = Record<string, ValorCursor>;

const MAX_CURSOR = 2048;

/** Cursor opaco: JSON em base64url. */
export function codificarCursor(dados: DadosCursor): string {
  return Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url');
}

function erroCursor(): ErroLeis {
  return new ErroLeis(
    'cursor_invalido',
    'O cursor não é válido para esta consulta.',
    'Repita a chamada sem o parâmetro cursor, ou use o cursor da última resposta da mesma consulta.',
  );
}

/** Lê um cursor e confere o tipo e a impressão digital da consulta. */
export function decodificarCursor(cursor: string, tipo: string, impressao: string): DadosCursor {
  if (cursor.length > MAX_CURSOR || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw erroCursor();
  let dados: unknown;
  try {
    dados = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw erroCursor();
  }
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) throw erroCursor();
  const registro = dados as Record<string, unknown>;
  if (registro['t'] !== tipo || registro['f'] !== impressao) throw erroCursor();
  const saida: DadosCursor = {};
  for (const [chave, valor] of Object.entries(registro)) {
    if (valor === null || ['string', 'number', 'boolean'].includes(typeof valor)) saida[chave] = valor as ValorCursor;
  }
  return saida;
}

export function numeroDoCursor(dados: DadosCursor, chave: string): number {
  const valor = dados[chave];
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) throw erroCursor();
  return valor;
}
