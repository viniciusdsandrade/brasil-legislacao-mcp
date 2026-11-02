import { separarCabecalho } from './cabecalho.js';
import {
  CAMINHO_CONSTITUICAO,
  escopoCobre,
  escopoToca,
  exigirCaminho,
  pastasDoRecorteNoEscopo,
  recorteDoFiltro,
} from './caminho.js';
import { analisarReferencia, normalizarNumero, type Referencia } from './citacao.js';
import { lerCobertura, lerProgresso, progressoDoRecorte, resumirFalhas, type ResumoFalhas } from './cobertura.js';
import { montarConsultaFts, padraoSemAcento } from './consulta-fts.js';
import { codificarCursor, decodificarCursor, numeroDoCursor } from './cursor.js';
import {
  estruturar,
  localizarDispositivo,
  paginar,
  rotuloInicial,
  unidadesDePaginacao,
  type PedidoDispositivo,
  type PosicaoPagina,
} from './dispositivos.js';
import { ErroLeis } from './erros.js';
import { caracteresDoOrcamento, normalizarOrcamento } from './orcamento.js';
import type { Acervo, BuscaTextual, ConsultaIndice, OcorrenciaTexto } from './portas.js';
import { arrumarParaExibir, linhaSoTachada, removerTachado, semMarcasDeTachado } from './tachado.js';
import { dataIso, fnv1a, ordinal, slug, truncar } from './texto.js';
import {
  DIMENSOES,
  ESFERAS,
  ehEsfera,
  type Contagem,
  type Dimensao,
  type Esfera,
  type EstadoIndice,
  type FiltroNormas,
  type Norma,
} from './tipos.js';
import { chaveDeTipo, ehPastaCanonica, rotuloDeChave } from './vocabulario.js';

export const AVISO_LEGAL =
  'Texto informativo, convertido de fontes oficiais. Não substitui a publicação no Diário Oficial. Cite a fonte.';
export const AVISO_AUSENCIA = 'Ausência no acervo local não prova que a norma não existe.';

const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 50;
const TETO_CONTAGEM = 10_000;
const MAX_ARQUIVOS_RIPGREP = 500;
const RESERVA_METADADOS = 2_000;

export type Formato = 'resumido' | 'completo';
type Item = Record<string, unknown>;
type Resposta = Record<string, unknown>;

export interface EntradaFiltros {
  esfera?: string | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  orgao?: string | undefined;
  tribunal?: string | undefined;
  tipo?: string | undefined;
  numero?: string | undefined;
  data_de?: string | undefined;
  data_ate?: string | undefined;
  revogada?: boolean | undefined;
}

export interface EntradaBuscar extends EntradaFiltros {
  texto?: string | undefined;
  alcance?: string | undefined;
  limite?: number | undefined;
  cursor?: string | undefined;
  formato?: string | undefined;
}

export interface EntradaObter {
  referencia?: string | undefined;
  artigo?: string | undefined;
  paragrafo?: string | undefined;
  inciso?: string | undefined;
  alinea?: string | undefined;
  bloco?: string | undefined;
  esfera?: string | undefined;
  uf?: string | undefined;
  incluir_tachado?: boolean | undefined;
  formato?: string | undefined;
  cursor?: string | undefined;
}

export interface EntradaFacetas extends EntradaFiltros {
  dimensoes?: string[] | undefined;
  texto?: string | undefined;
  limite?: number | undefined;
}

export interface EntradaCobertura {
  esfera?: string | undefined;
  uf?: string | undefined;
  municipio?: string | undefined;
  orgao?: string | undefined;
  tribunal?: string | undefined;
  tipo?: string | undefined;
}

export interface EntradaAutoria {
  referencia?: string | undefined;
  signatario?: string | undefined;
  limite?: number | undefined;
  cursor?: string | undefined;
  formato?: string | undefined;
}

export interface DependenciasServico {
  /** Abre o índice na primeira chamada. Lança ErroLeis('indice_ausente') quando ele não existe. */
  indice: () => ConsultaIndice;
  acervo: Acervo;
  buscaTextual: BuscaTextual;
  orcamentoTokens?: number | undefined;
}

// ---------------------------------------------------------------------------
// Entrada

function entradaInvalida(mensagem: string, proximoPasso: string): ErroLeis {
  return new ErroLeis('entrada_invalida', mensagem, proximoPasso);
}

function textoOpcional(valor: unknown, campo: string, maximo = 500): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor !== 'string') throw entradaInvalida(`O campo ${campo} deve ser texto.`, `Envie ${campo} como texto.`);
  const limpo = valor.trim();
  if (limpo === '') return undefined;
  if (limpo.length > maximo) {
    throw entradaInvalida(`O campo ${campo} passa de ${maximo} caracteres.`, `Encurte o campo ${campo}.`);
  }
  return limpo;
}

function inteiro(valor: unknown, campo: string, minimo: number, maximo: number, padrao: number): number {
  if (valor === undefined || valor === null) return padrao;
  const numero = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof numero !== 'number' || !Number.isInteger(numero)) {
    throw entradaInvalida(`O campo ${campo} deve ser um número inteiro.`, `Use um valor de ${minimo} a ${maximo}.`);
  }
  return Math.min(maximo, Math.max(minimo, numero));
}

