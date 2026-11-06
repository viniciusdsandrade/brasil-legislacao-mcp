import { LeitorLogAutoria } from './autoria.js';
import {
  analisarCaminho,
  escopoCobre,
  falhasAncestrais,
  normalizarEscopo,
  pastasDoCheckout,
  pastasDoCheckoutDaEntrada,
  pathspecDaEntrada,
} from './caminho.js';
import { ErroLeis, mensagemDe } from './erros.js';
import { registroDaNorma } from './indexacao.js';
import { CAMINHO_DO_REGISTRO_DE_PENDENCIAS, lerRegistroDePendencias, type RegistroDePendencias } from './integralidade.js';
import type { GravadorIndice, LeitorArquivos, Mudanca, Relogio, RepositorioGit } from './portas.js';
import type { RegistroAutoria, RegistroNorma } from './tipos.js';

/**
 * Versão 4: vigência segundo a fonte (forca_legal_fonte) e pendências de integralidade.
 * Versão 3: ementa dos registros de tribunal tirada das seções (Questão, Enunciado, Tese,
 * textoEmenta) ou do primeiro parágrafo do texto.
 * Versão 2: tribunal de jurisprudencia/outros-tribunais e falhas das pastas acima do escopo.
 */
export const VERSAO_ESQUEMA = 4;
const TAMANHO_LOTE = 500;
const LOTE_AUTORIA = 2_000;
const LEITURAS_SIMULTANEAS = 16;

export interface ConfiguracaoSync {
  remoto: string;
  ramo: string;
  escopo: readonly string[];
  corpo: readonly string[];
}

export type FuncaoLog = (nivel: 'info' | 'aviso' | 'depuracao', mensagem: string, dados?: Record<string, unknown>) => void;

export interface DependenciasSync {
  git: RepositorioGit;
  gravador: GravadorIndice;
  leitor: LeitorArquivos;
  relogio: Relogio;
  log: FuncaoLog;
}

export interface RelatorioSync {
  commit: string;
  anterior: string | null;
  modo: 'completo' | 'incremental' | 'sem_mudancas';
  gravadas: number;
  removidas: number;
  ignoradas: number;
  autorias: number;
  religadas: number;
  escopo: string[];
  corpo: string[];
  normas: number;
  /** Normas no registro de pendências de integralidade do acervo. */
  pendencias: number;
  duracao_ms: number;
}

