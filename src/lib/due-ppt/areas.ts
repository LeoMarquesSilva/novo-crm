/** Áreas que aparecem na apresentação da DUE, na ordem do modelo. */

export const DUE_AREA_IDS = ["reestruturacao", "rec_cred", "civel", "trabalhista", "tributario"] as const;
export type DueAreaId = (typeof DUE_AREA_IDS)[number];

export type DueAreaDef = {
  id: DueAreaId;
  /** Nome no CRM (`areas_analise`, tarefas DUE). */
  crmAreaKey: string;
  /** Título dos slides da área. */
  titulo: string;
  /** Rótulo curto (cards, conclusão). */
  rotulo: string;
  /** Trecho da metodologia: "a esfera cível" / "as esferas cível e ...". */
  esfera: string;
  /** Sufixo dos marcadores SLIDE_<x>_DIVISOR / SLIDE_<x>_PAINEL no modelo. */
  slideKey: string;
  /** Grupo do card no slide "Áreas Envolvidas". */
  cardGroup: string;
  /** Prefixo da linha no slide de conclusão (null = não é passivo). */
  conclusaoKey: "REEST" | "TRIB" | "TRAB" | "CIVEL" | null;
  /** Tem relatório em planilha (Reestruturação é preenchida no formulário). */
  usaPlanilha: boolean;
  variantes: Array<"painel" | "detalhe" | "lista">;
};

export const DUE_AREAS: Record<DueAreaId, DueAreaDef> = {
  reestruturacao: {
    id: "reestruturacao",
    crmAreaKey: "Reestruturação e Insolvência",
    titulo: "Reestruturação",
    rotulo: "Reestruturação",
    esfera: "de insolvência",
    slideKey: "REEST",
    cardGroup: "AREA_REESTRUTURACAO",
    conclusaoKey: "REEST",
    usaPlanilha: false,
    variantes: ["painel"],
  },
  rec_cred: {
    id: "rec_cred",
    crmAreaKey: "Recuperação de Créditos",
    titulo: "Recuperação de Crédito",
    rotulo: "Recuperação de Créditos",
    esfera: "de recuperação de créditos",
    slideKey: "RC",
    cardGroup: "AREA_REC_CRED",
    conclusaoKey: null,
    usaPlanilha: true,
    variantes: ["painel", "detalhe", "lista"],
  },
  civel: {
    id: "civel",
    crmAreaKey: "Cível",
    titulo: "Cível",
    rotulo: "Cível",
    esfera: "cível",
    slideKey: "CIVEL",
    cardGroup: "AREA_CIVEL",
    conclusaoKey: "CIVEL",
    usaPlanilha: true,
    variantes: ["painel", "detalhe", "lista"],
  },
  trabalhista: {
    id: "trabalhista",
    crmAreaKey: "Trabalhista",
    titulo: "Trabalhista",
    rotulo: "Trabalhista",
    esfera: "trabalhista",
    slideKey: "TRAB",
    cardGroup: "AREA_TRABALHISTA",
    conclusaoKey: "TRAB",
    usaPlanilha: true,
    variantes: ["painel", "detalhe", "lista"],
  },
  tributario: {
    id: "tributario",
    crmAreaKey: "Tributário",
    titulo: "Tributário",
    rotulo: "Tributário",
    esfera: "tributária",
    slideKey: "TRIB",
    cardGroup: "AREA_TRIBUTARIO",
    conclusaoKey: "TRIB",
    usaPlanilha: true,
    variantes: ["painel"],
  },
};

/** Até quantos processos o padrão é um slide por processo (sem gráficos). */
export const LIMITE_DETALHE = 5;

export function normalizarTexto(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Área da DUE a partir da chave do CRM (`areas_analise` / `due_area_tasks.area_key`). */
export function dueAreaFromCrmKey(key: string): DueAreaId | null {
  const n = normalizarTexto(key);
  if (n.startsWith("reestrutura") || n.includes("insolv")) return "reestruturacao";
  if (n.includes("recupera") && n.includes("credito")) return "rec_cred";
  if (n.startsWith("civel")) return "civel";
  if (n.startsWith("trabalh")) return "trabalhista";
  if (n.startsWith("tribut")) return "tributario";
  return null;
}

/** Esferas da metodologia: "a esfera trabalhista" / "as esferas cível e trabalhista". */
export function metodologiaEsferas(areas: DueAreaId[]): string {
  const esferas = DUE_AREA_IDS.filter((a) => areas.includes(a)).map((a) => DUE_AREAS[a].esfera);
  if (!esferas.length) return "as esferas analisadas";
  if (esferas.length === 1) return `a esfera ${esferas[0]}`;
  return `as esferas ${esferas.slice(0, -1).join(", ")} e ${esferas[esferas.length - 1]}`;
}
