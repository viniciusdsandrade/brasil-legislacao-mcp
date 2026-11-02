import { ErroLeis } from './erros.js';
import { dobrar, ordinal, paraRomano } from './texto.js';

/** Níveis abaixo do artigo: 1 parágrafo, 2 inciso, 3 alínea. */
export type Nivel = 1 | 2 | 3;

export interface Unidade {
  nivel: Nivel;
  chave: string;
  linha: number;
}

export interface Artigo {
  chave: string;
  inicio: number;
  fim: number;
  unidades: Unidade[];
  bloco: number;
  ordem: number;
}

/** Artigos com numeração contínua. A Constituição tem dois: o texto principal e o ADCT. */
export interface Bloco {
  indice: number;
  titulo: string;
  artigos: Map<string, Artigo>;
}

export interface Estrutura {
  linhas: readonly string[];
  blocos: Bloco[];
  artigos: Artigo[];
}

interface Titulo {
  linha: number;
  nivel: number;
  texto: string;
}

interface Faixa {
  inicio: number;
  fim: number;
  unidades: Unidade[];
}

const MARCAS_INICIAIS = /^[\s>*_]+/;
const ASPAS_INICIAIS = /^[“"'‘«]/;
const TITULO_MARKDOWN = /^(#{1,6})\s+(.*)$/;
const FIM_DE_TEXTO = /^(?:Bras[íi]lia|Rio de Janeiro|Pal[áa]cio|Pa[çc]o|Sala das Sess[õo]es|Gabinete d[oa])\b/;
const ARTIGO =
  /^Art(?:igo)?\s*\.?\s*((?:l(?=\d))?\d{1,4}(?:\.\d{3})*)\s*(?:[º°ª]|o(?!\p{L}))?\s*\.?\s*((?:-[A-Z](?!\p{L}))*)/u;
const ARTIGO_UNICO = /^Artigo\s+[úÚuU]nico\b/;
const PARAGRAFO =
  /^(?:§\s*(\d{1,3})\s*(?:[º°ª]|o(?!\p{L}))?\s*\.?\s*((?:-[A-Z](?!\p{L}))*)|([Pp]ar[áa]grafo\s+[úÚuU]nico|PAR[ÁA]GRAFO\s+[ÚU]NICO))/u;
const INCISO = /^([IVXLCDM]+)((?:-[A-Z])*)\s*[-–—]\s*/;
const ALINEA = /^([a-z])\)\s*/;

const NOMES_NIVEL: Record<Nivel, string> = { 1: 'parágrafo', 2: 'inciso', 3: 'alínea' };

/** Tira as marcas iniciais da linha. Linha citada entre aspas vira null: é texto de outra norma. */
function prepararLinha(linha: string): string | null {
  const semMarcas = linha.replace(MARCAS_INICIAIS, '');
  if (semMarcas === '' || ASPAS_INICIAIS.test(semMarcas)) return null;
  return semMarcas;
}

function chaveNumerica(numero: string, sufixo: string): string {
  const valor = Number.parseInt(numero.replace(/^l/, '1').replace(/\./g, ''), 10);
  return `${Number.isNaN(valor) ? numero : String(valor)}${sufixo.replace(/\s+/g, '').toUpperCase()}`;
}

/** Chave do artigo que abre a linha ("5", "4-A", "1000", "unico"), ou null. */
export function chaveDeRotuloDeArtigo(linha: string): string | null {
  const preparada = prepararLinha(linha);
  if (preparada === null) return null;
  if (ARTIGO_UNICO.test(preparada)) return 'unico';
  const encontrado = ARTIGO.exec(preparada);
  if (!encontrado) return null;
  return chaveNumerica(encontrado[1] ?? '', encontrado[2] ?? '');
}

function unidadeDaLinha(linha: string, indice: number): Unidade | null {
  const preparada = prepararLinha(linha);
  if (preparada === null) return null;
  const paragrafo = PARAGRAFO.exec(preparada);
  if (paragrafo) {
    const chave = paragrafo[3] ? 'unico' : chaveNumerica(paragrafo[1] ?? '', paragrafo[2] ?? '');
    return { nivel: 1, chave, linha: indice };
  }
  const inciso = INCISO.exec(preparada);
  if (inciso) return { nivel: 2, chave: `${inciso[1] ?? ''}${inciso[2] ?? ''}`, linha: indice };
  const alinea = ALINEA.exec(preparada);
  if (alinea) return { nivel: 3, chave: alinea[1] ?? '', linha: indice };
  return null;
}

function proximoLimite(limites: readonly number[], linha: number, total: number): number {
  let baixo = 0;
  let alto = limites.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >> 1;
    if ((limites[meio] ?? total) <= linha) baixo = meio + 1;
    else alto = meio;
  }
  return limites[baixo] ?? total;
}

