import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LeitorDoClone } from '../src/adaptadores/acervo-local.js';
import { GitLocal } from '../src/adaptadores/git.js';
import { abrirIndiceEscrita, type IndiceSqlite } from '../src/adaptadores/sqlite/indice.js';
import { montarConsultaFts } from '../src/core/consulta-fts.js';
import type { LeitorArquivos } from '../src/core/portas.js';
import { sincronizar, type RelatorioSync } from '../src/core/sincronizacao.js';
import { CAMINHO_CDC, CAMINHO_SP_1880, PASTA_FIXTURES } from './apoio.js';

const CAMINHO_SP_1880_ANTIGO = 'estaduais/SP/leis-ordinarias/sem-ano/lei-1-sem-ano-id137931.md';
const CAMINHO_CC = 'federal/leis-ordinarias/2002/lei-10406-2002-01-10.md';
const CAMINHO_MP = 'federal/medidas-provisorias/2001/mpv-2200-2-2001-08-24.md';
const CAMINHO_NOVA = 'federal/leis-ordinarias/2003/lei-10741-2003-10-01.md';

describe('sincronização com um repositório git local', () => {
  let raiz: string;
  let origem: string;
  let clone: string;
  let indice: IndiceSqlite;
  let configuracaoGit: string;

  const git = (cwd: string, argumentos: string[], ambiente: NodeJS.ProcessEnv = {}): string =>
    execFileSync('git', argumentos, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: configuracaoGit, GIT_CONFIG_NOSYSTEM: '1', ...ambiente },
    });

  const colocar = (caminhoNaOrigem: string, fixture: string): void => {
    const destino = join(origem, caminhoNaOrigem);
    mkdirSync(dirname(destino), { recursive: true });
    copyFileSync(join(PASTA_FIXTURES, fixture), destino);
  };

  const commitar = (mensagem: string, autor = 'Acervo <acervo@example.com>', data = '2026-10-20T12:00:00Z'): void => {
    git(origem, ['add', '--all']);
    git(origem, ['commit', '-q', '--author', autor, '-m', mensagem], { GIT_AUTHOR_DATE: data, GIT_COMMITTER_DATE: data });
  };

  const commitarBase = (caminho: string, fixture: string, autor: string, mensagem: string, data: string): void => {
    colocar(caminho, fixture);
    commitar(mensagem, autor, data);
  };

  const sync = (escopo: string[], corpo: string[] = [], leitor?: LeitorArquivos): Promise<RelatorioSync> => {
    const remoto = `file://${origem}`;
    return sincronizar(
      {
        git: new GitLocal({ binario: 'git', diretorio: clone, remoto, ramo: 'main' }),
        gravador: indice,
        leitor: leitor ?? new LeitorDoClone(clone),
        relogio: { agora: () => new Date() },
        log: () => undefined,
      },
      { remoto, ramo: 'main', escopo, corpo },
    );
  };

  beforeAll(() => {
    raiz = mkdtempSync(join(tmpdir(), 'leis-mcp-sync-'));
    configuracaoGit = join(raiz, 'gitconfig');
    writeFileSync(
      configuracaoGit,
      '[user]\n\tname = Acervo\n\temail = acervo@example.com\n[init]\n\tdefaultBranch = main\n[uploadpack]\n\tallowFilter = true\n\tallowAnySHA1InWant = true\n',
    );
    process.env['GIT_CONFIG_GLOBAL'] = configuracaoGit;
    process.env['GIT_CONFIG_NOSYSTEM'] = '1';
    origem = join(raiz, 'origem');
    clone = join(raiz, 'clone');
    mkdirSync(origem);
    git(origem, ['init', '-q', '-b', 'main']);
    colocar('constituicao.md', 'constituicao.md');
    colocar('COBERTURA.md', 'COBERTURA.md');
    colocar('PROGRESSO.md', 'PROGRESSO.md');
    commitar('chore: arquivos da raiz');
    commitarBase(
      CAMINHO_CDC,
      CAMINHO_CDC,
      'Fernando Collor <fernando-collor-74701@exemplo.com>',
      'Lei nº 8.078 de 11/09/1990\n\nDispõe sobre a proteção do consumidor.\n\nAutoria: assinatura no texto.\n' +
        'Fonte: https://normas.leg.br/?urn=urn:lex:br:federal:lei:1990-09-11;8078\n\n' +
        'Co-Authored-By: Fulana de Tal <fulana-de-tal-12345@exemplo.com>',
      '1990-09-11T12:00:00Z',
    );
    commitarBase(
      CAMINHO_CC,
      CAMINHO_CC,
      'Fernando Henrique Cardoso <fernando-henrique-11111@exemplo.com>',
      'Lei nº 10.406 de 10/01/2002\n\nInstitui o Código Civil.\n\nAutoria: assinatura no texto.\n' +
        'Fonte: https://normas.leg.br/?urn=urn:lex:br:federal:lei:2002-01-10;10406',
      '2002-01-10T12:00:00Z',
    );
    commitarBase(
      CAMINHO_MP,
      CAMINHO_MP,
      'Fernando Henrique Cardoso <fernando-henrique-11111@exemplo.com>',
      'Medida Provisória nº 2.200-2 de 24/08/2001\n\nInstitui a ICP-Brasil.\n\nAutoria: assinatura no texto.\n' +
        'Fonte: https://normas.leg.br/?urn=urn:lex:br:federal:medida.provisoria:2001-08-24;2200-2',
      '2001-08-24T12:00:00Z',
    );
    commitarBase(
      CAMINHO_SP_1880_ANTIGO,
      CAMINHO_SP_1880,
      'Estado de São Paulo <estado-de-sao-99979@exemplo.com>',
      'Lei nº 1, de 25/02/1880 | 25-02-1880\n\nAutoriza o governo a aumentar os combustores.\n\nData da norma: 1880-02-25\n' +
        'Autoria: signatário não identificado no texto; autoria institucional.\nFonte: https://www.al.sp.gov.br/norma/137931',
      '1970-01-01T00:00:00Z',
    );
    colocar('estaduais/SP/leis-ordinarias/1990/lei-8078-1990-12-01-id900001.md', 'estaduais/SP/leis-ordinarias/1990/lei-8078-1990-12-01-id900001.md');
    colocar('estaduais/SP/_falhas.jsonl', 'estaduais/SP/_falhas.jsonl');
    colocar('estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md', 'estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md');
    commitar('Acrescenta 3 normas estaduais\n\nAutoria: lote sem autoria por norma.');
    mkdirSync(dirname(join(origem, CAMINHO_SP_1880)), { recursive: true });
    git(origem, ['mv', CAMINHO_SP_1880_ANTIGO, CAMINHO_SP_1880]);
    commitar('refactor: move a lei de 1880 para a pasta do ano\n\nCo-Authored-By: Ferramenta <noreply@example.com>');
    indice = abrirIndiceEscrita(join(raiz, 'indice.sqlite'));
  });

  afterAll(() => {
    indice?.fechar();
    rmSync(raiz, { recursive: true, force: true });
  });

  it('clona com filtro de blobs e sparse-checkout, indexa e lê a autoria da base', async () => {
    const relatorio = await sync(['constituicao', 'federal']);
    expect(relatorio).toMatchObject({ modo: 'completo', anterior: null, gravadas: 4, removidas: 0, autorias: 3, normas: 4 });
    expect(git(clone, ['config', 'remote.origin.partialclonefilter']).trim()).toBe('blob:none');
    expect(git(clone, ['sparse-checkout', 'list']).trim().split('\n')).toEqual(['federal']);
    expect(indice.autoriaDe(CAMINHO_CDC)).toMatchObject({ autor: 'Fernando Collor', coautores: ['Fulana de Tal'] });
    expect(indice.porCaminho('estaduais/SP/leis-ordinarias/1990/lei-8078-1990-12-01-id900001.md')).toBeNull();
  });

  it('não muda nada quando a origem não mudou', async () => {
    const relatorio = await sync(['constituicao', 'federal']);
    expect(relatorio).toMatchObject({ modo: 'sem_mudancas', gravadas: 0, removidas: 0, autorias: 0, normas: 4 });
  });

  it('aplica só as mudanças desde o commit indexado', async () => {
    appendFileSync(join(origem, CAMINHO_CDC), '\nTexto acrescentado depois.\n');
    git(origem, ['rm', '-q', CAMINHO_MP]);
    colocar(CAMINHO_NOVA, CAMINHO_CC);
    commitar('Atualiza normas federais');
    const relatorio = await sync(['constituicao', 'federal']);
    expect(relatorio).toMatchObject({ modo: 'incremental', gravadas: 2, removidas: 1, normas: 4 });
    expect(indice.porCaminho(CAMINHO_MP)).toBeNull();
    expect(indice.porCaminho(CAMINHO_NOVA)).not.toBeNull();
  });

  it('indexa uma UF nova do escopo e religa a autoria do arquivo que mudou de pasta', async () => {
    const relatorio = await sync(['constituicao', 'federal', 'estaduais/SP']);
    expect(relatorio).toMatchObject({ modo: 'incremental', gravadas: 2, autorias: 1, religadas: 1, normas: 6 });
    expect(indice.autoriaDe(CAMINHO_SP_1880)?.autor).toBe('Estado de São Paulo');
    expect(indice.arquivosDeFalhas()).toEqual(['estaduais/SP/_falhas.jsonl']);
    expect(indice.porCaminho('estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md')).toBeNull();
  });

  it('tira do índice o que saiu do escopo e passa a indexar o corpo quando pedido', async () => {
    const reduzido = await sync(['federal']);
    expect(reduzido).toMatchObject({ removidas: 3, normas: 3 });
    expect(indice.arquivosDeFalhas()).toEqual([]);
    const consulta = montarConsultaFts('probidade', []);
    expect(consulta).not.toBeNull();
    const buscar = (): string[] =>
      indice.buscar({ fts: consulta?.expressao ?? '', filtro: {}, limite: 10, deslocamento: 0 }).map((norma) => norma.caminho);
    expect(buscar()).toEqual([]);
    const comCorpo = await sync(['federal'], ['federal']);
    expect(comCorpo).toMatchObject({ gravadas: 3, corpo: ['federal'] });
    expect(buscar().sort()).toEqual([CAMINHO_CC, CAMINHO_NOVA].sort());
  });

  it('ao reler uma entrada inteira, tira do índice o arquivo que saiu da árvore', async () => {
    git(origem, ['rm', '-q', CAMINHO_NOVA]);
    commitar('Remove uma norma federal');
    // O corpo sai do índice: a entrada federal é relida inteira, sem o diff.
    const relatorio = await sync(['federal']);
    expect(relatorio).toMatchObject({ gravadas: 2, removidas: 1, normas: 2, corpo: [] });
    expect(indice.porCaminho(CAMINHO_NOVA)).toBeNull();
  });

  it('depois de um sync interrompido, o próximo relê o que saiu do índice', async () => {
    const doClone = new LeitorDoClone(clone);
    const interrompido: LeitorArquivos = {
      ler: async (caminho) => {
        if (caminho === 'constituicao.md') throw new Error('sync interrompido');
        return doClone.ler(caminho);
      },
    };
    await expect(sync(['constituicao'], [], interrompido)).rejects.toThrow('sync interrompido');
    expect(indice.contarNormas()).toBe(0);
    const retomado = await sync(['federal']);
    expect(retomado).toMatchObject({ gravadas: 2, normas: 2 });
    expect(indice.porCaminho(CAMINHO_CC)).not.toBeNull();
  });

  it('compara o remoto pela URL gravada no clone, sem aplicar insteadOf', async () => {
    const pasta = join(raiz, 'remoto-insteadof');
    mkdirSync(pasta);
    git(pasta, ['init', '-q']);
    git(pasta, ['remote', 'add', 'origin', 'https://example.com/acervo/leis.git']);
    git(pasta, ['config', 'url.ssh://git@example.com/.insteadOf', 'https://example.com/']);
    expect(git(pasta, ['remote', 'get-url', 'origin']).trim()).toBe('ssh://git@example.com/acervo/leis.git');
    const local = new GitLocal({ binario: 'git', diretorio: pasta, remoto: 'https://example.com/acervo/leis.git', ramo: 'main' });
    expect(await local.remotoAtual()).toBe('https://example.com/acervo/leis.git');
  });

  it('registra o _falhas.jsonl da pasta acima de uma entrada e limita o corpo ao escopo', async () => {
    const relatorio = await sync(['estaduais/SP/leis-ordinarias'], ['estaduais']);
    expect(relatorio).toMatchObject({ escopo: ['estaduais/SP/leis-ordinarias'], corpo: ['estaduais/SP/leis-ordinarias'], normas: 2 });
    expect(indice.arquivosDeFalhas()).toEqual(['estaduais/SP/_falhas.jsonl']);
    expect(indice.porCaminho(CAMINHO_SP_1880)).not.toBeNull();
  });

  it('nunca baixa uma pasta "_" que chega do remoto e traz a pasta nova de normas', async () => {
    const caminhoLc = 'federal/leis-complementares/2006/lcp-123-2006-12-14.md';
    const caminhoFonte = 'federal/_fonte/lote-1/fonte.html';
    colocar('federal/_fonte/lote-1/lei-8078.html', CAMINHO_CDC);
    writeFileSync(join(origem, caminhoFonte), '<html>fonte que nunca entra no clone</html>\n');
    writeFileSync(join(origem, 'federal/_auditoria.json'), '{}\n');
    colocar(caminhoLc, CAMINHO_CC);
    // Uma norma de outra esfera muda no mesmo commit: ela fica fora do escopo deste sync.
    const caminhoDeOutraEsfera = 'estaduais/PB/leis-ordinarias/2025/lei-ordinaria-100-2025-id1.md';
    appendFileSync(join(origem, caminhoDeOutraEsfera), '\nTexto que este clone nunca baixa.\n');
    commitar('Acrescenta as fontes, uma auditoria e uma pasta nova');
    // No clone, a pasta federal ainda está inteira no checkout. O sync busca o commit novo,
    // tira _fonte do checkout pelas árvores dele e só então traz os arquivos.
    const relatorio = await sync(['federal']);
    expect(relatorio).toMatchObject({ escopo: ['federal'], normas: 3 });
    expect(git(clone, ['sparse-checkout', 'list']).trim().split('\n')).toEqual(['federal/leis-complementares', 'federal/leis-ordinarias']);
    expect(existsSync(join(clone, 'federal/_fonte'))).toBe(false);
    // O conteúdo de _fonte e o da norma de outra esfera não foram baixados, nem de passagem
    // (o resumo de mudanças do merge baixaria os dois). O rev-list com --missing não busca o que falta.
    const ausentes = git(clone, ['rev-list', '--objects', '--missing=print', 'HEAD']).split('\n');
    for (const caminho of [caminhoFonte, caminhoDeOutraEsfera]) {
      const blob = git(clone, ['ls-tree', 'HEAD', '--', caminho]).split(/\s+/)[2];
      expect(blob, caminho).toMatch(/^[0-9a-f]{40,64}$/);
      expect(ausentes, caminho).toContain(`?${blob}`);
    }
    // O modo cone traz os arquivos da pasta acima de cada pasta, como os _falhas.jsonl.
    expect(existsSync(join(clone, 'federal/_auditoria.json'))).toBe(true);
    expect(indice.porCaminho(caminhoLc)).not.toBeNull();
    const deNovo = await sync(['federal']);
    expect(deNovo).toMatchObject({ modo: 'sem_mudancas', normas: 3 });
  });

  it('um clone novo já nasce sem as pastas que começam com "_"', async () => {
    const outroClone = join(raiz, 'clone-novo');
    const remoto = `file://${origem}`;
    const outroIndice = abrirIndiceEscrita(join(raiz, 'indice-novo.sqlite'));
    try {
      const relatorio = await sincronizar(
        {
          git: new GitLocal({ binario: 'git', diretorio: outroClone, remoto, ramo: 'main' }),
          gravador: outroIndice,
          leitor: new LeitorDoClone(outroClone),
          relogio: { agora: () => new Date() },
          log: () => undefined,
        },
        { remoto, ramo: 'main', escopo: ['constituicao', 'federal'], corpo: [] },
      );
      expect(relatorio).toMatchObject({ modo: 'completo', normas: 4 });
      expect(existsSync(join(outroClone, 'federal/_fonte'))).toBe(false);
      expect(existsSync(join(outroClone, 'constituicao.md'))).toBe(true);
      // O blob de _fonte não veio no clone parcial. O rev-list com --missing não busca o que falta.
      const blob = git(outroClone, ['ls-tree', 'HEAD', '--', 'federal/_fonte/lote-1/lei-8078.html']).split(/\s+/)[2];
      expect(blob).toMatch(/^[0-9a-f]{40,64}$/);
      expect(git(outroClone, ['rev-list', '--objects', '--missing=print', 'HEAD']).split('\n')).toContain(`?${blob}`);
    } finally {
      outroIndice.fechar();
    }
  });
});