function booleano(valor: unknown, campo: string): boolean | undefined {
  if (valor === undefined || valor === null) return undefined;
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  throw entradaInvalida(`O campo ${campo} deve ser true ou false.`, `Envie ${campo} como booleano.`);
}

function opcao<T extends string>(valor: unknown, campo: string, opcoes: readonly T[], padrao: T): T {
  const texto = textoOpcional(valor, campo, 40);
  if (texto === undefined) return padrao;
  const escolhida = opcoes.find((opcaoValida) => opcaoValida === texto);
  if (escolhida === undefined) {
    throw entradaInvalida(`Valor inválido para ${campo}: "${texto}".`, `Use um destes: ${opcoes.join(', ')}.`);
  }
  return escolhida;
}

function lerEsfera(valor: unknown): Esfera | undefined {
  const texto = textoOpcional(valor, 'esfera', 40);
  if (texto === undefined) return undefined;
  if (!ehEsfera(texto)) throw entradaInvalida(`Esfera inválida: "${texto}".`, `Use uma destas: ${ESFERAS.join(', ')}.`);
  return texto;
}

function lerUf(valor: unknown): string | undefined {
  const texto = textoOpcional(valor, 'uf', 10);
  if (texto === undefined) return undefined;
  const uf = texto.toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw entradaInvalida(`UF inválida: "${texto}".`, 'Use a sigla com duas letras, por exemplo "SP".');
  return uf;
}

function lerData(valor: unknown, campo: string, fimDoAno: boolean): string | undefined {
  const texto = textoOpcional(valor, campo, 20);
  if (texto === undefined) return undefined;
  if (/^\d{4}$/.test(texto)) return fimDoAno ? `${texto}-12-31` : `${texto}-01-01`;
  const data = dataIso(texto);
  if (data === null) throw entradaInvalida(`Data inválida em ${campo}: "${texto}".`, 'Use o formato AAAA-MM-DD ou só o ano, AAAA.');
  return data;
}

interface FiltroLido {
  filtro: FiltroNormas;
  recorte: string;
}

function lerFiltro(entrada: EntradaFiltros): FiltroLido {
  const esfera = lerEsfera(entrada.esfera);
  const uf = lerUf(entrada.uf);
  const municipio = textoOpcional(entrada.municipio, 'municipio', 80);
  const orgao = textoOpcional(entrada.orgao, 'orgao', 80);
  const tribunal = textoOpcional(entrada.tribunal, 'tribunal', 40);
  const tipo = textoOpcional(entrada.tipo, 'tipo', 80);
  const numero = textoOpcional(entrada.numero, 'numero', 40);
  const filtro: FiltroNormas = {
    esfera,
    uf,
    municipio: municipio === undefined ? undefined : slug(municipio),
    orgao: orgao === undefined ? undefined : slug(orgao),
    tribunal: tribunal === undefined ? undefined : slug(tribunal),
    tipoChave: chaveDeTipo(tipo) ?? undefined,
    numeroNormalizado: normalizarNumero(numero) ?? undefined,
    dataDe: lerData(entrada.data_de, 'data_de', false),
    dataAte: lerData(entrada.data_ate, 'data_ate', true),
    revogada: booleano(entrada.revogada, 'revogada'),
  };
  const recorte = recorteDoFiltro({
    esfera,
    uf,
    municipio: filtro.municipio,
    orgao: filtro.orgao,
    tribunal: filtro.tribunal,
    pasta: filtro.tipoChave !== undefined && ehPastaCanonica(filtro.tipoChave) ? filtro.tipoChave : undefined,
  });
  return { filtro, recorte };
}

function descreverFiltro(filtro: FiltroNormas): Record<string, string | boolean> {
  const descricao: Record<string, string | boolean> = {};
  const pares: Array<[string, string | boolean | undefined]> = [
    ['esfera', filtro.esfera],
    ['uf', filtro.uf],
    ['municipio', filtro.municipio],
    ['orgao', filtro.orgao],
    ['tribunal', filtro.tribunal],
    ['tipo', filtro.tipoChave],
    ['numero', filtro.numeroNormalizado],
    ['data_de', filtro.dataDe],
    ['data_ate', filtro.dataAte],
    ['revogada', filtro.revogada],
  ];
  for (const [chave, valor] of pares) if (valor !== undefined) descricao[chave] = valor;
  return descricao;
}

// ---------------------------------------------------------------------------
// Saída

export function uriDe(caminho: string): string {
  return `leis://${encodeURIComponent(caminho)}`;
}

export function itemResumido(norma: Norma): Item {
  const item: Item = {
    caminho: norma.caminho,
    titulo: norma.titulo,
    tipo: norma.tipo,
    numero: norma.numero,
    data: norma.data,
  };
  if (norma.uf !== null) item['uf'] = norma.uf;
  if (norma.ementa !== null) item['ementa'] = truncar(norma.ementa, 240);
  if (norma.ementaDerivada) item['ementa_derivada'] = true;
  if (norma.situacao !== null) item['situacao'] = norma.situacao;
  item['fonte'] = norma.fonte;
  item['versao_texto'] = norma.versaoTexto;
  item['baixado_em'] = norma.baixadoEm;
  item['ocr'] = norma.ocr;
  return item;
}