function tituloDoBloco(titulos: readonly Titulo[], linha: number, inicioAnterior: number): string {
  const antes = titulos.filter((titulo) => titulo.linha < linha);
  const novosDeTopo = antes.filter((titulo) => titulo.nivel === 1 && titulo.linha > inicioAnterior);
  const escolhido = novosDeTopo[novosDeTopo.length - 1] ?? antes[antes.length - 1];
  return escolhido?.texto ?? 'texto principal';
}

/**
 * Lê a estrutura de artigos e unidades. As linhas devem vir sem tachado
 * (ver removerTachado), com a mesma numeração do texto original.
 */
export function estruturar(linhas: readonly string[]): Estrutura {
  const inicios: Array<{ linha: number; chave: string }> = [];
  const paradas = new Set<number>();
  const titulos: Titulo[] = [];
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = (linhas[i] ?? '').trim();
    if (linha === '') continue;
    const titulo = TITULO_MARKDOWN.exec(linha);
    if (titulo) {
      paradas.add(i);
      titulos.push({ linha: i, nivel: (titulo[1] ?? '#').length, texto: (titulo[2] ?? '').trim() });
      continue;
    }
    const preparada = prepararLinha(linha);
    if (preparada === null) continue;
    if (FIM_DE_TEXTO.test(preparada)) {
      paradas.add(i);
      continue;
    }
    const chave = chaveDeRotuloDeArtigo(linha);
    if (chave !== null) inicios.push({ linha: i, chave });
  }
  const limites = [...new Set([...paradas, ...inicios.map((inicio) => inicio.linha), linhas.length])].sort(
    (a, b) => a - b,
  );
  const artigos: Artigo[] = inicios.map((inicio, ordem) => {
    const fim = proximoLimite(limites, inicio.linha, linhas.length);
    const unidades: Unidade[] = [];
    for (let i = inicio.linha + 1; i < fim; i += 1) {
      const unidade = unidadeDaLinha((linhas[i] ?? '').trim(), i);
      if (unidade) unidades.push(unidade);
    }
    return { chave: inicio.chave, inicio: inicio.linha, fim, unidades, bloco: 0, ordem };
  });

  const blocos: Bloco[] = [];
  let inicioAnterior = -1;
  for (const artigo of artigos) {
    let atual = blocos[blocos.length - 1];
    if (atual === undefined || atual.artigos.has(artigo.chave)) {
      atual = { indice: blocos.length, titulo: tituloDoBloco(titulos, artigo.inicio, inicioAnterior), artigos: new Map() };
      blocos.push(atual);
      inicioAnterior = artigo.inicio;
    }
    artigo.bloco = atual.indice;
    atual.artigos.set(artigo.chave, artigo);
  }
  return { linhas, blocos, artigos };
}

/** O bloco com mais artigos: o texto principal da norma. */
export function blocoPrincipal(estrutura: Estrutura): Bloco | null {
  let principal: Bloco | null = null;
  for (const bloco of estrutura.blocos) {
    if (principal === null || bloco.artigos.size > principal.artigos.size) principal = bloco;
  }
  return principal;
}

// ---------------------------------------------------------------------------
// Entrada do usuário

function erroDeEntrada(campo: string, valor: string, exemplo: string): ErroLeis {
  return new ErroLeis('entrada_invalida', `Valor inválido para ${campo}: "${valor}".`, `Informe ${campo} como ${exemplo}.`);
}

/** "Art. 5º" -> "5"; "4-a" -> "4-A"; "1.000" -> "1000"; "único" -> "unico". */
export function chaveDeArtigo(valor: string): string {
  const texto = valor.trim().replace(/^art(?:igo)?\.?\s*/i, '');
  if (/^[úu]nico$/i.test(texto)) return 'unico';
  const encontrado = /^((?:l(?=\d))?\d{1,4}(?:\.\d{3})*)\s*(?:[º°ª]|o(?!\p{L}))?\s*\.?\s*((?:-\s*[A-Za-z](?!\p{L}))*)$/u.exec(texto);
  if (!encontrado) throw erroDeEntrada('artigo', valor, '"5", "5º", "4-A" ou "1.000"');
  return chaveNumerica(encontrado[1] ?? '', encontrado[2] ?? '');
}

