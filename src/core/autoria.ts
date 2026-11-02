import { analisarCaminho } from './caminho.js';
import type { RegistroAutoria } from './tipos.js';

export const SEPARADOR_REGISTRO = '\x1e';
export const SEPARADOR_CAMPO = '\x1f';

/** Formato do git log lido por LeitorLogAutoria. Cada registro começa com o separador 0x1E. */
export const FORMATO_LOG_AUTORIA = '%x1eC%H%x1fA%an%x1fB%B%x1fE';

const LINHA_AUTORIA = /^Autoria:[ \t]*(.*)$/m;
const LINHA_FONTE = /^Fonte:[ \t]*(\S+)/m;
const COAUTOR = /^Co-Authored-By:[ \t]*(.+?)[ \t]*(?:<[^>\n]*>)?[ \t]*$/gim;

/**
 * Converte um registro do git log em autoria. Só aceita commits da base inicial:
 * uma linha "Autoria:" e exatamente uma norma acrescentada. Commits de lote e
 * commits de desenvolvimento (com Co-Authored-By de ferramentas) ficam de fora.
 */
export function interpretarRegistroDeLog(bruto: string): RegistroAutoria | null {
  const campos = bruto.split(SEPARADOR_CAMPO);
  if (campos.length < 4) return null;
  const [campoCommit = '', campoAutor = '', campoCorpo = ''] = campos;
  if (!campoCommit.startsWith('C') || !campoAutor.startsWith('A') || !campoCorpo.startsWith('B')) return null;
  const commit = campoCommit.slice(1).trim();
  const autor = campoAutor.slice(1).trim();
  const corpo = campoCorpo.slice(1);
  const cauda = campos.slice(3).join(SEPARADOR_CAMPO).replace(/^E/, '');
  const arquivos = cauda
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha.endsWith('.md'));
  const origem = LINHA_AUTORIA.exec(corpo);
  if (commit === '' || autor === '' || origem === null || arquivos.length !== 1) return null;
  const caminho = arquivos[0] ?? '';
  if (analisarCaminho(caminho) === null) return null;
  const coautores = [...corpo.matchAll(COAUTOR)]
    .map((encontrado) => (encontrado[1] ?? '').trim())
    .filter((nome) => nome !== '' && nome !== autor);
  return {
    commit,
    autor,
    coautores: [...new Set(coautores)],
    origem: (origem[1] ?? '').trim() || null,
    fonte: LINHA_FONTE.exec(corpo)?.[1] ?? null,
    caminho,
  };
}

/** Lê a saída do git log em pedaços, sem guardar o histórico inteiro na memória. */
export class LeitorLogAutoria {
  private pendente = '';

  alimentar(pedaco: string): RegistroAutoria[] {
    this.pendente += pedaco;
    const partes = this.pendente.split(SEPARADOR_REGISTRO);
    this.pendente = partes.pop() ?? '';
    return LeitorLogAutoria.converter(partes);
  }

  terminar(): RegistroAutoria[] {
    const resto = this.pendente;
    this.pendente = '';
    return LeitorLogAutoria.converter([resto]);
  }

  private static converter(partes: readonly string[]): RegistroAutoria[] {
    const registros: RegistroAutoria[] = [];
    for (const parte of partes) {
      if (parte.trim() === '') continue;
      const registro = interpretarRegistroDeLog(parte);
      if (registro) registros.push(registro);
    }
    return registros;
  }
}
