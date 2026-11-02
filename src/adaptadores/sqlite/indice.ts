import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { ErroLeis } from '../../core/erros.js';
import type { ConsultaIndice, GravadorIndice } from '../../core/portas.js';
import { VERSAO_ESQUEMA } from '../../core/sincronizacao.js';
import { dobrar } from '../../core/texto.js';
import type {
  Autoria,
  Contagem,
  Dimensao,
  Esfera,
  EstadoIndice,
  FiltroNormas,
  Norma,
  RegistroAutoria,
  RegistroNorma,
} from '../../core/tipos.js';

type BancoDeDados = Database.Database;
type Parametro = string | number | null;

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS normas (
  id INTEGER PRIMARY KEY,
  caminho TEXT NOT NULL UNIQUE,
  esfera TEXT NOT NULL,
  uf TEXT,
  municipio TEXT,
  orgao TEXT,
  tribunal TEXT,
  pasta TEXT,
  tipo TEXT,
  tipo_chave TEXT,
  numero TEXT,
  numero_norm TEXT,
  data TEXT,
  ano INTEGER,
  titulo TEXT NOT NULL,
  ementa TEXT,
  ementa_derivada INTEGER NOT NULL DEFAULT 0,
  situacao TEXT,
  revogada INTEGER,
  versao_texto TEXT,
  fonte TEXT,
  baixado_em TEXT,
  urn TEXT,
  ocr INTEGER NOT NULL DEFAULT 0,
  sem_texto INTEGER NOT NULL DEFAULT 0,
  tem_tachado INTEGER NOT NULL DEFAULT 0,
  corpo_indexado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS normas_esfera_tipo ON normas(esfera, tipo_chave);
CREATE INDEX IF NOT EXISTS normas_numero ON normas(numero_norm, tipo_chave);
CREATE INDEX IF NOT EXISTS normas_uf ON normas(uf, municipio);
CREATE INDEX IF NOT EXISTS normas_orgao ON normas(orgao);
CREATE INDEX IF NOT EXISTS normas_tribunal ON normas(tribunal);
CREATE INDEX IF NOT EXISTS normas_data ON normas(data);
CREATE INDEX IF NOT EXISTS normas_urn ON normas(urn);
CREATE INDEX IF NOT EXISTS normas_fonte ON normas(fonte);

CREATE VIRTUAL TABLE IF NOT EXISTS normas_fts USING fts5(
  titulo,
  ementa,
  corpo,
  content = '',
  contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS signatarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  chave TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signatarios_chave ON signatarios(chave);

CREATE TABLE IF NOT EXISTS autoria (
  caminho_base TEXT NOT NULL,
  caminho TEXT NOT NULL,
  fonte TEXT,
  origem TEXT,
  commit_base TEXT NOT NULL,
  signatario_id INTEGER NOT NULL,
  papel TEXT NOT NULL,
  PRIMARY KEY (caminho_base, signatario_id, papel)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS autoria_caminho ON autoria(caminho);
CREATE INDEX IF NOT EXISTS autoria_signatario ON autoria(signatario_id);

CREATE TABLE IF NOT EXISTS falhas_arquivos (
  caminho TEXT PRIMARY KEY
) WITHOUT ROWID;
`;

const COLUNAS_NORMA = [
  'caminho',
  'esfera',
  'uf',
  'municipio',
  'orgao',
  'tribunal',
  'pasta',
  'tipo',
  'tipo_chave',
  'numero',
  'numero_norm',
  'data',
  'ano',
  'titulo',
  'ementa',
  'ementa_derivada',
  'situacao',
  'revogada',
  'versao_texto',
  'fonte',
  'baixado_em',
  'urn',
  'ocr',
  'sem_texto',
  'tem_tachado',
  'corpo_indexado',
] as const;

type ParametrosNorma = Record<(typeof COLUNAS_NORMA)[number], Parametro>;

interface LinhaNorma {
  id: number;
  caminho: string;
  esfera: string;
  uf: string | null;
  municipio: string | null;
  orgao: string | null;
  tribunal: string | null;
  pasta: string | null;
  tipo: string | null;
  tipo_chave: string | null;
  numero: string | null;
  numero_norm: string | null;
  data: string | null;
  ano: number | null;
  titulo: string;
  ementa: string | null;
  ementa_derivada: number;
  situacao: string | null;
  revogada: number | null;
  versao_texto: string | null;
  fonte: string | null;
  baixado_em: string | null;
  urn: string | null;
  ocr: number;
  sem_texto: number;
  tem_tachado: number;
}

const EXPRESSAO_DIMENSAO: Record<Dimensao, string> = {
  esfera: 'n.esfera',
  tipo: 'n.tipo_chave',
  uf: 'n.uf',
  orgao: 'n.orgao',
  tribunal: 'n.tribunal',
  municipio: "n.uf || '/' || n.municipio",
  decada: 'CAST((n.ano / 10) * 10 AS TEXT)',
};

const ORDEM_ESFERA =
  "CASE n.esfera WHEN 'constituicao' THEN 0 WHEN 'federal' THEN 1 WHEN 'estaduais' THEN 2 WHEN 'municipais' THEN 3 " +
  "WHEN 'reguladores' THEN 4 WHEN 'jurisprudencia' THEN 5 ELSE 6 END";

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}

function paraNorma(linha: LinhaNorma): Norma {
  return {
    caminho: linha.caminho,
    esfera: linha.esfera as Esfera,
    uf: linha.uf,
    municipio: linha.municipio,
    orgao: linha.orgao,
    tribunal: linha.tribunal,
    pasta: linha.pasta,
    tipo: linha.tipo,
    tipoChave: linha.tipo_chave,
    numero: linha.numero,
    numeroNormalizado: linha.numero_norm,
    data: linha.data,
    ano: linha.ano,
    titulo: linha.titulo,
    ementa: linha.ementa,
    ementaDerivada: linha.ementa_derivada === 1,
    situacao: linha.situacao,
    revogada: linha.revogada === null ? null : linha.revogada === 1,
    versaoTexto: linha.versao_texto,
    fonte: linha.fonte,
    baixadoEm: linha.baixado_em,
    urn: linha.urn,
    ocr: linha.ocr === 1,
    semTexto: linha.sem_texto === 1,
    temTachado: linha.tem_tachado === 1,
  };
}

function parametrosDaNorma(registro: RegistroNorma): ParametrosNorma {
  return {
    caminho: registro.caminho,
    esfera: registro.esfera,
    uf: registro.uf,
    municipio: registro.municipio,
    orgao: registro.orgao,
    tribunal: registro.tribunal,
    pasta: registro.pasta,
    tipo: registro.tipo,
    tipo_chave: registro.tipoChave,
    numero: registro.numero,
    numero_norm: registro.numeroNormalizado,
    data: registro.data,
    ano: registro.ano,
    titulo: registro.titulo,
    ementa: registro.ementa,
    ementa_derivada: registro.ementaDerivada ? 1 : 0,
    situacao: registro.situacao,
    revogada: registro.revogada === null ? null : registro.revogada ? 1 : 0,
    versao_texto: registro.versaoTexto,
    fonte: registro.fonte,
    baixado_em: registro.baixadoEm,
    urn: registro.urn,
    ocr: registro.ocr ? 1 : 0,
    sem_texto: registro.semTexto ? 1 : 0,
    tem_tachado: registro.temTachado ? 1 : 0,
    corpo_indexado: registro.corpo === null ? 0 : 1,
  };
}

/** Texto da coluna `titulo` do FTS5: título, tipo e número sem pontos ("8078" acha "8.078"). */
function tituloParaFts(registro: RegistroNorma): string {
  return [registro.titulo, registro.tipo ?? '', registro.numeroNormalizado ?? ''].join(' ').trim();
}

function chaveDeNome(nome: string): string {
  return dobrar(nome).replace(/[^a-z0-9]+/g, ' ').trim();
}

interface Condicoes {
  sql: string[];
  parametros: Parametro[];
}

function condicoes(filtro: FiltroNormas): Condicoes {
  const sql: string[] = [];
  const parametros: Parametro[] = [];
  const igual = (coluna: string, valor: string | undefined): void => {
    if (valor === undefined) return;
    sql.push(`n.${coluna} = ?`);
    parametros.push(valor);
  };
  igual('esfera', filtro.esfera);
  igual('uf', filtro.uf);
  igual('municipio', filtro.municipio);
  igual('orgao', filtro.orgao);
  igual('tribunal', filtro.tribunal);
  igual('numero_norm', filtro.numeroNormalizado);
  if (filtro.tipoChave !== undefined) {
    sql.push('(n.tipo_chave = ? OR n.pasta = ?)');
    parametros.push(filtro.tipoChave, filtro.tipoChave);
  }
  if (filtro.dataDe !== undefined) {
    sql.push('n.data >= ?');
    parametros.push(filtro.dataDe);
  }
  if (filtro.dataAte !== undefined) {
    sql.push('n.data <= ?');
    parametros.push(filtro.dataAte);
  }
  if (filtro.revogada !== undefined) {
    sql.push('n.revogada = ?');
    parametros.push(filtro.revogada ? 1 : 0);
  }
  if (filtro.prefixo !== undefined) {
    sql.push("(n.caminho = ? OR n.caminho LIKE ? ESCAPE '\\')");
    parametros.push(filtro.prefixo, `${escaparLike(filtro.prefixo)}/%`);
  }
  return { sql, parametros };
}

/** Origem e filtros de uma consulta, com ou sem FTS5. */
function origem(fts: string | null, filtro: FiltroNormas): { de: string; onde: string; parametros: Parametro[] } {
  const { sql, parametros } = condicoes(filtro);
  if (fts === null) {
    return { de: 'normas n', onde: sql.length > 0 ? `WHERE ${sql.join(' AND ')}` : '', parametros };
  }
  return {
    de: 'normas_fts JOIN normas n ON n.id = normas_fts.rowid',
    onde: `WHERE ${['normas_fts MATCH ?', ...sql].join(' AND ')}`,
    parametros: [fts, ...parametros],
  };
}

function condicaoDoEscopo(pathspecs: readonly string[], coluna: string): { sql: string; parametros: Parametro[] } {
  if (pathspecs.length === 0) return { sql: '1 = 0', parametros: [] };
  return {
    sql: pathspecs.map(() => `(${coluna} = ? OR ${coluna} LIKE ? ESCAPE '\\')`).join(' OR '),
    parametros: pathspecs.flatMap((spec) => [spec, `${escaparLike(spec)}/%`]),
  };
}

/** Índice SQLite FTS5 do acervo. A mesma classe serve à leitura (servidor) e à escrita (sync). */
export class IndiceSqlite implements ConsultaIndice, GravadorIndice {
  constructor(private readonly db: BancoDeDados) {}

  fechar(): void {
    if (this.db.open) this.db.close();
  }

  private todas(sql: string, parametros: readonly Parametro[]): Norma[] {
    return this.db
      .prepare<Parametro[], LinhaNorma>(sql)
      .all(...parametros)
      .map(paraNorma);
  }

  // -------------------------------------------------------------------------
  // Leitura

  estado(): EstadoIndice | null {
    const meta = new Map(
      this.db
        .prepare<[], { chave: string; valor: string }>('SELECT chave, valor FROM meta')
        .all()
        .map((linha): [string, string] => [linha.chave, linha.valor]),
    );
    if (!meta.has('commit')) return null;
    const lista = (chave: string): string[] => {
      try {
        const valor: unknown = JSON.parse(meta.get(chave) ?? '[]');
        return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === 'string') : [];
      } catch {
        return [];
      }
    };
    const porEsfera = this.db
      .prepare<[], { valor: string; quantidade: number }>(
        'SELECT esfera AS valor, count(*) AS quantidade FROM normas GROUP BY esfera ORDER BY quantidade DESC',
      )
      .all();
    return {
      versaoEsquema: Number(meta.get('versao_esquema') ?? '0'),
      commit: meta.get('commit') ?? null,
      sincronizadoEm: meta.get('sincronizado_em') ?? null,
      remoto: meta.get('remoto') ?? null,
      ramo: meta.get('ramo') ?? null,
      escopo: lista('escopo'),
      corpo: lista('corpo'),
      total: porEsfera.reduce((soma, linha) => soma + linha.quantidade, 0),
      porEsfera,
    };
  }

  buscar(parametros: { fts: string | null; filtro: FiltroNormas; limite: number; deslocamento: number }): Norma[] {
    const consulta = origem(parametros.fts, parametros.filtro);
    const ordem =
      parametros.fts === null
        ? 'ORDER BY (n.data IS NULL), n.data DESC, n.caminho'
        : 'ORDER BY bm25(normas_fts, 10.0, 4.0, 1.0), n.id';
    return this.todas(`SELECT n.* FROM ${consulta.de} ${consulta.onde} ${ordem} LIMIT ? OFFSET ?`, [
      ...consulta.parametros,
      parametros.limite,
      parametros.deslocamento,
    ]);
  }

  contar(parametros: { fts: string | null; filtro: FiltroNormas; teto: number }): number {
    const consulta = origem(parametros.fts, parametros.filtro);
    if (parametros.teto >= 1_000_000_000) {
      const linha = this.db
        .prepare<Parametro[], { total: number }>(`SELECT count(*) AS total FROM ${consulta.de} ${consulta.onde}`)
        .get(...consulta.parametros);
      return linha?.total ?? 0;
    }
    const linha = this.db
      .prepare<Parametro[], { total: number }>(
        `SELECT count(*) AS total FROM (SELECT 1 FROM ${consulta.de} ${consulta.onde} LIMIT ?)`,
      )
      .get(...consulta.parametros, parametros.teto + 1);
    return linha?.total ?? 0;
  }

  porCaminho(caminho: string): Norma | null {
    return this.todas('SELECT n.* FROM normas n WHERE n.caminho = ?', [caminho])[0] ?? null;
  }

  porCaminhos(caminhos: readonly string[], filtro: FiltroNormas): Norma[] {
    const saida: Norma[] = [];
    const { sql, parametros } = condicoes(filtro);
    for (let i = 0; i < caminhos.length; i += 400) {
      const fatia = caminhos.slice(i, i + 400);
      const marcas = fatia.map(() => '?').join(',');
      const onde = [`n.caminho IN (${marcas})`, ...sql].join(' AND ');
      saida.push(...this.todas(`SELECT n.* FROM normas n WHERE ${onde}`, [...fatia, ...parametros]));
    }
    return saida;
  }

  porUrn(urn: string): Norma[] {
    return this.todas('SELECT n.* FROM normas n WHERE n.urn = ? ORDER BY n.caminho LIMIT 20', [urn]);
  }

  porReferencia(parametros: {
    pastas: readonly string[];
    numero: string;
    anos: readonly number[];
    data: string | null;
    esfera: string | null;
    uf: string | null;
    tribunal: string | null;
    limite: number;
  }): Norma[] {
    const sql = ['n.numero_norm = ?'];
    const valores: Parametro[] = [parametros.numero];
    if (parametros.pastas.length > 0) {
      const marcas = parametros.pastas.map(() => '?').join(',');
      sql.push(`(n.tipo_chave IN (${marcas}) OR n.pasta IN (${marcas}))`);
      valores.push(...parametros.pastas, ...parametros.pastas);
    }
    if (parametros.anos.length > 0) {
      sql.push(`n.ano IN (${parametros.anos.map(() => '?').join(',')})`);
      valores.push(...parametros.anos);
    }
    if (parametros.esfera !== null) {
      sql.push('n.esfera = ?');
      valores.push(parametros.esfera);
    }
    if (parametros.uf !== null) {
      sql.push('n.uf = ?');
      valores.push(parametros.uf);
    }
    if (parametros.tribunal !== null) {
      sql.push('n.tribunal = ?');
      valores.push(parametros.tribunal);
    }
    return this.todas(
      `SELECT n.* FROM normas n WHERE ${sql.join(' AND ')} ORDER BY ${ORDEM_ESFERA}, (n.data = ?) DESC, n.ano DESC, n.caminho LIMIT ?`,
      [...valores, parametros.data, parametros.limite],
    );
  }

  facetas(parametros: { dimensao: Dimensao; fts: string | null; filtro: FiltroNormas; limite: number }): Contagem[] {
    const expressao = EXPRESSAO_DIMENSAO[parametros.dimensao];
    const consulta = origem(parametros.fts, parametros.filtro);
    const onde = consulta.onde === '' ? 'WHERE' : `${consulta.onde} AND`;
    const linhas = this.db
      .prepare<Parametro[], { valor: string; quantidade: number; rotulo: string | null }>(
        `SELECT ${expressao} AS valor, count(*) AS quantidade, min(n.tipo) AS rotulo FROM ${consulta.de} ` +
          `${onde} ${expressao} IS NOT NULL AND ${expressao} <> '' GROUP BY valor ORDER BY quantidade DESC, valor LIMIT ?`,
      )
      .all(...consulta.parametros, parametros.limite);
    return linhas.map((linha) => {
      const contagem: Contagem = { valor: String(linha.valor), quantidade: linha.quantidade };
      if (parametros.dimensao === 'tipo' && linha.rotulo !== null) contagem.rotulo = linha.rotulo;
      if (parametros.dimensao === 'decada') contagem.rotulo = `${linha.valor} a ${Number(linha.valor) + 9}`;
      return contagem;
    });
  }

  autoriaDe(caminho: string): Autoria | null {
    const linhas = this.db
      .prepare<[string], { nome: string; papel: string; origem: string | null; commit_base: string }>(
        `SELECT s.nome, a.papel, a.origem, a.commit_base FROM autoria a JOIN signatarios s ON s.id = a.signatario_id
         WHERE a.caminho = ? ORDER BY a.papel = 'autor' DESC, s.nome`,
      )
      .all(caminho);
    const autor = linhas.find((linha) => linha.papel === 'autor') ?? linhas[0];
    if (autor === undefined) return null;
    return {
      caminho,
      autor: autor.nome,
      coautores: linhas.filter((linha) => linha !== autor).map((linha) => linha.nome),
      origem: autor.origem,
      commit: autor.commit_base,
    };
  }

  normasDoSignatario(parametros: { nome: string; limite: number; deslocamento: number }): {
    nome: string | null;
    normas: Norma[];
    total: number;
  } {
    const signatario =
      this.db.prepare<[string], { id: number; nome: string }>('SELECT id, nome FROM signatarios WHERE nome = ?').get(parametros.nome) ??
      this.db
        .prepare<[string], { id: number; nome: string }>('SELECT id, nome FROM signatarios WHERE chave = ? ORDER BY id LIMIT 1')
        .get(chaveDeNome(parametros.nome));
    if (signatario === undefined) return { nome: null, normas: [], total: 0 };
    const total =
      this.db
        .prepare<[number], { total: number }>(
          'SELECT count(DISTINCT n.id) AS total FROM autoria a JOIN normas n ON n.caminho = a.caminho WHERE a.signatario_id = ?',
        )
        .get(signatario.id)?.total ?? 0;
    const normas = this.todas(
      `SELECT n.* FROM autoria a JOIN normas n ON n.caminho = a.caminho WHERE a.signatario_id = ?
       GROUP BY n.id ORDER BY (n.data IS NULL), n.data, n.caminho LIMIT ? OFFSET ?`,
      [signatario.id, parametros.limite, parametros.deslocamento],
    );
    return { nome: signatario.nome, normas, total };
  }

  signatariosParecidos(nome: string, limite: number): string[] {
    const chave = chaveDeNome(nome);
    if (chave === '') return [];
    const buscar = (padrao: string): string[] =>
      this.db
        .prepare<[string, number], { nome: string }>(
          "SELECT nome FROM signatarios WHERE chave LIKE ? ESCAPE '\\' ORDER BY length(nome), nome LIMIT ?",
        )
        .all(padrao, limite)
        .map((linha) => linha.nome);
    const inteiros = buscar(`%${escaparLike(chave)}%`);
    if (inteiros.length > 0) return inteiros;
    const maiorPalavra = chave.split(' ').sort((a, b) => b.length - a.length)[0] ?? '';
    return maiorPalavra.length >= 3 ? buscar(`%${escaparLike(maiorPalavra)}%`) : [];
  }

  arquivosDeFalhas(): string[] {
    return this.db
      .prepare<[], { caminho: string }>('SELECT caminho FROM falhas_arquivos ORDER BY caminho')
      .all()
      .map((linha) => linha.caminho);
  }

  // -------------------------------------------------------------------------
  // Escrita

  lerMeta(chave: string): string | null {
    return this.db.prepare<[string], { valor: string }>('SELECT valor FROM meta WHERE chave = ?').get(chave)?.valor ?? null;
  }

  gravarMeta(valores: Record<string, string>): void {
    const gravar = this.db.prepare<[string, string]>('INSERT OR REPLACE INTO meta (chave, valor) VALUES (?, ?)');
    this.db.transaction((pares: Array<[string, string]>) => {
      for (const [chave, valor] of pares) gravar.run(chave, valor);
    })(Object.entries(valores));
  }

  limpar(): void {
    this.db.exec(`
      DELETE FROM normas;
      INSERT INTO normas_fts(normas_fts) VALUES('delete-all');
      DELETE FROM autoria;
      DELETE FROM signatarios;
      DELETE FROM falhas_arquivos;
      DELETE FROM meta;
    `);
  }

  gravarNormas(registros: readonly RegistroNorma[]): void {
    const idPorCaminho = this.db.prepare<[string], { id: number }>('SELECT id FROM normas WHERE caminho = ?');
    const inserir = this.db.prepare<ParametrosNorma>(
      `INSERT INTO normas (${COLUNAS_NORMA.join(', ')}) VALUES (${COLUNAS_NORMA.map((coluna) => `@${coluna}`).join(', ')})`,
    );
    const atualizar = this.db.prepare<ParametrosNorma & { id: number }>(
      `UPDATE normas SET ${COLUNAS_NORMA.map((coluna) => `${coluna} = @${coluna}`).join(', ')} WHERE id = @id`,
    );
    const apagarFts = this.db.prepare<[number]>('DELETE FROM normas_fts WHERE rowid = ?');
    const inserirFts = this.db.prepare<[number, string, string, string]>(
      'INSERT INTO normas_fts (rowid, titulo, ementa, corpo) VALUES (?, ?, ?, ?)',
    );
    this.db.transaction((lista: readonly RegistroNorma[]) => {
      for (const registro of lista) {
        const parametros = parametrosDaNorma(registro);
        const existente = idPorCaminho.get(registro.caminho);
        let id: number;
        if (existente !== undefined) {
          apagarFts.run(existente.id);
          atualizar.run({ ...parametros, id: existente.id });
          id = existente.id;
        } else {
          id = Number(inserir.run(parametros).lastInsertRowid);
        }
        inserirFts.run(id, tituloParaFts(registro), registro.ementa ?? '', registro.corpo ?? '');
      }
    })(registros);
  }

  removerNormas(caminhos: readonly string[]): number {
    const idPorCaminho = this.db.prepare<[string], { id: number }>('SELECT id FROM normas WHERE caminho = ?');
    const apagarFts = this.db.prepare<[number]>('DELETE FROM normas_fts WHERE rowid = ?');
    const apagar = this.db.prepare<[number]>('DELETE FROM normas WHERE id = ?');
    let removidas = 0;
    this.db.transaction((lista: readonly string[]) => {
      for (const caminho of lista) {
        const existente = idPorCaminho.get(caminho);
        if (existente === undefined) continue;
        apagarFts.run(existente.id);
        apagar.run(existente.id);
        removidas += 1;
      }
    })(caminhos);
    return removidas;
  }

  removerForaDoEscopo(pathspecs: readonly string[]): number {
    const normas = condicaoDoEscopo(pathspecs, 'caminho');
    const ids = this.db
      .prepare<Parametro[], { id: number }>(`SELECT id FROM normas WHERE NOT (${normas.sql})`)
      .all(...normas.parametros)
      .map((linha) => linha.id);
    const apagarFts = this.db.prepare<[number]>('DELETE FROM normas_fts WHERE rowid = ?');
    const apagar = this.db.prepare<[number]>('DELETE FROM normas WHERE id = ?');
    const autoria = condicaoDoEscopo(pathspecs, 'caminho_base');
    this.db.transaction(() => {
      for (const id of ids) {
        apagarFts.run(id);
        apagar.run(id);
      }
      this.db.prepare<Parametro[]>(`DELETE FROM autoria WHERE NOT (${autoria.sql})`).run(...autoria.parametros);
      this.db.prepare<Parametro[]>(`DELETE FROM falhas_arquivos WHERE NOT (${normas.sql})`).run(...normas.parametros);
    })();
    return ids.length;
  }

  gravarAutoria(registros: readonly RegistroAutoria[]): void {
    const inserirSignatario = this.db.prepare<[string, string]>('INSERT OR IGNORE INTO signatarios (nome, chave) VALUES (?, ?)');
    const idSignatario = this.db.prepare<[string], { id: number }>('SELECT id FROM signatarios WHERE nome = ?');
    const inserirAutoria = this.db.prepare<[string, string, string | null, string | null, string, number, string]>(
      `INSERT OR REPLACE INTO autoria (caminho_base, caminho, fonte, origem, commit_base, signatario_id, papel)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction((lista: readonly RegistroAutoria[]) => {
      for (const registro of lista) {
        const pessoas: Array<[string, string]> = [
          [registro.autor, 'autor'],
          ...registro.coautores.map((nome): [string, string] => [nome, 'coautor']),
        ];
        for (const [nome, papel] of pessoas) {
          inserirSignatario.run(nome, chaveDeNome(nome));
          const id = idSignatario.get(nome)?.id;
          if (id === undefined) continue;
          inserirAutoria.run(registro.caminho, registro.caminho, registro.fonte, registro.origem, registro.commit, id, papel);
        }
      }
    })(registros);
  }

  religarAutoria(): number {
    return this.db
      .prepare(
        `UPDATE autoria SET caminho = (SELECT n.caminho FROM normas n WHERE n.fonte = autoria.fonte)
         WHERE autoria.fonte IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM normas n WHERE n.caminho = autoria.caminho)
           AND (SELECT count(*) FROM normas n WHERE n.fonte = autoria.fonte) = 1`,
      )
      .run().changes;
  }

  registrarFalhas(caminhos: readonly string[]): void {
    const inserir = this.db.prepare<[string]>('INSERT OR IGNORE INTO falhas_arquivos (caminho) VALUES (?)');
    this.db.transaction((lista: readonly string[]) => {
      for (const caminho of lista) inserir.run(caminho);
    })(caminhos);
  }

  removerFalhas(caminhos: readonly string[]): void {
    const apagar = this.db.prepare<[string]>('DELETE FROM falhas_arquivos WHERE caminho = ?');
    this.db.transaction((lista: readonly string[]) => {
      for (const caminho of lista) apagar.run(caminho);
    })(caminhos);
  }

  contarNormas(): number {
    return this.db.prepare<[], { total: number }>('SELECT count(*) AS total FROM normas').get()?.total ?? 0;
  }

  otimizar(): void {
    this.db.pragma('optimize');
  }
}

/** Abre o índice para o sync: cria a pasta, o arquivo e as tabelas quando faltam. */
export function abrirIndiceEscrita(arquivo: string): IndiceSqlite {
  mkdirSync(dirname(arquivo), { recursive: true });
  const db = new Database(arquivo);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.exec(ESQUEMA);
  return new IndiceSqlite(db);
}

/** Abre o índice somente para leitura, para o servidor. */
export function abrirIndiceLeitura(arquivo: string): IndiceSqlite {
  if (!existsSync(arquivo)) {
    throw new ErroLeis(
      'indice_ausente',
      `O índice não existe em ${arquivo}.`,
      'Rode `npx leis-mcp sync` para clonar o acervo e criar o índice.',
    );
  }
  const db = new Database(arquivo, { readonly: true, fileMustExist: true });
  const indice = new IndiceSqlite(db);
  const versao = indice.lerMeta('versao_esquema');
  if (versao !== null && versao !== String(VERSAO_ESQUEMA)) {
    indice.fechar();
    throw new ErroLeis(
      'indice_desatualizado',
      `O índice tem a versão ${versao} do esquema; esta versão do leis-mcp usa a ${VERSAO_ESQUEMA}.`,
      'Rode `npx leis-mcp sync` para refazer o índice.',
    );
  }
  return indice;
}