export function itemCompleto(norma: Norma): Item {
  return {
    caminho: norma.caminho,
    uri: uriDe(norma.caminho),
    titulo: norma.titulo,
    esfera: norma.esfera,
    tipo: norma.tipo,
    tipo_chave: norma.tipoChave,
    numero: norma.numero,
    data: norma.data,
    ano: norma.ano,
    uf: norma.uf,
    municipio: norma.municipio,
    orgao: norma.orgao,
    tribunal: norma.tribunal,
    pasta: norma.pasta,
    ementa: norma.ementa,
    ementa_derivada: norma.ementaDerivada,
    situacao: norma.situacao,
    revogada: norma.revogada,
    urn: norma.urn,
    fonte: norma.fonte,
    versao_texto: norma.versaoTexto,
    baixado_em: norma.baixadoEm,
    ocr: norma.ocr,
    sem_texto: norma.semTexto,
    tem_tachado: norma.temTachado,
  };
}

function item(norma: Norma, formato: Formato): Item {
  return formato === 'completo' ? itemCompleto(norma) : itemResumido(norma);
}

/** Avisos que valem para a norma inteira. */
export function avisosDaNorma(norma: Norma): string[] {
  const avisos: string[] = [];
  if (norma.semTexto) avisos.push('A fonte oficial não disponibiliza o texto desta norma; o acervo guarda só os metadados.');
  if (norma.ocr) avisos.push('Texto obtido por OCR; pode ter erros de reconhecimento. Confira na fonte antes de citar.');
  if (norma.revogada === true) avisos.push('O cabeçalho marca a norma como revogada (revogada: true).');
  if (norma.situacao !== null && /revog|sem efic|cancelad|inconstitucional|n[ãa]o vigente|caduc|rejeitad|sem efeito|suspens/i.test(norma.situacao)) {
    avisos.push(`Situação informada na fonte: ${norma.situacao}.`);
  }
  if (norma.versaoTexto === null) {
    avisos.push('A fonte não informa a versão do texto.');
  } else if (!/compilad|atualizad|vigente|consolidad/i.test(norma.versaoTexto)) {
    avisos.push(`O texto não é a versão compilada (versao_texto: "${norma.versaoTexto}"); alterações posteriores podem faltar.`);
  }
  if (norma.ementaDerivada) avisos.push('A ementa veio do próprio texto, porque o cabeçalho não tem ementa.');
  return avisos;
}

/** Tira itens do fim até a resposta caber no orçamento. Devolve quantos itens ficaram. */
function caberItens(resposta: Resposta, itens: Item[], maximoCaracteres: number): number {
  while (itens.length > 1 && JSON.stringify(resposta).length > maximoCaracteres) itens.pop();
  return itens.length;
}

// ---------------------------------------------------------------------------
// Serviço

type Resolucao = { norma: Norma; avisos: string[] } | { candidatos: Norma[]; mensagem: string };

export class ServicoLeis {
  private readonly orcamento: number;

  constructor(private readonly deps: DependenciasServico) {
    this.orcamento = normalizarOrcamento(deps.orcamentoTokens);
  }

  private get maximoCaracteres(): number {
    return caracteresDoOrcamento(this.orcamento);
  }

  private estado(indice: ConsultaIndice): EstadoIndice {
    const estado = indice.estado();
    if (estado === null) {
      throw new ErroLeis('indice_ausente', 'O índice local não existe.', 'Rode `npx leis-mcp sync` para clonar o acervo e criar o índice.');
    }
    return estado;
  }

  // -------------------------------------------------------------------------
  // leis_buscar

