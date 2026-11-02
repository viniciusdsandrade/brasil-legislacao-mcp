import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { exigirCaminho, validarCaminhoFalhas } from '../core/caminho.js';
import { ErroLeis } from '../core/erros.js';
import type { Acervo, LeitorArquivos } from '../core/portas.js';

const MAX_ARQUIVO = 64 * 1024 * 1024;

async function dentroDaRaiz(raiz: string, relativo: string): Promise<string | null> {
  let raizReal: string;
  try {
    raizReal = await realpath(raiz);
  } catch {
    return null;
  }
  const absoluto = resolve(raizReal, relativo);
  if (!absoluto.startsWith(`${raizReal}${sep}`)) return null;
  let real: string;
  try {
    real = await realpath(absoluto);
  } catch {
    return null;
  }
  if (!real.startsWith(`${raizReal}${sep}`)) {
    throw new ErroLeis('caminho_invalido', 'O caminho sai do clone do acervo.', 'Use o caminho de um item de leis_buscar.');
  }
  const informacao = await stat(real);
  if (!informacao.isFile() || informacao.size > MAX_ARQUIVO) return null;
  return real;
}

/** Leitura somente de arquivos .md de norma e de _falhas.jsonl dentro do clone. */
export class AcervoLocal implements Acervo {
  constructor(private readonly raiz: string) {}

  async ler(caminho: string): Promise<string> {
    const valido = exigirCaminho(caminho);
    const real = await dentroDaRaiz(this.raiz, valido);
    if (real === null) {
      throw new ErroLeis(
        'nao_encontrada',
        `O arquivo ${valido} não está no clone local.`,
        'Rode o comando sync do leis-mcp. Se o caminho fica fora de LEIS_ESCOPO, acrescente a pasta ao escopo.',
      );
    }
    return readFile(real, 'utf8');
  }

  async lerRaiz(nome: 'COBERTURA.md' | 'PROGRESSO.md'): Promise<string | null> {
    if (nome !== 'COBERTURA.md' && nome !== 'PROGRESSO.md') return null;
    try {
      return await readFile(join(this.raiz, nome), 'utf8');
    } catch {
      return null;
    }
  }

  async lerFalhas(caminho: string): Promise<string | null> {
    if (!validarCaminhoFalhas(caminho)) return null;
    try {
      const real = await dentroDaRaiz(this.raiz, caminho);
      return real === null ? null : await readFile(real, 'utf8');
    } catch {
      return null;
    }
  }
}

/** Leitor do sync: devolve null quando o arquivo não existe no clone. */
export class LeitorDoClone implements LeitorArquivos {
  constructor(private readonly raiz: string) {}

  async ler(caminho: string): Promise<string | null> {
    try {
      const real = await dentroDaRaiz(this.raiz, caminho);
      return real === null ? null : await readFile(real, 'utf8');
    } catch {
      return null;
    }
  }
}