function lerLista(valor: string | null): string[] {
  if (valor === null) return [];
  try {
    const lido: unknown = JSON.parse(valor);
    return Array.isArray(lido) ? lido.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mesmoConjunto(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/** Pastas do sparse-checkout para o escopo num commit, sem as subpastas que nunca têm normas. */
async function pastasDoCheckoutNoCommit(git: RepositorioGit, escopo: readonly string[], commit: string): Promise<string[]> {
  const pastas: string[] = [];
  for (const entrada of pastasDoCheckout(escopo)) {
    const subpastas: string[] = [];
    for await (const pasta of git.pastas(commit, entrada)) subpastas.push(pasta);
    for (const pasta of pastasDoCheckoutDaEntrada(entrada, subpastas)) pastas.push(pasta);
  }
  return pastas.sort();
}

/** Entradas que as duas listas cobrem. */
function intersecao(a: readonly string[], b: readonly string[]): string[] {
  return normalizarEscopo([
    ...a.filter((entrada) => escopoCobre(b, pathspecDaEntrada(entrada))),
    ...b.filter((entrada) => escopoCobre(a, pathspecDaEntrada(entrada))),
  ]);
}

function ehArquivoDeFalhas(caminho: string): boolean {
  return caminho === '_falhas.jsonl' || caminho.endsWith('/_falhas.jsonl');
}

/** Processa caminhos em lotes: lê, monta registros e grava. Remoções vão direto ao gravador. */
class ProcessadorDeLotes {
  gravadas = 0;
  removidas = 0;
  ignoradas = 0;
  private gravar: string[] = [];
  private remover: string[] = [];
  private falhasNovas: string[] = [];
  private falhasRemovidas: string[] = [];

  constructor(
    private readonly deps: DependenciasSync,
    private readonly corpo: readonly string[],
  ) {}

  async acrescentar(mudanca: Mudanca): Promise<void> {
    if (ehArquivoDeFalhas(mudanca.caminho)) {
      if (mudanca.status === 'D') this.falhasRemovidas.push(mudanca.caminho);
      else this.falhasNovas.push(mudanca.caminho);
      return;
    }
    if (analisarCaminho(mudanca.caminho) === null) return;
    if (mudanca.status === 'D') this.remover.push(mudanca.caminho);
    else this.gravar.push(mudanca.caminho);
    if (this.gravar.length + this.remover.length >= TAMANHO_LOTE) await this.descarregar();
  }

  async descarregar(): Promise<void> {
    const gravar = this.gravar;
    const remover = this.remover;
    this.gravar = [];
    this.remover = [];
    if (remover.length > 0) this.removidas += this.deps.gravador.removerNormas(remover);
    if (gravar.length > 0) {
      const registros: RegistroNorma[] = [];
      const descartar: string[] = [];
      for (let i = 0; i < gravar.length; i += LEITURAS_SIMULTANEAS) {
        const fatia = gravar.slice(i, i + LEITURAS_SIMULTANEAS);
        const lidos = await Promise.all(
          fatia.map(async (caminho) => {
            const conteudo = await this.deps.leitor.ler(caminho);
            return { caminho, registro: conteudo === null ? null : registroDaNorma(caminho, conteudo, escopoCobre(this.corpo, caminho)) };
          }),
        );
        for (const { caminho, registro } of lidos) {
          if (registro !== null) {
            registros.push(registro);
            continue;
          }
          // Arquivo ausente ou sem cabeçalho válido: a linha antiga do índice sai.
          this.ignoradas += 1;
          descartar.push(caminho);
        }
      }
      if (descartar.length > 0) this.removidas += this.deps.gravador.removerNormas(descartar);
      this.deps.gravador.gravarNormas(registros);
      this.gravadas += registros.length;
      if (Math.floor((this.gravadas - registros.length) / 20_000) !== Math.floor(this.gravadas / 20_000)) {
        this.deps.log('info', 'normas gravadas', { total: this.gravadas });
      }
    }
    if (this.falhasNovas.length > 0) this.deps.gravador.registrarFalhas(this.falhasNovas.splice(0));
    if (this.falhasRemovidas.length > 0) this.deps.gravador.removerFalhas(this.falhasRemovidas.splice(0));
  }
}

async function lerAutoria(
  deps: DependenciasSync,
  pathspecs: readonly string[],
  intervalo: string | null,
): Promise<number> {
  if (pathspecs.length === 0) return 0;
  const leitor = new LeitorLogAutoria();
  let lote: RegistroAutoria[] = [];
  let total = 0;
  const descarregar = (): void => {
    if (lote.length === 0) return;
    deps.gravador.gravarAutoria(lote);
    total += lote.length;
    lote = [];
  };
  for await (const pedaco of deps.git.logAutoria(pathspecs, intervalo)) {
    lote.push(...leitor.alimentar(pedaco));
    if (lote.length >= LOTE_AUTORIA) descarregar();
  }
  lote.push(...leitor.terminar());
  descarregar();
  return total;
}

/**
 * Sincroniza o clone e o índice: clona se preciso, busca o ramo com `git fetch`, ajusta o
 * sparse-checkout pelas árvores do commit buscado (sem as pastas que nunca têm normas, como
 * federal/_fonte), avança com `git merge --ff-only`, indexa o que mudou desde o commit
 * indexado e as entradas novas do escopo, lê a autoria e grava o commit novo só no fim.
 * Rodar de novo sem mudanças não altera nada.
 */
interface PendenciasDoSync {
  /** Normas do registro que está no índice. */
  total: number;
  /** Este sync gravou outro registro no índice. */
  mudou: boolean;
  /** Chaves de `meta` que o sync grava junto com as outras. */
  meta: Record<string, string>;
}

/**
 * Grava no índice o registro de pendências de integralidade do acervo. O registro fica fora das
 * pastas de normas: o sync compara o identificador do conteúdo, que vem das árvores, e só lê o
 * arquivo quando ele mudou.
 */
async function sincronizarPendencias(deps: DependenciasSync, commit: string): Promise<PendenciasDoSync> {
  const { gravador } = deps;
  const semMudanca: PendenciasDoSync = { total: Number(gravador.lerMeta('pendencias_total') ?? '0'), mudou: false, meta: {} };
  const objeto = (await deps.git.objetoDoArquivo(commit, CAMINHO_DO_REGISTRO_DE_PENDENCIAS)) ?? '';
  if (objeto === (gravador.lerMeta('pendencias_objeto') ?? '')) return semMudanca;
  let registro: RegistroDePendencias | null = null;
  if (objeto !== '') {
    deps.log('info', 'lendo o registro de pendências de integralidade');
    let conteudo: string;
    try {
      conteudo = await deps.git.lerObjeto(objeto);
    } catch (erro) {
      // As normas já estão no índice: uma falha aqui não desfaz o sync. O identificador não é
      // gravado, e por isso o próximo sync lê o registro de novo.
      deps.log('aviso', 'não foi possível ler o registro de pendências de integralidade: as pendências do índice não mudaram', {
        erro: mensagemDe(erro),
      });
      return semMudanca;
    }
    registro = lerRegistroDePendencias(conteudo);
    if (registro === null) deps.log('aviso', 'o registro de pendências de integralidade não tem o formato esperado: nenhuma pendência gravada');
  }
  gravador.substituirPendencias(registro?.pendentes ?? []);
  const total = registro?.pendentes.length ?? 0;
  return {
    total,
    mudou: true,
    meta: {
      pendencias_objeto: objeto,
      pendencias_data: registro?.data ?? '',
      pendencias_criterio: registro?.criterio ?? '',
      pendencias_total: String(total),
    },
  };
}

export async function sincronizar(deps: DependenciasSync, configuracao: ConfiguracaoSync): Promise<RelatorioSync> {
  const inicio = deps.relogio.agora().getTime();
  const escopo = normalizarEscopo(configuracao.escopo);
  if (escopo.length === 0) {
    throw new ErroLeis('entrada_invalida', 'O escopo está vazio.', 'Defina LEIS_ESCOPO, por exemplo "constituicao,federal".');
  }
  // O corpo vale só dentro do escopo: LEIS_CORPO=estaduais com LEIS_ESCOPO=estaduais/SP indexa o corpo de SP.
  const corpo = intersecao(normalizarEscopo(configuracao.corpo), escopo);
  const pathspecs = escopo.map(pathspecDaEntrada);
  const ancestraisDe = (specs: readonly string[]): string[] =>
    [...new Set(specs.flatMap(falhasAncestrais))].filter((caminho) => !escopoCobre(escopo, caminho));

  if (await deps.git.existe()) {
    const remoto = await deps.git.remotoAtual();
    if (remoto !== null && remoto !== configuracao.remoto) {
      throw new ErroLeis(
        'sincronizacao',
        `O clone local aponta para ${remoto}, não para ${configuracao.remoto}.`,
        'Use o mesmo LEIS_REMOTO do clone, ou apague a pasta de LEIS_CLONE e o índice para clonar de novo.',
      );
    }
  } else {
    deps.log('info', 'clonando o acervo (clone parcial, sem blobs)', { remoto: configuracao.remoto, escopo });
    await deps.git.clonar();
  }
  deps.log('info', 'buscando o ramo no remoto com git fetch');
  const alvo = await deps.git.buscar();
  // O checkout sai das árvores do commit buscado, antes de os arquivos chegarem. Assim o git
  // nunca baixa o conteúdo de uma pasta sem normas, nem no sync em que ela aparece no acervo,
  // e uma pasta nova de normas já está no checkout quando o sync lê os arquivos dela.
  const pastas = await pastasDoCheckoutNoCommit(deps.git, escopo, alvo);
  deps.log('info', 'ajustando o sparse-checkout', { escopo, pastas: pastas.length });
  await deps.git.definirPastas(pastas);
  deps.log('info', 'avançando o clone com git merge --ff-only');
  await deps.git.avancar(alvo);
  const head = await deps.git.head();

  const { gravador } = deps;
  const versao = gravador.lerMeta('versao_esquema');
  const remotoAnterior = gravador.lerMeta('remoto');
  const reiniciar = (versao !== null && versao !== String(VERSAO_ESQUEMA)) || (remotoAnterior !== null && remotoAnterior !== configuracao.remoto);
  if (reiniciar) {
    deps.log('aviso', 'o índice vem de outra versão ou de outro remoto: refazendo do zero');
    gravador.limpar();
  }
  const anterior = gravador.lerMeta('commit');
  const escopoAnterior = lerLista(gravador.lerMeta('escopo'));
  const corpoAnterior = lerLista(gravador.lerMeta('corpo'));
  const historicoValido = anterior !== null && (await deps.git.temCommit(anterior));

  const removidasEscopo = gravador.removerForaDoEscopo(pathspecs, ancestraisDe(pathspecs));
  // Antes de reler entradas, o índice declara só o que continua completo. Se o sync parar
  // no meio, a próxima rodada relê o que faltou, mesmo que o escopo volte ao valor antigo.
  const escopoGarantido = intersecao(escopo, escopoAnterior);
  const corpoGarantido = intersecao(corpo, corpoAnterior);
  if (!mesmoConjunto(escopoGarantido, escopoAnterior) || !mesmoConjunto(corpoGarantido, corpoAnterior)) {
    gravador.gravarMeta({ escopo: JSON.stringify(escopoGarantido), corpo: JSON.stringify(corpoGarantido) });
  }
  const completo = !historicoValido;
  const novasEntradas = completo
    ? escopo
    : escopo.filter((entrada) => !escopoCobre(escopoAnterior, pathspecDaEntrada(entrada)));
  // Quando LEIS_CORPO muda, reindexa só as entradas cujo corpo entra ou sai do índice.
  const corpoMudou =
    completo || mesmoConjunto(corpo, corpoAnterior)
      ? []
      : [
          ...corpo.filter((entrada) => !escopoCobre(corpoAnterior, pathspecDaEntrada(entrada))),
          ...corpoAnterior.filter(
            (entrada) => !escopoCobre(corpo, pathspecDaEntrada(entrada)) && escopoCobre(escopo, pathspecDaEntrada(entrada)),
          ),
        ];
  const reescanear = normalizarEscopo([...novasEntradas, ...corpoMudou]);
  const reescaneadas = reescanear.map(pathspecDaEntrada);
  const restantes = pathspecs.filter((spec) => !reescaneadas.some((r) => spec === r || spec.startsWith(`${r}/`)));

  const processador = new ProcessadorDeLotes(deps, corpo);
  if (historicoValido && anterior !== head && restantes.length > 0) {
    deps.log('info', 'lendo as mudanças desde o commit indexado', { de: anterior, ate: head });
    for await (const mudanca of deps.git.mudancas(anterior, head, [...restantes, ...ancestraisDe(restantes)])) {
      await processador.acrescentar(mudanca);
    }
    await processador.descarregar();
  }
  for (const spec of reescaneadas) {
    deps.log('info', 'indexando entrada do escopo', { entrada: spec });
    // Marca e varre: o que estava no índice e não está mais na árvore sai do índice.
    const acima = ancestraisDe([spec]);
    const sobras = new Set([...gravador.caminhosSob(spec), ...gravador.falhasSob(spec), ...acima.flatMap((caminho) => gravador.falhasSob(caminho))]);
    for await (const caminho of deps.git.arquivos(head, [spec, ...acima])) {
      sobras.delete(caminho);
      await processador.acrescentar({ status: 'A', caminho });
    }
    for (const caminho of sobras) await processador.acrescentar({ status: 'D', caminho });
    await processador.descarregar();
  }

  let autorias = 0;
  if (reescaneadas.length > 0) {
    deps.log('info', 'lendo a autoria da base inicial no histórico', { pathspecs: reescaneadas });
    autorias += await lerAutoria(deps, reescaneadas, null);
  }
  if (historicoValido && anterior !== head && restantes.length > 0) {
    autorias += await lerAutoria(deps, restantes, `${anterior}..${head}`);
  }
  const religadas = gravador.religarAutoria();
  gravador.podarSignatarios();

  const pendencias = await sincronizarPendencias(deps, head);

  const houveMudanca =
    processador.gravadas + processador.removidas + removidasEscopo + autorias > 0 || anterior !== head || pendencias.mudou;
  const sincronizadoEm = deps.relogio.agora().toISOString();
  gravador.gravarMeta({
    versao_esquema: String(VERSAO_ESQUEMA),
    commit: head,
    sincronizado_em: sincronizadoEm,
    escopo: JSON.stringify(escopo),
    corpo: JSON.stringify(corpo),
    remoto: configuracao.remoto,
    ramo: configuracao.ramo,
    ...pendencias.meta,
  });
  if (reescaneadas.length > 0) gravador.otimizar();
  const modo: RelatorioSync['modo'] = !houveMudanca ? 'sem_mudancas' : completo ? 'completo' : 'incremental';
  return {
    commit: head,
    anterior,
    modo,
    gravadas: processador.gravadas,
    removidas: processador.removidas + removidasEscopo,
    ignoradas: processador.ignoradas,
    autorias,
    religadas,
    escopo,
    corpo,
    normas: gravador.contarNormas(),
    pendencias: pendencias.total,
    duracao_ms: deps.relogio.agora().getTime() - inicio,
  };
}