  async buscar(entrada: EntradaBuscar): Promise<Resposta> {
    const indice = this.deps.indice();
    const estado = this.estado(indice);
    const { filtro, recorte } = lerFiltro(entrada);
    const texto = textoOpcional(entrada.texto, 'texto', 500);
    const alcance = opcao(entrada.alcance, 'alcance', ['cabecalho', 'texto'] as const, 'cabecalho');
    const formato = opcao(entrada.formato, 'formato', ['resumido', 'completo'] as const, 'resumido');
    const limite = inteiro(entrada.limite, 'limite', 1, LIMITE_MAXIMO, LIMITE_PADRAO);
    const impressao = fnv1a(JSON.stringify({ filtro, texto: texto ?? null, alcance }));
    const cursor = textoOpcional(entrada.cursor, 'cursor', 2048);
    const deslocamento = cursor === undefined ? 0 : numeroDoCursor(decodificarCursor(cursor, 'b', impressao), 'o');

    const corpoCobre =
      recorte === '' ? estado.escopo.every((entradaEscopo) => estado.corpo.includes(entradaEscopo)) : escopoCobre(estado.corpo, recorte);
    let normas: Norma[];
    let total: number;
    let aproximado = false;
    let motor: 'fts5' | 'ripgrep' | 'filtro';
    const trechos = new Map<string, OcorrenciaTexto>();
    if (texto !== undefined && alcance === 'texto' && !corpoCobre) {
      const pastas = pastasDoRecorteNoEscopo(estado.escopo, recorte);
      if (pastas.length === 0) throw this.foraDoEscopo(recorte, estado);
      const padrao = padraoSemAcento(texto);
      if (padrao === null) throw new ErroLeis('consulta_vazia', 'O texto não tem termos pesquisáveis.', 'Use palavras com duas letras ou mais.');
      const maxArquivos = Math.min(MAX_ARQUIVOS_RIPGREP, (deslocamento + limite) * 5 + 50);
      const ocorrencias = await this.deps.buscaTextual.buscar({ padrao, pastas, maxArquivos });
      for (const ocorrencia of ocorrencias) if (!trechos.has(ocorrencia.caminho)) trechos.set(ocorrencia.caminho, ocorrencia);
      const caminhos = [...trechos.keys()];
      const porCaminho = new Map(indice.porCaminhos(caminhos, filtro).map((norma): [string, Norma] => [norma.caminho, norma]));
      const ordenadas = caminhos.map((caminho) => porCaminho.get(caminho)).filter((norma): norma is Norma => norma !== undefined);
      total = ordenadas.length;
      aproximado = caminhos.length >= maxArquivos;
      normas = ordenadas.slice(deslocamento, deslocamento + limite + 1);
      motor = 'ripgrep';
    } else {
      let fts: string | null = null;
      if (texto !== undefined) {
        const consulta = montarConsultaFts(texto, alcance === 'texto' ? [] : ['titulo', 'ementa']);
        if (consulta === null) throw new ErroLeis('consulta_vazia', 'O texto não tem termos pesquisáveis.', 'Use palavras com duas letras ou mais.');
        fts = consulta.expressao;
      }
      normas = indice.buscar({ fts, filtro, limite: limite + 1, deslocamento });
      total = indice.contar({ fts, filtro, teto: TETO_CONTAGEM });
      aproximado = total > TETO_CONTAGEM;
      if (aproximado) total = TETO_CONTAGEM;
      motor = fts === null ? 'filtro' : 'fts5';
    }

    const itens = normas.slice(0, limite).map((norma) => {
      const saida = item(norma, formato);
      const trecho = trechos.get(norma.caminho);
      if (trecho !== undefined) {
        saida['linha'] = trecho.linha;
        saida['trecho'] = truncar(trecho.trecho.trim(), 300);
      }
      return saida;
    });
    const resposta: Resposta = {
      itens,
      total,
      total_aproximado: aproximado,
      cursor: null,
      motor,
      alcance,
      filtro: descreverFiltro(filtro),
    };
    if (itens.length === 0) {
      resposta['mensagem'] = `Nenhuma norma encontrada. ${AVISO_AUSENCIA}`;
      resposta['cobertura'] = await this.montarCobertura(indice, estado, filtro, recorte, true);
      return resposta;
    }
    caberItens(resposta, itens, this.maximoCaracteres);
    const proximo = deslocamento + itens.length;
    const haMais = normas.length > itens.length;
    if (haMais) resposta['cursor'] = codificarCursor({ t: 'b', f: impressao, o: proximo });
    return resposta;
  }

  // -------------------------------------------------------------------------
  // leis_obter