/** "§ 2º" -> "2"; "parágrafo único" -> "unico"; "1-a" -> "1-A". */
export function chaveDeParagrafo(valor: string): string {
  const texto = dobrar(valor.trim()).replace(/^§\s*|^paragrafo\s*/, '');
  if (texto === 'unico') return 'unico';
  const encontrado = /^(\d{1,3})\s*[º°ª]?\s*((?:-\s*[a-z](?![a-z]))*)$/.exec(texto);
  if (!encontrado) throw erroDeEntrada('paragrafo', valor, '"2", "2º" ou "único"');
  return chaveNumerica(encontrado[1] ?? '', encontrado[2] ?? '');
}

/** "xi" -> "XI"; "11" -> "XI"; "inciso I-A" -> "I-A". */
export function chaveDeInciso(valor: string): string {
  const texto = valor.trim().replace(/^inciso\s*/i, '').toUpperCase().replace(/\s+/g, '');
  const encontrado = /^(?:([IVXLCDM]+)|(\d{1,4}))((?:-[A-Z])*)$/.exec(texto);
  const arabico = encontrado?.[2] ? Number(encontrado[2]) : null;
  if (!encontrado || (arabico !== null && (arabico < 1 || arabico > 3999))) {
    throw erroDeEntrada('inciso', valor, 'algarismo romano ou número, por exemplo "XI" ou 11');
  }
  const romano = encontrado[1] ?? paraRomano(arabico ?? 0);
  return `${romano}${encontrado[3] ?? ''}`;
}

/** "a", "a)" ou "alínea a" -> "a". */
export function chaveDeAlinea(valor: string): string {
  const texto = dobrar(valor.trim()).replace(/^alinea\s*/, '').replace(/[)"“”]/g, '');
  if (!/^[a-z]$/.test(texto)) throw erroDeEntrada('alinea', valor, 'uma letra, por exemplo "a"');
  return texto;
}

function exibirParagrafo(chave: string): string {
  return chave === 'unico' ? 'parágrafo único' : `§ ${ordinal(chave)}`;
}

/** Citação no padrão "art. 5º, XI", "art. 10, § 1º, II, alínea a". */
export function formatarCitacao(artigo: string, paragrafo: string | null, inciso: string | null, alinea: string | null): string {
  const partes = [artigo === 'unico' ? 'artigo único' : `art. ${ordinal(artigo)}`];
  if (paragrafo !== null) partes.push(exibirParagrafo(paragrafo));
  if (inciso !== null) partes.push(inciso);
  if (alinea !== null) partes.push(`alínea ${alinea}`);
  return partes.join(', ');
}

// ---------------------------------------------------------------------------
// Localização de um dispositivo

export interface PedidoDispositivo {
  artigo: string;
  paragrafo?: string | undefined;
  inciso?: string | undefined;
  alinea?: string | undefined;
  bloco?: string | undefined;
}

export interface Localizacao {
  artigo: Artigo;
  bloco: Bloco;
  outrosBlocos: Bloco[];
  inicio: number;
  fim: number;
  /** Faixa do caput, quando o pedido desce a parágrafo, inciso ou alínea. */
  caput: { inicio: number; fim: number } | null;
  citacao: string;
}

function estreitar(faixa: Faixa, nivel: Nivel, chave: string): Faixa | null {
  const indice = faixa.unidades.findIndex((unidade) => unidade.nivel === nivel && unidade.chave === chave);
  const alvo = faixa.unidades[indice];
  if (indice < 0 || alvo === undefined) return null;
  const seguintes = faixa.unidades.slice(indice + 1);
  const fim = seguintes.find((unidade) => unidade.nivel <= nivel)?.linha ?? faixa.fim;
  return { inicio: alvo.linha, fim, unidades: seguintes.filter((unidade) => unidade.linha < fim) };
}

function antesDoPrimeiro(faixa: Faixa, nivel: Nivel): Faixa {
  const fim = faixa.unidades.find((unidade) => unidade.nivel === nivel)?.linha ?? faixa.fim;
  return { inicio: faixa.inicio, fim, unidades: faixa.unidades.filter((unidade) => unidade.linha < fim) };
}

function chavesDoNivel(faixa: Faixa, nivel: Nivel): string[] {
  return faixa.unidades.filter((unidade) => unidade.nivel === nivel).map((unidade) => unidade.chave);
}

function vizinhos(estrutura: Estrutura, chave: string): string[] {
  const principal = blocoPrincipal(estrutura);
  if (principal === null) return [];
  const alvo = Number.parseInt(chave, 10);
  const chaves = [...principal.artigos.keys()];
  if (Number.isNaN(alvo)) return chaves.slice(0, 5).map((c) => `art. ${ordinal(c)}`);
  return chaves
    .map((c) => ({ c, distancia: Math.abs((Number.parseInt(c, 10) || 0) - alvo) }))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 5)
    .map(({ c }) => `art. ${ordinal(c)}`);
}

