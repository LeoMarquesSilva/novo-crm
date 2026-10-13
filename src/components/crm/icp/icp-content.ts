/**
 * Textos, fontes de dados e escalas de cor da tela do ICP. Cores sempre por token do
 * Design System V2 (classes Tailwind ligadas às custom properties de `globals.css`),
 * nunca hex local.
 */
import type {
  IcpData,
  IcpEmployeeBand,
  IcpGroupRow,
  IcpSizeBucketKey,
  IcpTierKey,
} from "@/modules/icp/domain/compute";

export type IcpTabKey = "resumo" | "carteira" | "clientes" | "marketing" | "comercial";

export const ICP_TABS: { key: IcpTabKey; label: string }[] = [
  { key: "resumo", label: "Resumo" },
  { key: "carteira", label: "Carteira" },
  { key: "clientes", label: "Clientes" },
  { key: "marketing", label: "Marketing" },
  { key: "comercial", label: "Pauta comercial" },
];

/* ------------------------------------------------------------- Fontes de dados */

export type SourceSystem = "vios" | "rf" | "orq" | "li";

export type Source = { system: SourceSystem; detail: string };

/**
 * Selo de cada sistema de origem. É uma categoria (não um estado), por isso usa tons
 * categóricos discretos: violeta (VIOS), azul informativo (Receita), neutro (LinkedIn)
 * e verde (ORQESTRAI, o sistema de marketing de onde vêm NPS, GA4 e WhatsApp).
 */
export const SOURCE_SYSTEM: Record<SourceSystem, { label: string; className: string }> = {
  vios: { label: "VIOS", className: "border-violet-border bg-violet-bg text-violet-text" },
  orq: { label: "ORQESTRAI", className: "border-success-border bg-success-bg text-success-text" },
  rf: { label: "Receita Federal", className: "border-info-border bg-info-bg text-info-text" },
  li: { label: "LinkedIn", className: "border-neutral-200 bg-neutral-100 text-neutral-700" },
};

/** Fontes usadas em cada bloco da tela. */
export const SRC = {
  honorarios: { system: "vios", detail: "financeiro · honorários pagos" },
  atraso: { system: "vios", detail: "financeiro · parcelas vencidas em aberto" },
  timesheet: { system: "vios", detail: "timesheet · horas apontadas por área" },
  custoPessoal: { system: "vios", detail: "financeiro · custo de pessoal por departamento" },
  departamento: { system: "vios", detail: "financeiro · departamento que faturou" },
  processos: { system: "vios", detail: "processos · primeiro processo do grupo" },
  pessoas: { system: "vios", detail: "cadastro de pessoas · cidade, UF e tipo" },
  cnae: { system: "rf", detail: "CNAE da empresa de referência do grupo" },
  sede: { system: "rf", detail: "município da sede da empresa de referência" },
  socios: { system: "rf", detail: "quadro de sócios e administradores (QSA)" },
  colaboradores: { system: "li", detail: "página da empresa · faixa de colaboradores e logo" },
  npsCargo: { system: "orq", detail: "NPS · cargo de quem respondeu" },
  npsNota: { system: "orq", detail: "NPS · nota de recomendação" },
  npsTemas: { system: "orq", detail: "NPS · classificação dos comentários" },
  linkedin: { system: "orq", detail: "LinkedIn Insights · última importação" },
  ga4: { system: "orq", detail: "Analytics (GA4) · sessões por cidade" },
  whatsapp: { system: "orq", detail: "WhatsApp · origem e etapa das conversas" },
  planoContas: { system: "vios", detail: "financeiro · plano de contas dos honorários pagos" },
} satisfies Record<string, Source>;

/* ---------------------------------------------------------------- Textos de ajuda */

