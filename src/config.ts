import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizarEscopo } from './core/caminho.js';
import { ErroLeis } from './core/erros.js';
import { normalizarOrcamento } from './core/orcamento.js';
import { nivelDeLog, type NivelLog } from './log.js';

export const REMOTO_PADRAO = 'https://github.com/viniciusdsandrade/leis.git';
export const RAMO_PADRAO = 'main';
export const ESCOPO_PADRAO = 'constituicao,federal';

export interface Configuracao {
  remoto: string;
  ramo: string;
  clone: string;
  indice: string;
  escopo: string[];
  corpo: string[];
  orcamentoTokens: number;
  rg: string;
  git: string;
  nivelLog: NivelLog;
}

function lista(valor: string | undefined): string[] {
  return (valor ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '');
}

function semOpcao(valor: string, nome: string): string {
  if (valor === '' || valor.startsWith('-')) {
    throw new ErroLeis('entrada_invalida', `Valor inválido em ${nome}: "${valor}".`, `Corrija a variável ${nome}.`);
  }
  return valor;
}

/** Lê a configuração das variáveis de ambiente. */
export function lerConfiguracao(ambiente: NodeJS.ProcessEnv = process.env): Configuracao {
  const cacheBase = ambiente['XDG_CACHE_HOME']?.trim() || join(homedir(), '.cache');
  const pasta = join(cacheBase, 'leis-mcp');
  const ramo = semOpcao((ambiente['LEIS_RAMO'] ?? RAMO_PADRAO).trim(), 'LEIS_RAMO');
  if (!/^[A-Za-z0-9._/-]+$/.test(ramo)) {
    throw new ErroLeis('entrada_invalida', `Ramo inválido em LEIS_RAMO: "${ramo}".`, 'Use um nome de ramo git, por exemplo "main".');
  }
  const escopo = normalizarEscopo(lista(ambiente['LEIS_ESCOPO'] ?? ESCOPO_PADRAO));
  if (escopo.length === 0) {
    throw new ErroLeis('entrada_invalida', 'LEIS_ESCOPO está vazio.', 'Use, por exemplo, "constituicao,federal".');
  }
  const orcamentoBruto = ambiente['LEIS_ORCAMENTO_TOKENS'];
  return {
    remoto: semOpcao((ambiente['LEIS_REMOTO'] ?? REMOTO_PADRAO).trim(), 'LEIS_REMOTO'),
    ramo,
    clone: resolve(ambiente['LEIS_CLONE']?.trim() || join(pasta, 'acervo')),
    indice: resolve(ambiente['LEIS_INDICE']?.trim() || join(pasta, 'indice.sqlite')),
    escopo,
    corpo: normalizarEscopo(lista(ambiente['LEIS_CORPO'])),
    orcamentoTokens: normalizarOrcamento(orcamentoBruto === undefined ? undefined : Number(orcamentoBruto)),
    rg: semOpcao((ambiente['LEIS_RG'] ?? 'rg').trim(), 'LEIS_RG'),
    git: semOpcao((ambiente['LEIS_GIT'] ?? 'git').trim(), 'LEIS_GIT'),
    nivelLog: nivelDeLog(ambiente['LEIS_LOG']),
  };
}