function blocoCasa(bloco: Bloco, seletor: string): boolean {
  if (/^\d+$/.test(seletor)) return bloco.indice === Number(seletor);
  const titulo = dobrar(bloco.titulo);
  const alvo = dobrar(seletor.trim());
  if (alvo === 'adct') return titulo.includes('transitori');
  return alvo !== '' && titulo.includes(alvo);
}

function escolherBloco(estrutura: Estrutura, candidatos: Bloco[], seletor: string | undefined, chave: string): Bloco {
  if (seletor === undefined || seletor.trim() === '') {
    const principal = blocoPrincipal(estrutura);
    return candidatos.find((bloco) => bloco === principal) ?? (candidatos[0] as Bloco);
  }
  const escolhido = candidatos.find((bloco) => blocoCasa(bloco, seletor));
  if (escolhido) return escolhido;
  throw new ErroLeis(
    'dispositivo_nao_encontrado',
    `Art. ${ordinal(chave)} não existe no bloco "${seletor}".`,
    'Use um dos blocos sugeridos no parâmetro bloco, ou omita o parâmetro.',
    candidatos.map((bloco) => `bloco ${bloco.indice}: ${bloco.titulo}`),
  );
}

/** Acha o artigo e desce a parágrafo, inciso e alínea. Lança erro com sugestões quando não acha. */
export function localizarDispositivo(estrutura: Estrutura, pedido: PedidoDispositivo): Localizacao {
  const chave = chaveDeArtigo(pedido.artigo);
  const candidatos = estrutura.blocos.filter((bloco) => bloco.artigos.has(chave));
  if (candidatos.length === 0) {
    throw new ErroLeis(
      'dispositivo_nao_encontrado',
      `Art. ${ordinal(chave)} não encontrado nesta norma.`,
      'Confira o número, ou leia a norma sem o parâmetro artigo para ver os artigos.',
      vizinhos(estrutura, chave),
    );
  }
  const bloco = escolherBloco(estrutura, candidatos, pedido.bloco, chave);
  const artigo = bloco.artigos.get(chave);
  if (artigo === undefined) {
    throw new ErroLeis('dispositivo_nao_encontrado', `Art. ${ordinal(chave)} não encontrado.`, 'Confira o número do artigo.');
  }
  const paragrafo = pedido.paragrafo ? chaveDeParagrafo(pedido.paragrafo) : null;
  const inciso = pedido.inciso ? chaveDeInciso(pedido.inciso) : null;
  const alinea = pedido.alinea ? chaveDeAlinea(pedido.alinea) : null;
  const desce = paragrafo !== null || inciso !== null || alinea !== null;

  const inteiro: Faixa = { inicio: artigo.inicio, fim: artigo.fim, unidades: artigo.unidades };
  let faixa: Faixa = desce && paragrafo === null ? antesDoPrimeiro(inteiro, 1) : inteiro;
  const passos: Array<[Nivel, string | null]> = [
    [1, paragrafo],
    [2, inciso],
    [3, alinea],
  ];
  for (const [nivel, valor] of passos) {
    if (valor === null) continue;
    const estreita = estreitar(faixa, nivel, valor);
    if (estreita === null) {
      const existentes = chavesDoNivel(faixa, nivel).map((c) => (nivel === 1 ? exibirParagrafo(c) : c));
      const ondeHa =
        nivel === 2 && paragrafo === null
          ? chavesDoNivel(inteiro, 1).filter((p) => {
              const dentro = estreitar(inteiro, 1, p);
              return dentro !== null && estreitar(dentro, 2, valor) !== null;
            })
          : [];
      const dica =
        ondeHa.length > 0
          ? ` O inciso ${valor} existe em: ${ondeHa.map(exibirParagrafo).join(', ')}. Informe o parâmetro paragrafo.`
          : '';
      throw new ErroLeis(
        'dispositivo_nao_encontrado',
        `${NOMES_NIVEL[nivel]} ${nivel === 1 ? exibirParagrafo(valor) : valor} não encontrado no art. ${ordinal(chave)}.${dica}`,
        existentes.length > 0 ? `Use um destes: ${existentes.join(', ')}.` : 'Leia o artigo inteiro sem esse parâmetro.',
        existentes,
      );
    }
    faixa = estreita;
  }
  const fimDoCaput = artigo.unidades[0]?.linha ?? artigo.fim;
  return {
    artigo,
    bloco,
    outrosBlocos: candidatos.filter((outro) => outro !== bloco),
    inicio: faixa.inicio,
    fim: faixa.fim,
    caput: desce ? { inicio: artigo.inicio, fim: fimDoCaput } : null,
    citacao: formatarCitacao(chave, paragrafo, inciso, alinea),
  };
}