  async obter(entrada: EntradaObter): Promise<Resposta> {
    const indice = this.deps.indice();
    const estado = this.estado(indice);
    const textoReferencia = textoOpcional(entrada.referencia, 'referencia', 400);
    if (textoReferencia === undefined) {
      throw entradaInvalida('Informe a referencia da norma.', 'Use um caminho do acervo, uma URN ou uma citação como "Lei 8.078/1990" ou "CF art. 5º".');
    }
    const referencia = this.lerReferencia(textoReferencia);
    const formato = opcao(entrada.formato, 'formato', ['resumido', 'completo'] as const, 'resumido');
    const resolucao = this.resolver(indice, estado, referencia, { esfera: lerEsfera(entrada.esfera), uf: lerUf(entrada.uf) });
    if ('candidatos' in resolucao) return this.respostaCandidatos(resolucao, formato);
    const { norma } = resolucao;
    const avisos = [...resolucao.avisos, ...avisosDaNorma(norma)];
    const citado = referencia.forma === 'citacao' ? referencia.dispositivo : null;
    const pedido = {
      artigo: textoOpcional(entrada.artigo, 'artigo', 40) ?? citado?.artigo,
      paragrafo: textoOpcional(entrada.paragrafo, 'paragrafo', 40) ?? citado?.paragrafo,
      inciso: textoOpcional(entrada.inciso, 'inciso', 40) ?? citado?.inciso,
      alinea: textoOpcional(entrada.alinea, 'alinea', 20) ?? citado?.alinea,
      bloco: textoOpcional(entrada.bloco, 'bloco', 80) ?? (referencia.forma === 'citacao' ? (referencia.bloco ?? undefined) : undefined),
    };
    if (pedido.artigo === undefined && (pedido.paragrafo ?? pedido.inciso ?? pedido.alinea) !== undefined) {
      throw entradaInvalida('Parágrafo, inciso e alínea precisam do artigo.', 'Informe também o parâmetro artigo.');
    }
    const incluirTachado = booleano(entrada.incluir_tachado, 'incluir_tachado') === true;
    const cabecalhoNorma: Item = { ...item(norma, formato), uri: uriDe(norma.caminho) };
    const base: Resposta = { norma: cabecalhoNorma };
    if (norma.semTexto) {
      return { ...base, texto: '', avisos, aviso_legal: AVISO_LEGAL };
    }

    const conteudo = await this.deps.acervo.ler(norma.caminho);
    const { corpo } = separarCabecalho(conteudo);
    const limpo = removerTachado(corpo);
    const originais = corpo.split('\n');
    const limpas = limpo.texto.split('\n');
    const saida = incluirTachado ? originais : limpas;
    const estrutura = estruturar(limpas);
    if (!incluirTachado && limpo.removidos > 0) {
      avisos.push(`${limpo.removidos} trecho(s) tachado(s) omitido(s): redações antigas ou revogadas. Use incluir_tachado=true para vê-los.`);
    }
    const impressao = fnv1a(JSON.stringify({ c: norma.caminho, p: pedido, t: incluirTachado }));
    const cursor = textoOpcional(entrada.cursor, 'cursor', 2048);
    const posicao: PosicaoPagina =
      cursor === undefined
        ? { unidade: 0, deslocamento: 0 }
        : (() => {
            const dados = decodificarCursor(cursor, 'o', impressao);
            return { unidade: numeroDoCursor(dados, 'u'), deslocamento: numeroDoCursor(dados, 'd') };
          })();
    const espaco = Math.max(1_000, this.maximoCaracteres - RESERVA_METADADOS);

    if (pedido.artigo !== undefined) {
      const pedidoDispositivo: PedidoDispositivo = { ...pedido, artigo: pedido.artigo };
      const localizacao = localizarDispositivo(estrutura, pedidoDispositivo);
      let inicio = localizacao.inicio;
      let fim = localizacao.fim;
      if (incluirTachado) [inicio, fim] = ajustarComTachado(originais, inicio, fim);
      const textoDispositivo = arrumarParaExibir(saida.slice(inicio, fim).join('\n'));
      const caput =
        localizacao.caput === null ? null : arrumarParaExibir(saida.slice(localizacao.caput.inicio, localizacao.caput.fim).join('\n'));
      if (localizacao.outrosBlocos.length > 0) {
        const outros = localizacao.outrosBlocos.map((bloco) => `bloco ${bloco.indice} (${bloco.titulo})`).join('; ');
        avisos.push(
          `Há outro art. ${ordinal(localizacao.artigo.chave)} nesta norma em: ${outros}. Mostrando: ${localizacao.bloco.titulo}. Use o parâmetro bloco para escolher.`,
        );
      }
      const pagina = paginar([textoDispositivo], posicao, espaco - (caput?.length ?? 0));
      const dispositivo: Item = { citacao: localizacao.citacao, texto: pagina.texto };
      if (caput !== null && caput !== textoDispositivo && posicao.unidade === 0 && posicao.deslocamento === 0) {
        dispositivo['caput'] = caput;
      }
      if (estrutura.blocos.length > 1) dispositivo['bloco'] = localizacao.bloco.titulo;
      return {
        ...base,
        dispositivo,
        pagina: {
          truncado: pagina.proxima !== null,
          cursor: pagina.proxima === null ? null : codificarCursor({ t: 'o', f: impressao, u: pagina.proxima.unidade, d: pagina.proxima.deslocamento }),
        },
        avisos,
        aviso_legal: AVISO_LEGAL,
      };
    }

    const unidades = unidadesDePaginacao(estrutura);
    const textos = unidades.map((unidade) => arrumarParaExibir(saida.slice(unidade.inicio, unidade.fim).join('\n')));
    const pagina = paginar(textos, posicao, espaco);
    const rotulo = (indiceUnidade: number): string | null => unidades[indiceUnidade]?.rotulo ?? null;
    return {
      ...base,
      texto: pagina.texto,
      pagina: {
        de: rotulo(pagina.primeira),
        ate: rotulo(pagina.ultima),
        unidades: unidades.length,
        artigos: estrutura.artigos.length,
        cortada_no_meio: pagina.cortadaNoMeio,
        cursor: pagina.proxima === null ? null : codificarCursor({ t: 'o', f: impressao, u: pagina.proxima.unidade, d: pagina.proxima.deslocamento }),
      },
      avisos,
      aviso_legal: AVISO_LEGAL,
    };
  }

  // -------------------------------------------------------------------------
  // leis_facetas

  async facetas(entrada: EntradaFacetas): Promise<Resposta> {
    const indice = this.deps.indice();
    this.estado(indice);
    const { filtro } = lerFiltro(entrada);
    const limite = inteiro(entrada.limite, 'limite', 1, 100, 20);
    const pedidas = entrada.dimensoes ?? ['esfera', 'tipo', 'decada'];
    if (!Array.isArray(pedidas)) throw entradaInvalida('dimensoes deve ser uma lista.', `Use valores de: ${DIMENSOES.join(', ')}.`);
    const dimensoes: Dimensao[] = [];
    for (const valor of pedidas) {
      const dimensao = DIMENSOES.find((d) => d === valor);
      if (dimensao === undefined) throw entradaInvalida(`Dimensão inválida: "${String(valor)}".`, `Use valores de: ${DIMENSOES.join(', ')}.`);
      if (!dimensoes.includes(dimensao)) dimensoes.push(dimensao);
    }
    const texto = textoOpcional(entrada.texto, 'texto', 500);
    let fts: string | null = null;
    if (texto !== undefined) {
      const consulta = montarConsultaFts(texto, ['titulo', 'ementa']);
      if (consulta === null) throw new ErroLeis('consulta_vazia', 'O texto não tem termos pesquisáveis.', 'Use palavras com duas letras ou mais.');
      fts = consulta.expressao;
    }
    const total = indice.contar({ fts, filtro, teto: Number.MAX_SAFE_INTEGER - 1 });
    let porDimensao = limite;
    const montar = (): Resposta => {
      const facetas: Record<string, Contagem[]> = {};
      for (const dimensao of dimensoes) {
        const contagens = indice.facetas({ dimensao, fts, filtro, limite: porDimensao });
        facetas[dimensao] =
          dimensao === 'tipo'
            ? contagens.map((contagem) => ({ ...contagem, rotulo: rotuloDeChave(contagem.valor) ?? contagem.rotulo }))
            : contagens;
      }
      return { total, facetas, filtro: descreverFiltro(filtro) };
    };
    let resposta = montar();
    while (porDimensao > 5 && JSON.stringify(resposta).length > this.maximoCaracteres) {
      porDimensao = Math.max(5, Math.floor(porDimensao / 2));
      resposta = montar();
    }
    return resposta;
  }

