/**
 * Contrato do modelo de apresentação: slides que o gerador procura (shape com
 * nome SLIDE_*) e conferência de um modelo novo antes de ativá-lo.
 */
import { PptxPackage, slideMarker } from "./pptx/package";
import { TOKEN_RE } from "./pptx/text";
import { NS, desc } from "./pptx/xml";

export const SLIDES_DO_MODELO: Array<{ marcador: string; descricao: string; obrigatorio: boolean }> = [
  { marcador: "SLIDE_CAPA", descricao: "Capa do escritório", obrigatorio: true },
  { marcador: "SLIDE_SOBRE", descricao: "Sobre o escritório", obrigatorio: false },
  { marcador: "SLIDE_RECONHECIMENTOS", descricao: "Reconhecimentos", obrigatorio: false },
  { marcador: "SLIDE_METODOLOGIA", descricao: "Metodologia ({{METODOLOGIA_ESFERAS}})", obrigatorio: true },
  { marcador: "SLIDE_DUE_CAPA", descricao: "Capa da due (razão social, CNPJ, empresas, logo)", obrigatorio: true },
  { marcador: "SLIDE_AREAS", descricao: "Áreas envolvidas (cards AREA_*)", obrigatorio: true },
  { marcador: "SLIDE_REEST_DIVISOR", descricao: "Divisória Reestruturação", obrigatorio: true },
  { marcador: "SLIDE_REEST_RJ", descricao: "Reestruturação | Recuperação judicial", obrigatorio: true },
  { marcador: "SLIDE_REEST_ENDIVIDAMENTO", descricao: "Reestruturação | Composição do endividamento", obrigatorio: true },
  { marcador: "SLIDE_REEST_PAGAMENTO", descricao: "Reestruturação | Forma de pagamento", obrigatorio: true },
  { marcador: "SLIDE_REEST_FORMAS", descricao: "Reestruturação | Formas especiais", obrigatorio: true },
  { marcador: "SLIDE_REEST_MEDIDAS", descricao: "Reestruturação | Principais medidas", obrigatorio: true },
  { marcador: "SLIDE_RC_DIVISOR", descricao: "Divisória Recuperação de Crédito", obrigatorio: true },
  { marcador: "SLIDE_RC_PAINEL", descricao: "Recuperação de Crédito — painel com gráficos", obrigatorio: true },
  { marcador: "SLIDE_DETALHE", descricao: "Um processo por slide (qualquer área)", obrigatorio: true },
  { marcador: "SLIDE_LISTA", descricao: "Lista de processos (tabela)", obrigatorio: true },
  { marcador: "SLIDE_CIVEL_DIVISOR", descricao: "Divisória Cível", obrigatorio: true },
  { marcador: "SLIDE_CIVEL_PAINEL", descricao: "Cível — painel", obrigatorio: true },
  { marcador: "SLIDE_TRAB_DIVISOR", descricao: "Divisória Trabalhista", obrigatorio: true },
  { marcador: "SLIDE_TRAB_PAINEL", descricao: "Trabalhista — painel com gráficos", obrigatorio: true },
  { marcador: "SLIDE_TRIB_DIVISOR", descricao: "Divisória Tributário", obrigatorio: true },
  { marcador: "SLIDE_TRIB_PAINEL", descricao: "Tributário — painel", obrigatorio: true },
  { marcador: "SLIDE_CONCLUSAO", descricao: "Conclusão (passivo por área)", obrigatorio: true },
  { marcador: "SLIDE_CONCLUSAO_CREDITO", descricao: "Conclusão com recuperação de créditos", obrigatorio: true },
  { marcador: "SLIDE_SOCIOS", descricao: "Sócios", obrigatorio: false },
];

export type ConferenciaModelo = {
  slides: number;
  encontrados: string[];
  faltando: string[];
  faltandoOpcionais: string[];
  marcadores: number;
};

/** Lê o .pptx e diz quais slides do contrato estão (ou não) no arquivo. */
export function conferirModelo(bytes: ArrayBuffer | Uint8Array): ConferenciaModelo {
  const pkg = new PptxPackage(bytes);
  const paths = pkg.slidePaths();
  const encontrados = new Set<string>();
  let marcadores = 0;
  for (const p of paths) {
    const doc = pkg.xml(p);
    const m = slideMarker(doc);
    if (m) encontrados.add(m);
    const texto = desc(doc, NS.a, "t")
      .map((t) => t.textContent ?? "")
      .join("");
    marcadores += [...texto.matchAll(TOKEN_RE)].length;
  }
  return {
    slides: paths.length,
    encontrados: [...encontrados],
    faltando: SLIDES_DO_MODELO.filter((s) => s.obrigatorio && !encontrados.has(s.marcador)).map((s) => s.marcador),
    faltandoOpcionais: SLIDES_DO_MODELO.filter((s) => !s.obrigatorio && !encontrados.has(s.marcador)).map((s) => s.marcador),
    marcadores,
  };
}