/** Textos dos tooltips (principalmente da aba Carteira). */
export const INFO = {
  receita:
    "Honorários pagos pelo grupo nos últimos 12 meses, pelo financeiro do VIOS (plano de contas de honorários). Só conta quem está cadastrado como cliente; reembolsos e outras receitas ficam de fora.",
  icp: "Grupos que pagaram R$ 60 mil ou mais em 12 meses (faixas A e B). São o modelo de cliente ideal.",
  margemEscritorio:
    "Receita menos custo de entrega, dividido pela receita, somando todos os grupos que tiveram horas apontadas. Não desconta sócios, estrutura e despesas gerais.",
  atraso:
    "Parcelas de honorários vencidas e não pagas até hoje, de qualquer data de vencimento, dos grupos que pagaram algo em 12 meses.",
  faixa: "Grupos classificados pelo honorário pago em 12 meses: A a partir de R$ 200 mil, B de R$ 60 a 200 mil, C de R$ 20 a 60 mil e D abaixo de R$ 20 mil.",
  participacao: "Barra cinza: quanto a faixa representa do número de grupos pagantes. Barra azul: quanto representa da receita.",
  ticket: "Receita de 12 meses dividida por 12 e pelo número de clientes.",
  areasPorCliente: "Média de departamentos que faturaram honorários para o grupo nos últimos 12 meses.",
  tipoContrato:
    "Plano de contas de cada honorário pago em 12 meses, com o nome igual ao do SIOE (HONORÁRIOS MENSAIS, ADVOCATÍCIOS, SPOT, DE ÊXITO, DE SUCUMBÊNCIA, DE MANUTENÇÃO, POR HORA TRABALHADA). Nada é reagrupado.",
  gruposPorPlano:
    "Grupos que pagaram algum honorário neste plano em 12 meses. Um grupo que paga em mais de um plano conta em cada um deles.",
  ticketPorPlano: "Receita do plano em 12 meses dividida por 12 e pelo número de grupos que pagaram nele.",
  atrasoReceita: "Valor vencido em aberto hoje dividido pela receita de 12 meses. Acima de 50% fica em âmbar.",
  horas: "Horas lançadas no timesheet do VIOS para o grupo nos últimos 12 meses.",
  receitaHora: "Receita de 12 meses dividida pelas horas apontadas. Mostra quanto rendeu cada hora de trabalho.",
  custo:
    "Horas apontadas × custo por hora da área. O custo por hora é a folha da área (remuneração, encargos e benefícios) dividida por todas as horas que a área apontou.",
  margem:
    "(Receita − custo de entrega) ÷ receita. É margem de contribuição: não desconta sócios, estrutura e despesas gerais. Abaixo de 30% fica em âmbar.",
  segmento: "Macrossetor do CNAE principal da empresa de referência do grupo, no cadastro da Receita Federal.",
  receitaArea: "Honorários pagos em 12 meses, separados pelo departamento que emitiu a cobrança.",
  amplitude: "Receita mediana de 12 meses dos grupos, separados pelo número de áreas que faturaram para eles.",
  entrada:
    "Área do primeiro processo cadastrado para o grupo no VIOS. Mostra a ordem de cadastro, não necessariamente a primeira contratação.",
  porteFaixa:
    "Como os grupos da faixa se dividem por número de colaboradores (a faixa que a empresa declara na página do LinkedIn), do azul claro (até 10) ao escuro (mais de 500). Só conta quem tem porte.",
  colaboradores:
    "Faixa de colaboradores que a empresa declara na página do LinkedIn. \"?\" marca correspondência média entre o grupo e a página; \"no LinkedIn\" aparece quando a página não declara a faixa e mostra só quantas pessoas se vinculam a ela.",
  mediaMensal: "Honorários pagos em 12 meses divididos por 12.",
  atrasoGrupo: "Parcelas de honorários vencidas e não pagas hoje, de qualquer data de vencimento.",
  areasGrupo: "Áreas que faturaram honorários para o grupo nos últimos 12 meses, da que mais faturou para a que menos.",
} as const;

/* -------------------------------------------------------------- Escalas de cor */

/**
 * Faixas de honorário: escala sequencial de um só azul (A mais escuro), sobre os tokens
 * `interactive-*` — a mesma família da série 1 da paleta de gráficos (§7.4).
 */
export const TIER_TONE: Record<IcpTierKey, { fill: string; onFill: string; badge: string }> = {
  A: { fill: "bg-interactive-800", onFill: "text-white", badge: "bg-interactive-800 text-white" },
  B: { fill: "bg-interactive-600", onFill: "text-white", badge: "bg-interactive-600 text-white" },
  C: { fill: "bg-interactive-300", onFill: "text-brand-navy", badge: "bg-interactive-300 text-brand-navy" },
  D: { fill: "bg-interactive-100", onFill: "text-brand-navy", badge: "bg-interactive-100 text-interactive-800" },
};

/** Faixas de colaboradores: claro = empresa pequena, escuro = grande. */
export const EMPLOYEE_BAND_TONE: Record<IcpEmployeeBand, string> = {
  ate10: "bg-interactive-100",
  "11a50": "bg-interactive-300",
  "51a200": "bg-interactive-500",
  "201a500": "bg-interactive-700",
  "500mais": "bg-brand-navy",
};

/** Atraso sobre a receita: verde até 15%, âmbar até 50%, vermelho acima. */
export function overdueTone(ratioValue: number): string {
  if (ratioValue >= 0.5) return "bg-chart-5";
  if (ratioValue >= 0.15) return "bg-chart-3";
  return "bg-chart-2";
}

/* ------------------------------------------------------ Recorte por faixa (escopo) */

export type TierScope = "all" | "core" | IcpTierKey;

export const TIER_SCOPES: { key: TierScope; label: string }[] = [
  { key: "all", label: "Escritório todo" },
  { key: "core", label: "ICP (A e B)" },
  { key: "A", label: "Faixa A" },
  { key: "B", label: "Faixa B" },
  { key: "C", label: "Faixa C" },
  { key: "D", label: "Faixa D" },
];

export function groupsInScope(data: IcpData, scope: TierScope): IcpGroupRow[] {
  if (scope === "all") return data.groups;
  if (scope === "core") return data.groups.filter((g) => g.tier === "A" || g.tier === "B");
  return data.groups.filter((g) => g.tier === scope);
}

/** "que pagaram honorários em 12 meses", "do ICP (...)" ou "da faixa C (...)". */
export function scopeText(data: IcpData, scope: TierScope): string {
  if (scope === "all") return "que pagaram honorários em 12 meses";
  if (scope === "core") return "do ICP (faixas A e B: pagaram R$ 60 mil ou mais em 12 meses)";
  const tier = data.tiers.find((t) => t.key === scope);
  return `da faixa ${scope} (${tier?.range ?? ""} em 12 meses)`;
}

/* ------------------------------------------------- Maiores, médios e menores */

export const SIZE_BUCKET_LABEL: Record<IcpSizeBucketKey, { title: string; hint: string }> = {
  maiores: { title: "10 maiores", hint: "maior receita em 12 meses" },
  medios: { title: "10 médios", hint: "em volta da mediana" },
  menores: { title: "10 menores", hint: "menor receita entre os pagantes" },
};