  // -------------------------------------------------------------------------
  // leis_cobertura

  async cobertura(entrada: EntradaCobertura): Promise<Resposta> {
    const indice = this.deps.indice();
    const estado = this.estado(indice);
    const { filtro, recorte } = lerFiltro(entrada);
    return this.montarCobertura(indice, estado, filtro, recorte, false);
  }

  private async montarCobertura(
    indice: ConsultaIndice,
    estado: EstadoIndice,
    filtro: FiltroNormas,
    recorte: string,
    resumida: boolean,
  ): Promise<Resposta> {
    const noEscopo = escopoToca(estado.escopo, recorte);
    const filtroDoRecorte: FiltroNormas = {
      esfera: filtro.esfera,
      uf: filtro.uf,
      municipio: filtro.municipio,
      orgao: filtro.orgao,
      tribunal: filtro.tribunal,
      tipoChave: filtro.tipoChave,
    };
    const normasNoRecorte = indice.contar({ fts: null, filtro: filtroDoRecorte, teto: Number.MAX_SAFE_INTEGER - 1 });
    const [progressoMd, coberturaMd] = await Promise.all([
      this.deps.acervo.lerRaiz('PROGRESSO.md'),
      this.deps.acervo.lerRaiz('COBERTURA.md'),
    ]);
    const progresso = progressoMd === null ? null : lerProgresso(progressoMd);
    const linhas = progresso === null ? [] : progressoDoRecorte(progresso, recorte === CAMINHO_CONSTITUICAO ? 'constituicao.md' : recorte);
    const cobertura = coberturaMd === null ? null : lerCobertura(coberturaMd);
    const linhaUf = filtro.uf === undefined ? null : (cobertura?.ufs.find((linha) => linha.uf === filtro.uf) ?? null);

    const arquivos = indice.arquivosDeFalhas().filter((caminho) => {
      const pasta = caminho.replace(/\/?_falhas\.jsonl$/, '');
      return recorte === '' || pasta === recorte || pasta.startsWith(`${recorte}/`) || recorte.startsWith(`${pasta}/`);
    });
    const falhas: ResumoFalhas[] = [];
    for (const arquivo of arquivos.slice(0, 12)) {
      const conteudo = await this.deps.acervo.lerFalhas(arquivo);
      if (conteudo !== null) falhas.push(resumirFalhas(arquivo, conteudo));
    }

    const lacunas: string[] = [];
    if (!noEscopo) {
      lacunas.push(
        `O recorte "${recorte}" está fora do escopo local (${estado.escopo.join(', ')}). Acrescente-o a LEIS_ESCOPO e rode \`npx leis-mcp sync\`.`,
      );
    }
    for (const linha of linhas) {
      if (linha.meta !== null && linha.tem !== null && linha.tem < linha.meta) {
        const percentual = linha.meta > 0 ? Math.round((linha.tem / linha.meta) * 1000) / 10 : 0;
        lacunas.push(`${linha.tipoDeNorma}: o acervo tem ${linha.tem} de cerca de ${linha.meta} (${percentual}%).`);
      } else if (linha.meta === null && linha.tem !== null) {
        lacunas.push(`${linha.tipoDeNorma}: o acervo tem ${linha.tem}; o universo é desconhecido.`);
      }
    }
    if (linhaUf !== null && linhaUf.semTexto !== '') lacunas.push(`Normas de ${linhaUf.uf} sem texto na fonte: ${linhaUf.semTexto}.`);
    for (const resumo of falhas) {
      const principal = resumo.motivos[0];
      lacunas.push(
        `${resumo.arquivo}: ${resumo.total} norma(s) fora do acervo${principal ? `, sobretudo "${principal.motivo}" (${principal.quantidade})` : ''}.`,
      );
    }

    if (resumida) {
      return {
        recorte: recorte === '' ? '(acervo inteiro)' : recorte,
        recorte_no_escopo: noEscopo,
        normas_no_recorte: normasNoRecorte,
        escopo_local: estado.escopo,
        lacunas: lacunas.slice(0, 6),
        aviso: AVISO_AUSENCIA,
      };
    }
    const resposta: Resposta = {
      recorte: recorte === '' ? '(acervo inteiro)' : recorte,
      indice: {
        commit: estado.commit,
        sincronizado_em: estado.sincronizadoEm,
        remoto: estado.remoto,
        escopo: estado.escopo,
        corpo_indexado: estado.corpo,
        normas_no_indice: estado.total,
        por_esfera: estado.porEsfera,
        normas_no_recorte: normasNoRecorte,
        recorte_no_escopo: noEscopo,
      },
      progresso: linhas.slice(0, 20).map((linha) => ({
        secao: linha.secao,
        tipo_de_norma: linha.tipoDeNorma,
        situacao: linha.situacao,
        tem: linha.tem,
        meta: linha.meta,
        pastas: linha.pastas,
        fonte: linha.fonte,
      })),
      progresso_gerado_em: progresso?.geradoEm ?? null,
      cobertura_uf: linhaUf,
      falhas,
      lacunas,
      aviso: AVISO_AUSENCIA,
    };
    if (JSON.stringify(resposta).length > this.maximoCaracteres) {
      resposta['progresso'] = (resposta['progresso'] as unknown[]).slice(0, 5);
      resposta['falhas'] = falhas.slice(0, 3);
      resposta['lacunas'] = lacunas.slice(0, 10);
    }
    return resposta;
  }

