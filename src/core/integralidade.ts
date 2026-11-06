import { validarCaminho } from './caminho.js';
import { dataIso, dobrar, truncar } from './texto.js';
import type { Pendencia } from './tipos.js';

/**
 * Registro auditável de pendências de integralidade, no repositório do acervo. Ele lista as
 * normas cujo texto está preservado, mas ainda não foi validado como completo. Na maioria,
 * falta o anexo ou o suplemento a que a norma remete.
 */
export const CAMINHO_DO_REGISTRO_DE_PENDENCIAS = 'scripts/dados/pendencias-integralidade-publicadas.json';

const MAX_ESTADO = 120;
const MAX_MOTIVO = 1_000;
const MAX_CRITERIO = 600;
const MAX_MOTIVO_NO_AVISO = 300;

export interface RegistroDePendencias {
  /** Data do registro (AAAA-MM-DD), ou null. */
  data: string | null;
  /** Critério do registro, nas palavras dele, ou null. */
  criterio: string | null;
  pendentes: Pendencia[];
}

function textoLimitado(valor: unknown, maximo: number): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.replace(/\s+/g, ' ').trim();
  return limpo === '' ? null : truncar(limpo, maximo);
}

/**
 * Lê o registro de pendências: { data, criterio, pendentes: [{ path, estado, motivo, ... }] }.
 * Devolve null quando o conteúdo não é esse registro. Um item sem caminho de norma é ignorado,
 * e um caminho repetido vale uma vez.
 */
export function lerRegistroDePendencias(conteudo: string): RegistroDePendencias | null {
  let lido: unknown;
  try {
    lido = JSON.parse(conteudo);
  } catch {
    return null;
  }
  if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) return null;
  const registro = lido as Record<string, unknown>;
  const itens = registro['pendentes'];
  if (!Array.isArray(itens)) return null;
  const vistos = new Set<string>();
  const pendentes: Pendencia[] = [];
  for (const item of itens as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const campos = item as Record<string, unknown>;
    const caminho = validarCaminho(campos['path']);
    if (caminho === null || vistos.has(caminho)) continue;
    vistos.add(caminho);
    pendentes.push({
      caminho,
      estado: textoLimitado(campos['estado'], MAX_ESTADO) ?? 'pendente',
      motivo: textoLimitado(campos['motivo'], MAX_MOTIVO) ?? '',
    });
  }
  return { data: dataIso(registro['data']), criterio: textoLimitado(registro['criterio'], MAX_CRITERIO), pendentes };
}

const DIFERENCA_DE_CARACTERES = /unicode|decodificac/;
// "Não reproduzido" cobre os avisos da própria fonte, como o de um convênio que acompanha a norma e não foi transcrito.
const FALTA_ANEXO = /\b(?:anexo|suplemento|objeto|modelo|orcamento|tabela|planta)s?\b|nota diplomatica|nao reproduzid/;

/** O que a pendência quer dizer para quem lê a norma. O registro é conservador: não afirma que falta texto. */
function resumoDaPendencia(pendencia: Pendencia): string {
  const pista = dobrar(`${pendencia.estado.replace(/_/g, ' ')} ${pendencia.motivo}`);
  if (DIFERENCA_DE_CARACTERES.test(pista)) return 'O texto pode ter caracteres diferentes dos da fonte.';
  if (FALTA_ANEXO.test(pista)) return 'O texto pode não trazer um anexo, um suplemento ou outro objeto a que a norma remete.';
  return 'O texto ou os dados da norma podem estar incompletos ou diferentes da fonte.';
}

/** Aviso de integralidade pendente para as respostas de leis_obter. */
export function avisoDaPendencia(pendencia: Pendencia, dataDoRegistro: string | null): string {
  const quando = dataDoRegistro === null ? '' : ` de ${dataDoRegistro}`;
  const motivo = truncar(pendencia.motivo, MAX_MOTIVO_NO_AVISO).replace(/[.\s]+$/, '');
  const citado = motivo === '' ? '' : ` Motivo registrado: "${motivo}".`;
  return (
    `Integralidade pendente: o registro de pendências do acervo${quando} lista esta norma. O texto está preservado, mas ainda não foi validado como completo. ` +
    `${resumoDaPendencia(pendencia)}${citado} Confira a fonte antes de citar.`
  );
}