// ---------------------------------------------------------------------------
// Paginação

export interface UnidadePaginacao {
  inicio: number;
  fim: number;
  rotulo: string | null;
}

/** Unidades de leitura: preâmbulo e artigos; sem artigos, os parágrafos do texto. */
export function unidadesDePaginacao(estrutura: Estrutura): UnidadePaginacao[] {
  const total = estrutura.linhas.length;
  const artigos = estrutura.artigos;
  const primeiro = artigos[0];
  if (primeiro === undefined) {
    const unidades: UnidadePaginacao[] = [];
    let inicio = -1;
    for (let i = 0; i <= total; i += 1) {
      const vazia = i === total || (estrutura.linhas[i] ?? '').trim() === '';
      if (!vazia && inicio < 0) inicio = i;
      if (vazia && inicio >= 0) {
        unidades.push({ inicio, fim: i, rotulo: null });
        inicio = -1;
      }
    }
    return unidades;
  }
  const unidades: UnidadePaginacao[] = [];
  if (primeiro.inicio > 0) unidades.push({ inicio: 0, fim: primeiro.inicio, rotulo: null });
  artigos.forEach((artigo, indice) => {
    const proximo = artigos[indice + 1];
    const rotulo = artigo.chave === 'unico' ? 'artigo único' : `art. ${ordinal(artigo.chave)}`;
    unidades.push({ inicio: artigo.inicio, fim: proximo ? proximo.inicio : total, rotulo });
  });
  return unidades;
}

export interface PosicaoPagina {
  unidade: number;
  deslocamento: number;
}

export interface Pagina {
  texto: string;
  primeira: number;
  ultima: number;
  proxima: PosicaoPagina | null;
  cortadaNoMeio: boolean;
}

function pontoDeCorte(texto: string, maximo: number): number {
  if (texto.length <= maximo) return texto.length;
  const quebra = texto.lastIndexOf('\n', maximo);
  if (quebra > maximo * 0.5) return quebra + 1;
  const espaco = texto.lastIndexOf(' ', maximo);
  if (espaco > maximo * 0.5) return espaco + 1;
  return Math.max(1, maximo);
}

/**
 * Junta unidades até o limite de caracteres. Uma unidade maior que a página é cortada
 * numa quebra de linha, e a próxima página continua do ponto do corte.
 */
export function paginar(textos: readonly string[], inicio: PosicaoPagina, maximo: number): Pagina {
  const partes: string[] = [];
  let usados = 0;
  let unidade = Math.max(0, inicio.unidade);
  let deslocamento = Math.max(0, inicio.deslocamento);
  let cortadaNoMeio = false;
  const primeira = unidade;
  while (unidade < textos.length) {
    const resto = (textos[unidade] ?? '').slice(deslocamento);
    const separador = partes.length > 0 ? 2 : 0;
    if (usados + separador + resto.length <= maximo) {
      if (resto !== '') {
        partes.push(resto);
        usados += separador + resto.length;
      }
      unidade += 1;
      deslocamento = 0;
      continue;
    }
    if (partes.length > 0) break;
    const corte = pontoDeCorte(resto, maximo);
    partes.push(resto.slice(0, corte).trimEnd());
    deslocamento += corte;
    cortadaNoMeio = true;
    break;
  }
  const ultima = deslocamento > 0 ? unidade : unidade - 1;
  return {
    texto: partes.join('\n\n'),
    primeira,
    ultima: Math.max(primeira, ultima),
    proxima: unidade < textos.length ? { unidade, deslocamento } : null,
    cortadaNoMeio,
  };
}

/** Rótulo normalizado que abre a linha ("art:5", "1:2", "2:XI", "3:a"), ou null. */
export function rotuloInicial(linha: string): string | null {
  const artigo = chaveDeRotuloDeArtigo(linha);
  if (artigo !== null) return `art:${artigo}`;
  const unidade = unidadeDaLinha(linha.trim(), 0);
  return unidade ? `${unidade.nivel}:${unidade.chave}` : null;
}