  // -------------------------------------------------------------------------
  // leis_autoria

  async autoria(entrada: EntradaAutoria): Promise<Resposta> {
    const indice = this.deps.indice();
    const estado = this.estado(indice);
    const textoReferencia = textoOpcional(entrada.referencia, 'referencia', 400);
    const signatario = textoOpcional(entrada.signatario, 'signatario', 200);
    const formato = opcao(entrada.formato, 'formato', ['resumido', 'completo'] as const, 'resumido');
    if ((textoReferencia === undefined) === (signatario === undefined)) {
      throw entradaInvalida('Informe referencia ou signatario, um dos dois.', 'Use referencia para ver quem assinou uma norma, ou signatario para listar as normas de uma pessoa.');
    }
    const observacao = 'A autoria vem dos commits da base inicial do acervo. As datas vêm do cabeçalho das normas, nunca do commit.';
    if (textoReferencia !== undefined) {
      const referencia = this.lerReferencia(textoReferencia);
      const resolucao = this.resolver(indice, estado, referencia, {});
      if ('candidatos' in resolucao) return this.respostaCandidatos(resolucao, formato);
      const { norma } = resolucao;
      const autoria = indice.autoriaDe(norma.caminho);
      if (autoria === null) {
        return {
          norma: item(norma, formato),
          autoria: null,
          mensagem:
            'Sem autoria registrada para esta norma. Só a base inicial do histórico tem signatários; os lotes posteriores não registram autoria.',
          observacao,
        };
      }
      return {
        norma: item(norma, formato),
        autoria: { autor: autoria.autor, coautores: autoria.coautores, origem: autoria.origem, data: norma.data },
        observacao,
      };
    }
    const nome = signatario ?? '';
    const limite = inteiro(entrada.limite, 'limite', 1, LIMITE_MAXIMO, LIMITE_PADRAO);
    const impressao = fnv1a(JSON.stringify({ s: nome.toLowerCase() }));
    const cursor = textoOpcional(entrada.cursor, 'cursor', 2048);
    const deslocamento = cursor === undefined ? 0 : numeroDoCursor(decodificarCursor(cursor, 'a', impressao), 'o');
    const encontrado = indice.normasDoSignatario({ nome, limite: limite + 1, deslocamento });
    if (encontrado.nome === null) {
      const parecidos = indice.signatariosParecidos(nome, 10);
      throw new ErroLeis(
        'nao_encontrada',
        `Signatário não encontrado: "${nome}".`,
        parecidos.length > 0 ? 'Use um dos nomes sugeridos.' : 'Confira a grafia. Use o nome como aparece nas normas, com acentos.',
        parecidos,
      );
    }
    const itens = encontrado.normas.slice(0, limite).map((norma) => item(norma, formato));
    const resposta: Resposta = { signatario: encontrado.nome, total: encontrado.total, itens, cursor: null, observacao };
    caberItens(resposta, itens, this.maximoCaracteres);
    if (encontrado.normas.length > itens.length) {
      resposta['cursor'] = codificarCursor({ t: 'a', f: impressao, o: deslocamento + itens.length });
    }
    return resposta;
  }

  // -------------------------------------------------------------------------
  // Recurso leis://{caminho}

  async lerRecurso(caminho: string): Promise<string> {
    return this.deps.acervo.ler(exigirCaminho(caminho));
  }

  // -------------------------------------------------------------------------
  // Resolução de referências

  private lerReferencia(texto: string): Referencia {
    const referencia = analisarReferencia(texto);
    if (referencia === null) {
      throw entradaInvalida(
        `Não entendi a referência "${texto}".`,
        'Use um caminho do acervo, uma URN LexML ou uma citação como "Lei 8.078/1990", "LC 123/2006", "CF art. 5º" ou "Súmula 7 do STJ".',
      );
    }
    return referencia;
  }

  private foraDoEscopo(recorte: string, estado: EstadoIndice): ErroLeis {
    return new ErroLeis(
      'fora_do_escopo',
      `O recorte "${recorte || '(acervo inteiro)'}" está fora do escopo local (${estado.escopo.join(', ')}).`,
      `Acrescente "${recorte}" a LEIS_ESCOPO e rode \`npx leis-mcp sync\`.`,
    );
  }

  private naoEncontrada(referencia: string, estado: EstadoIndice): ErroLeis {
    return new ErroLeis(
      'nao_encontrada',
      `Nenhuma norma do acervo local casa com "${referencia}". ${AVISO_AUSENCIA}`,
      `Use leis_buscar com numero, tipo e data_de/data_ate, ou leis_cobertura para ver o recorte. Escopo local: ${estado.escopo.join(', ')}.`,
    );
  }

