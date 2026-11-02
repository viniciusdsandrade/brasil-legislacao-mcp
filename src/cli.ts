#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { AcervoLocal, LeitorDoClone } from './adaptadores/acervo-local.js';
import { GitLocal } from './adaptadores/git.js';
import { criarServidorMcp } from './adaptadores/mcp/servidor.js';
import { RipgrepLocal } from './adaptadores/ripgrep.js';
import { abrirIndiceEscrita, abrirIndiceLeitura, type IndiceSqlite } from './adaptadores/sqlite/indice.js';
import { lerConfiguracao, type Configuracao } from './config.js';
import { ehErroLeis, mensagemDe } from './core/erros.js';
import { ServicoLeis } from './core/servico.js';
import { sincronizar } from './core/sincronizacao.js';
import { criarLog, nivelDeLog, type Log } from './log.js';

const AJUDA = `leis-mcp: servidor MCP do acervo de legislação brasileira viniciusdsandrade/leis.

Uso:
  leis-mcp [serve]   Inicia o servidor MCP em stdio (padrão).
  leis-mcp sync      Clona ou atualiza o acervo e o índice local.
  leis-mcp status    Mostra o estado do índice local.
  leis-mcp --version Mostra a versão.

Variáveis de ambiente:
  LEIS_REMOTO            Repositório git do acervo.
  LEIS_RAMO              Ramo do acervo (padrão: main).
  LEIS_CLONE             Pasta do clone parcial.
  LEIS_INDICE            Arquivo SQLite do índice.
  LEIS_ESCOPO            Esferas e pastas no clone (padrão: constituicao,federal).
  LEIS_CORPO             Pastas com o corpo no índice FTS5 (padrão: nenhuma).
  LEIS_ORCAMENTO_TOKENS  Orçamento de tokens por resposta (padrão: 8000).
  LEIS_RG                Programa ripgrep (padrão: rg).
  LEIS_GIT               Programa git (padrão: git).
  LEIS_LOG               erro, aviso, info ou depuracao (padrão: info).
`;

function versao(): string {
  try {
    const pacote: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    if (typeof pacote === 'object' && pacote !== null && typeof (pacote as { version?: unknown }).version === 'string') {
      return (pacote as { version: string }).version;
    }
  } catch {
    // Sem package.json ao lado: usa a versão desconhecida.
  }
  return '0.0.0';
}

function escreverJson(valor: unknown): void {
  process.stdout.write(`${JSON.stringify(valor, null, 2)}\n`);
}

function servir(configuracao: Configuracao, log: Log): void {
  let indice: IndiceSqlite | null = null;
  const servico = new ServicoLeis({
    indice: () => {
      if (indice === null) indice = abrirIndiceLeitura(configuracao.indice);
      return indice;
    },
    acervo: new AcervoLocal(configuracao.clone),
    buscaTextual: new RipgrepLocal({ binario: configuracao.rg, raiz: configuracao.clone }),
    orcamentoTokens: configuracao.orcamentoTokens,
  });
  const alca = serveStdio(() => criarServidorMcp(servico, { versao: versao(), log }), {
    onerror: (erro) => log.erro('erro no transporte stdio', { erro: erro.message }),
  });
  const encerrar = (): void => {
    void alca.close().finally(() => {
      indice?.fechar();
      process.exit(0);
    });
  };
  process.once('SIGINT', encerrar);
  process.once('SIGTERM', encerrar);
  log.info('servidor MCP pronto em stdio', { indice: configuracao.indice, escopo: configuracao.escopo });
}

async function sincronizarAcervo(configuracao: Configuracao, log: Log): Promise<number> {
  const indice = abrirIndiceEscrita(configuracao.indice);
  try {
    const relatorio = await sincronizar(
      {
        git: new GitLocal({
          binario: configuracao.git,
          diretorio: configuracao.clone,
          remoto: configuracao.remoto,
          ramo: configuracao.ramo,
        }),
        gravador: indice,
        leitor: new LeitorDoClone(configuracao.clone),
        relogio: { agora: () => new Date() },
        log: (nivel, mensagem, dados) => {
          if (nivel === 'aviso') log.aviso(mensagem, dados);
          else if (nivel === 'depuracao') log.depuracao(mensagem, dados);
          else log.info(mensagem, dados);
        },
      },
      { remoto: configuracao.remoto, ramo: configuracao.ramo, escopo: configuracao.escopo, corpo: configuracao.corpo },
    );
    escreverJson(relatorio);
    return 0;
  } finally {
    indice.fechar();
  }
}

function mostrarEstado(configuracao: Configuracao): number {
  const indice = abrirIndiceLeitura(configuracao.indice);
  try {
    escreverJson({
      indice: configuracao.indice,
      clone: configuracao.clone,
      escopo_configurado: configuracao.escopo,
      corpo_configurado: configuracao.corpo,
      estado: indice.estado(),
    });
    return 0;
  } finally {
    indice.fechar();
  }
}

async function principal(argumentos: readonly string[]): Promise<number | null> {
  const comando = argumentos[0] ?? 'serve';
  if (comando === '--help' || comando === '-h' || comando === 'ajuda') {
    process.stdout.write(AJUDA);
    return 0;
  }
  if (comando === '--version' || comando === '-v' || comando === 'versao') {
    process.stdout.write(`${versao()}\n`);
    return 0;
  }
  const log = criarLog(nivelDeLog(process.env['LEIS_LOG']));
  try {
    const configuracao = lerConfiguracao();
    switch (comando) {
      case 'serve':
        servir(configuracao, log);
        return null;
      case 'sync':
        return await sincronizarAcervo(configuracao, log);
      case 'status':
        return mostrarEstado(configuracao);
      default:
        process.stderr.write(`Comando desconhecido: ${comando}\n\n${AJUDA}`);
        return 2;
    }
  } catch (erro) {
    if (ehErroLeis(erro)) log.erro(erro.message, { proximo_passo: erro.proximoPasso });
    else log.erro(mensagemDe(erro));
    return 1;
  }
}

principal(process.argv.slice(2)).then(
  (codigo) => {
    if (codigo !== null) process.exitCode = codigo;
  },
  (erro: unknown) => {
    process.stderr.write(`[leis-mcp] erro: ${mensagemDe(erro)}\n`);
    process.exitCode = 1;
  },
);
