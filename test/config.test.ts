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
      httpHost: '127.0.0.1',
      httpPorta: 3920,
    });
  });

  it('lê o endereço do modo http e recusa endereço que não é local', () => {
    expect(lerConfiguracao({ LEIS_HTTP_HOST: '::1', LEIS_HTTP_PORTA: '0' })).toMatchObject({ httpHost: '::1', httpPorta: 0 });
    expect(() => lerConfiguracao({ LEIS_HTTP_HOST: '0.0.0.0' })).toThrow(/endereço local/);
    expect(() => lerConfiguracao({ LEIS_HTTP_PORTA: '70000' })).toThrow(/LEIS_HTTP_PORTA/);
    expect(() => lerConfiguracao({ LEIS_HTTP_PORTA: '-1' })).toThrow(/LEIS_HTTP_PORTA/);
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
