import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizarEscopo } from './core/caminho.js';
import { ErroLeis } from './core/erros.js';
import { normalizarOrcamento } from './core/orcamento.js';
import { nivelDeLog, type NivelLog } from './log.js';

export const REMOTO_PADRAO = 'https://github.com/viniciusdsandrade/leis.git';
export const RAMO_PADRAO = 'main';
export const ESCOPO_PADRAO = 'constituicao,federal';
export const HTTP_HOST_PADRAO = '127.0.0.1';
export const HTTP_PORTA_PADRAO = 3920;
const HTTP_HOSTS_LOCAIS = ['127.0.0.1', '::1', 'localhost'];

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
  /** Endereço do transporte HTTP: só endereço local. */
  httpHost: string;
  httpPorta: number;
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
  const httpHost = (ambiente['LEIS_HTTP_HOST'] ?? HTTP_HOST_PADRAO).trim();
  if (!HTTP_HOSTS_LOCAIS.includes(httpHost)) {
    throw new ErroLeis(
      'entrada_invalida',
      `LEIS_HTTP_HOST aceita só endereço local, não "${httpHost}".`,
      `Use ${HTTP_HOSTS_LOCAIS.join(', ')}. O transporte HTTP não tem autenticação.`,
    );
  }
  const httpPortaTexto = (ambiente['LEIS_HTTP_PORTA'] ?? String(HTTP_PORTA_PADRAO)).trim();
  const httpPorta = Number(httpPortaTexto);
  if (!/^\d{1,5}$/.test(httpPortaTexto) || httpPorta > 65_535) {
    throw new ErroLeis('entrada_invalida', `Porta inválida em LEIS_HTTP_PORTA: "${httpPortaTexto}".`, 'Use um número de 0 a 65535, por exemplo 3920.');
  }
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
    httpHost,
    httpPorta,
  };
}
