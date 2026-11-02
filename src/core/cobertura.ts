import { truncar } from './texto.js';

export interface LinhaProgresso {
  secao: string;
  situacao: string;
  tipoDeNorma: string;
  tem: number | null;
  meta: number | null;
  pastas: string[];
  fonte: string;
}

export interface Progresso {
  geradoEm: string | null;
  resumo: string | null;
  pendencias: string | null;
  linhas: LinhaProgresso[];
}

export interface LinhaCoberturaUf {
  uf: string;
  normas: number | null;
  viaOcr: number | null;
  semTexto: string;
}

export interface Cobertura {
  federal: Array<{ tipo: string; normas: number | null }>;
  ufs: LinhaCoberturaUf[];
  total: string | null;
}

export interface ResumoFalhas {
  arquivo: string;
  total: number;
  motivos: Array<{ motivo: string; quantidade: number }>;
  exemplos: string[];
}

function celulas(linha: string): string[] | null {
  const limpa = linha.trim();
  if (!limpa.startsWith('|') || !limpa.endsWith('|')) return null;
  return limpa
    .slice(1, -1)
    .split('|')
    .map((celula) => celula.trim());
}

function separador(partes: readonly string[]): boolean {
  return partes.every((parte) => /^:?-{2,}:?$/.test(parte) || parte === '');
}

/** "16.784" -> 16784; "~1.200" -> 1200; "desconhecida" -> null. */
export function numeroDaTabela(texto: string): number | null {
  const limpo = texto.replace(/[~≈\s]/g, '').replace(/\./g, '').replace(/\*/g, '');
  return /^\d+$/.test(limpo) ? Number(limpo) : null;
}

/** Lê as tabelas de PROGRESSO.md (situação, tipo de norma, tem, meta, pasta, fonte). */
export function lerProgresso(markdown: string): Progresso {
  const linhas: LinhaProgresso[] = [];
  let secao = '';
  let geradoEm: string | null = null;
  let resumo: string | null = null;
  let pendencias: string | null = null;
  for (const linha of markdown.split('\n')) {
    const titulo = /^#{2,3}\s+(.+)$/.exec(linha.trim());
    if (titulo) {
      secao = (titulo[1] ?? '').trim();
      continue;
    }
    if (geradoEm === null) {
      const gerado = /^Gerado em ([^.]+)\./.exec(linha.trim());
      if (gerado) geradoEm = (gerado[1] ?? '').trim();
    }
    if (resumo === null && /^\*\*[\d.]+ documentos/.test(linha.trim())) resumo = linha.trim().replace(/\*\*/g, '');
    if (pendencias === null && /^Há [\d.]+ pendências/.test(linha.trim())) {
      pendencias = linha.trim().replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    }
    const partes = celulas(linha);
    if (partes === null || partes.length !== 6 || separador(partes)) continue;
    const [situacao = '', tipoDeNorma = '', tem = '', meta = '', pasta = '', fonte = ''] = partes;
    if (tipoDeNorma === 'Tipo de norma') continue;
    const pastas = [...pasta.matchAll(/`([^`]+)`/g)].map((encontrado) => encontrado[1] ?? '').filter((p) => p !== '');
    if (pastas.length === 0) continue;
    linhas.push({ secao, situacao, tipoDeNorma, tem: numeroDaTabela(tem), meta: numeroDaTabela(meta), pastas, fonte });
  }
  return { geradoEm, resumo, pendencias, linhas };
}

/** Lê as tabelas de COBERTURA.md (federal por tipo e estados). */
export function lerCobertura(markdown: string): Cobertura {
  const federal: Cobertura['federal'] = [];
  const ufs: LinhaCoberturaUf[] = [];
  let total: string | null = null;
  let secao = '';
  for (const linha of markdown.split('\n')) {
    const titulo = /^##\s+(.+)$/.exec(linha.trim());
    if (titulo) {
      secao = (titulo[1] ?? '').trim();
      continue;
    }
    const totalLinha = /^\*\*Total: (.+)\*\*$/.exec(linha.trim());
    if (totalLinha) total = (totalLinha[1] ?? '').trim();
    const partes = celulas(linha);
    if (partes === null || separador(partes)) continue;
    if (secao === 'Federal' && partes.length === 2 && partes[0] !== 'Tipo') {
      federal.push({ tipo: partes[0] ?? '', normas: numeroDaTabela(partes[1] ?? '') });
    }
    if (partes.length >= 9 && /^[A-Z]{2}$/.test(partes[0] ?? '')) {
      ufs.push({
        uf: partes[0] ?? '',
        normas: numeroDaTabela(partes[1] ?? ''),
        viaOcr: numeroDaTabela(partes[7] ?? ''),
        semTexto: partes[8] ?? '',
      });
    }
  }
  return { federal, ufs, total };
}

/**
 * Compara um padrão de pasta do PROGRESSO.md ("estaduais/*\/decretos") com um recorte
 * ("estaduais/SP"). Casa quando os dois concordam no trecho em comum.
 */
export function padraoTocaRecorte(padrao: string, recorte: string): boolean {
  if (recorte === '') return true;
  const p = padrao.split('/');
  const r = recorte.split('/');
  const comum = Math.min(p.length, r.length);
  for (let i = 0; i < comum; i += 1) {
    const segmento = p[i];
    if (segmento !== '*' && segmento !== r[i]) return false;
  }
  return true;
}

/** Linhas do PROGRESSO.md que tratam de um recorte. */
export function progressoDoRecorte(progresso: Progresso, recorte: string): LinhaProgresso[] {
  return progresso.linhas.filter((linha) => linha.pastas.some((pasta) => padraoTocaRecorte(pasta, recorte)));
}

/** Resume um arquivo _falhas.jsonl: total, motivos mais comuns e exemplos. */
export function resumirFalhas(arquivo: string, conteudo: string): ResumoFalhas {
  const contagem = new Map<string, number>();
  const exemplos: string[] = [];
  let total = 0;
  for (const linha of conteudo.split('\n')) {
    if (linha.trim() === '') continue;
    total += 1;
    let registro: unknown;
    try {
      registro = JSON.parse(linha);
    } catch {
      contagem.set('linha ilegível', (contagem.get('linha ilegível') ?? 0) + 1);
      continue;
    }
    const campos = typeof registro === 'object' && registro !== null ? (registro as Record<string, unknown>) : {};
    const motivoBruto = campos['motivo'] ?? campos['status'] ?? 'sem motivo';
    const motivo = typeof motivoBruto === 'string' ? truncar(motivoBruto, 80) : 'sem motivo';
    contagem.set(motivo, (contagem.get(motivo) ?? 0) + 1);
    const nome = campos['norma'] ?? campos['titulo'] ?? campos['url'];
    if (exemplos.length < 3 && typeof nome === 'string') exemplos.push(truncar(nome, 120));
  }
  const motivos = [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([motivo, quantidade]) => ({ motivo, quantidade }));
  return { arquivo, total, motivos, exemplos };
}
