import { limparMarkdown, textoOuNulo, truncar } from './texto.js';
import type { Cabecalho } from './tipos.js';

export interface AnaliseDocumento {
  titulo: string | null;
  ocr: boolean;
  semTexto: boolean;
  temTachado: boolean;
  ementaDerivada: string | null;
}

/** Avisos que os conversores do acervo põem logo depois do título. */
export const AVISO_OCR = /^>\s*Texto obtido por OCR\b/;
export const AVISO_SEM_TEXTO = /^>\s*A fonte oficial não disponibiliza o texto/;
const TACHADO = /~~|<(?:del|s|strike)\b/i;
export const ROTULO_ARTIGO_SIMPLES = /^(?:Art(?:igo)?\s*\.?\s*(?:l(?=\d))?\d|Artigo\s+[úÚuU]nico)/;
const LINHAS_DE_AVISO = 12;

const VERBO_EMENTA =
  /^(?:disp[õo]e|institui|autoriza|altera|cria|denomina|declara|concede|estabelece|regulamenta|fixa|aprova|revoga|acrescenta|abre|d[áa]\s|disciplina|define|torna|inclui|modifica|prorroga|ratifica|reconhece|homologa|nomeia|considera|dispensa|pro[íi]be|garante|assegura|determina|organiza|reorganiza|extingue|transforma|oficializa|consolida|promulga|convoca|suspende|delega|atualiza|reajusta|desafeta|afeta|permite|veda|obriga|implanta|implementa|ab[ou]le|confere|outorga|amplia|reduz|isenta|cancela)/i;
const VERBO_NO_MEIO =
  /[.;:]\s+((?:disp[õo]e|institui|autoriza|altera|cria|denomina|declara|concede|estabelece|regulamenta|fixa|aprova|revoga|acrescenta|abre|disciplina|define)\b[\s\S]*)$/i;
const EPIGRAFE =
  /^(?:LEI|DECRETO|RESOLU[ÇC][ÃA]O|PORTARIA|EMENDA|DELIBERA[ÇC][ÃA]O|INSTRU[ÇC][ÃA]O|ATO|MEDIDA|S[ÚU]MULA|PROVIMENTO|CIRCULAR)\b/;
const PREAMBULO =
  /^(?:(?:o|a|os|as)\s+)?(?:prefeit|president|governador|c[âa]mara|mesa|vice|secret[áa]ri|diretor|procurador|ministr|conselho|assembl)|^fa[çc]o saber|^eu,/i;

/** Verdadeiro quando o cabeçalho marca o texto como OCR. */
export function ocrNoCabecalho(cabecalho: Cabecalho): boolean {
  const ocr = cabecalho['ocr'];
  if (ocr === true) return true;
  if (typeof ocr === 'string') {
    const valor = ocr.trim().toLowerCase();
    if (valor !== '' && !['false', 'nao', 'não', 'no', '0'].includes(valor)) return true;
  }
  return textoOuNulo(cabecalho['ocr_motor']) !== null;
}

/** Ementa tirada do texto antes do primeiro artigo, para normas sem `ementa` no cabeçalho. */
export function derivarEmenta(linhas: readonly string[]): string | null {
  const candidatas: string[] = [];
  let depoisDoTitulo = false;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === '') continue;
    if (!depoisDoTitulo && linha.startsWith('# ')) {
      depoisDoTitulo = true;
      continue;
    }
    if (/^[>#|<]/.test(linha)) continue;
    const limpa = limparMarkdown(linha);
    if (limpa === '') continue;
    if (ROTULO_ARTIGO_SIMPLES.test(limpa)) break;
    candidatas.push(limpa);
    if (candidatas.length >= 8) break;
  }
  for (const candidata of candidatas) {
    if (VERBO_EMENTA.test(candidata)) return truncar(candidata, 300);
    const meio = VERBO_NO_MEIO.exec(candidata);
    if (meio?.[1]) return truncar(meio[1].trim(), 300);
  }
  const outra = candidatas.find((c) => c.length >= 20 && !EPIGRAFE.test(c) && !PREAMBULO.test(c));
  return outra ? truncar(outra, 300) : null;
}

/** Lê do corpo o título, os sinais de OCR e de texto ausente, o tachado e a ementa derivada. */
export function analisarDocumento(cabecalho: Cabecalho, corpo: string): AnaliseDocumento {
  const linhas = corpo.split('\n');
  let titulo: string | null = null;
  let ocr = ocrNoCabecalho(cabecalho);
  let semTexto = false;
  let temConteudo = false;
  let vistas = 0;
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (linha === '') continue;
    if (titulo === null && vistas === 0 && linha.startsWith('# ')) {
      titulo = linha.slice(2).trim();
      continue;
    }
    vistas += 1;
    if (vistas <= LINHAS_DE_AVISO && AVISO_OCR.test(linha)) {
      ocr = true;
      continue;
    }
    if (vistas <= LINHAS_DE_AVISO && AVISO_SEM_TEXTO.test(linha)) {
      semTexto = true;
      continue;
    }
    if (!linha.startsWith('>')) temConteudo = true;
    if (temConteudo && vistas > LINHAS_DE_AVISO) break;
  }
  if (!temConteudo) semTexto = true;
  const ementaCabecalho = textoOuNulo(cabecalho['ementa']);
  return {
    titulo,
    ocr,
    semTexto,
    temTachado: TACHADO.test(corpo),
    ementaDerivada: ementaCabecalho === null && !semTexto ? derivarEmenta(linhas) : null,
  };
}
