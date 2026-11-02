import { describe, expect, it } from 'vitest';
import { lerConfiguracao, REMOTO_PADRAO } from '../src/config.js';

describe('configuração por variáveis de ambiente', () => {
  it('usa os padrões', () => {
    const configuracao = lerConfiguracao({ XDG_CACHE_HOME: '/tmp/cache' });
    expect(configuracao).toMatchObject({
      remoto: REMOTO_PADRAO,
      ramo: 'main',
      escopo: ['constituicao', 'federal'],
      corpo: [],
      orcamentoTokens: 8000,
      rg: 'rg',
      git: 'git',
      nivelLog: 'info',
      clone: '/tmp/cache/leis-mcp/acervo',
      indice: '/tmp/cache/leis-mcp/indice.sqlite',
    });
  });

  it('lê escopo, corpo, orçamento, log e pastas', () => {
    const configuracao = lerConfiguracao({
      LEIS_ESCOPO: 'federal, estaduais/SP',
      LEIS_CORPO: 'federal/leis-ordinarias',
      LEIS_ORCAMENTO_TOKENS: '1500',
      LEIS_LOG: 'debug',
      LEIS_CLONE: '/tmp/x/clone',
      LEIS_INDICE: '/tmp/x/indice.sqlite',
    });
    expect(configuracao).toMatchObject({
      escopo: ['estaduais/SP', 'federal'],
      corpo: ['federal/leis-ordinarias'],
      orcamentoTokens: 1500,
      nivelLog: 'depuracao',
      clone: '/tmp/x/clone',
      indice: '/tmp/x/indice.sqlite',
    });
  });
});