  private resolver(
    indice: ConsultaIndice,
    estado: EstadoIndice,
    referencia: Referencia,
    extras: { esfera?: Esfera | undefined; uf?: string | undefined },
  ): Resolucao {
    if (referencia.forma === 'caminho') {
      const norma = indice.porCaminho(referencia.caminho);
      if (norma !== null) return { norma, avisos: [] };
      if (!escopoCobre(estado.escopo, referencia.caminho)) throw this.foraDoEscopo(referencia.caminho, estado);
      throw this.naoEncontrada(referencia.caminho, estado);
    }
    if (referencia.forma === 'urn') {
      const porUrn = indice.porUrn(referencia.urn);
      const unica = porUrn[0];
      if (porUrn.length === 1 && unica !== undefined) return { norma: unica, avisos: [] };
      if (porUrn.length > 1) return { candidatos: porUrn, mensagem: 'A URN casa com mais de uma norma.' };
      if (referencia.numero !== null && referencia.pastas.length > 0) {
        const achadas = indice.porReferencia({
          pastas: referencia.pastas,
          numero: referencia.numero,
          anos: referencia.data === null ? [] : [Number(referencia.data.slice(0, 4))],
          data: referencia.data,
          esfera: 'federal',
          uf: null,
          tribunal: null,
          limite: 20,
        });
        return this.escolher(achadas, referencia.urn, estado, false, referencia.data);
      }
      throw this.naoEncontrada(referencia.urn, estado);
    }
    if (referencia.constituicao) {
      const constituicao = indice.porCaminho(CAMINHO_CONSTITUICAO);
      if (constituicao !== null) return { norma: constituicao, avisos: [] };
      throw this.foraDoEscopo('constituicao', estado);
    }
    if (referencia.numero === null) {
      throw entradaInvalida('A citação não tem o número da norma.', 'Informe o número, por exemplo "Lei 8.078/1990".');
    }
    const esfera = extras.esfera ?? referencia.esfera;
    const uf = extras.uf ?? referencia.uf;
    const achadas = indice.porReferencia({
      pastas: referencia.pastas,
      numero: referencia.numero,
      anos: referencia.anos,
      data: referencia.data,
      esfera,
      uf,
      tribunal: referencia.tribunal,
      limite: 20,
    });
    const descricao = [referencia.pastas[0] ?? 'norma', referencia.numero, referencia.anos.join('|')].filter(Boolean).join(' ');
    return this.escolher(achadas, descricao, estado, esfera === null && uf === null, referencia.data);
  }

  private escolher(
    achadas: Norma[],
    descricao: string,
    estado: EstadoIndice,
    preferirFederal: boolean,
    data: string | null,
  ): Resolucao {
    const primeira = achadas[0];
    if (primeira === undefined) throw this.naoEncontrada(descricao, estado);
    if (achadas.length === 1) return { norma: primeira, avisos: [] };
    if (data !== null) {
      const mesmaData = achadas.filter((norma) => norma.data === data);
      const unica = mesmaData[0];
      if (mesmaData.length === 1 && unica !== undefined) return { norma: unica, avisos: [] };
    }
    if (preferirFederal) {
      const federais = achadas.filter((norma) => norma.esfera === 'federal');
      const federal = federais[0];
      if (federais.length === 1 && federal !== undefined) {
        return {
          norma: federal,
          avisos: [
            `Há ${achadas.length - 1} outra(s) norma(s) com o mesmo número em outras esferas. Informe esfera ou uf para escolher outra.`,
          ],
        };
      }
    }
    return { candidatos: achadas, mensagem: 'A referência casa com mais de uma norma.' };
  }

  private respostaCandidatos(resolucao: { candidatos: Norma[]; mensagem: string }, formato: Formato): Resposta {
    return {
      candidatos: resolucao.candidatos.map((norma) => item(norma, formato)),
      mensagem: resolucao.mensagem,
      proximo_passo: 'Chame a ferramenta de novo com o caminho de um dos candidatos em referencia, ou informe esfera, uf ou o ano.',
    };
  }
}

/**
 * Com o tachado incluído, a redação antiga vem antes da nova e fica na faixa anterior.
 * Puxa para a faixa as linhas tachadas com o mesmo rótulo e solta as do rótulo seguinte.
 */
export function ajustarComTachado(linhas: readonly string[], inicio: number, fim: number): [number, number] {
  const rotulo = rotuloInicial(linhas[inicio] ?? '');
  let novoInicio = inicio;
  if (rotulo !== null) {
    for (let i = inicio - 1; i >= 0; i -= 1) {
      const linha = linhas[i] ?? '';
      if (linha.trim() === '') continue;
      if (!linhaSoTachada(linha)) break;
      if (rotuloInicial(semMarcasDeTachado(linha)) === rotulo) novoInicio = i;
    }
  }
  let novoFim = fim;
  for (let i = fim - 1; i > novoInicio; i -= 1) {
    const linha = linhas[i] ?? '';
    if (linha.trim() === '') continue;
    if (!linhaSoTachada(linha)) break;
    if (rotuloInicial(semMarcasDeTachado(linha)) !== null) novoFim = i;
  }
  return [novoInicio, novoFim];
}
