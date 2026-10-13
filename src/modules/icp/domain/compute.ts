/**
 * Cálculo do ICP (perfil de cliente ideal) a partir dos dados do VIOS/SIOE e
 * dos sinais de marketing do ORQESTRAI. Funções puras: o servidor busca as
 * linhas e este módulo agrega tudo que a tela mostra.
 */

import { cnaeSector, pickReferenceCompany, type IcpCnpjRecord } from "@/modules/icp/domain/cnpj";
import { HONORARIOS_MENSAIS, comparePlans, planLabel } from "@/modules/icp/domain/plano-contas";

/** Empresa do grupo no cadastro do VIOS com o cadastro da Receita já consultado. */
export interface IcpCompanyRow {
  grupo: string;
  categoria: string | null;
  record: IcpCnpjRecord;
}

export interface IcpRevenueItem {
  grupo: string;
  departamento: string | null;
  planoContas: string | null;
  valor: number;
  dataPagamento: string;
}

export interface IcpProcessRow {
  grupo: string;
  area: string | null;
  dataCadastro: string | null;
}

export interface IcpPessoaRow {
  grupo: string;
  tipo: string | null;
  uf: string | null;
  cidade: string | null;
  categoria: string | null;
}

/** Parcela de honorário vencida e em aberto, com o departamento que faturou. */
export interface IcpOverdueRow {
  grupo: string;
  departamento: string | null;
  valor: number;
}

/** Horas apontadas no timesheet, já somadas por grupo e área. */
export interface IcpHoursRow {
  grupo: string;
  area: string | null;
  horas: number;
}

/** Custo de pessoal pago no período, por departamento. */
export interface IcpPersonnelCostRow {
  departamento: string | null;
  valor: number;
}

export interface IcpNpsRow {
  cargo: string | null;
  recommend: number | null;
}

export interface IcpNpsTheme {
  id: string;
  polarity: "strength" | "pain" | string;
}

export interface IcpDemographicRow {
  reportType: string;
  dimension: string;
  label: string;
  value: number;
}

export interface IcpCitySessions {
  city: string;
  sessions: number;
}

export interface IcpWhatsappLead {
  leadSource: string | null;
  pipelineStage: string | null;
}

/** Porte e logo do grupo, pela página da empresa no LinkedIn (tabela icp_group_profiles). */
export interface IcpGroupProfile {
  grupo: string;
  /** Faixa de colaboradores declarada na página ("51-200"). */
  employeeRange: string | null;
  employeeMin: number | null;
  /** Pessoas no LinkedIn que se vinculam à empresa. */
  linkedinMembers: number | null;
  linkedinUrl: string | null;
  linkedinName: string | null;
  website: string | null;
  logoUrl: string | null;
  confidence: "alta" | "media" | "baixa" | null;
}

export interface IcpInput {
  now: Date;
  revenue: IcpRevenueItem[];
  /** Pagadores que não são clientes no VIOS (parte contrária, fornecedor, sem cadastro), já fora de revenue. */
  excludedPayers: { count: number; revenue: number };
  processes: IcpProcessRow[];
  pessoas: IcpPessoaRow[];
  overdue: IcpOverdueRow[];
  hours: IcpHoursRow[];
  personnelCost: IcpPersonnelCostRow[];
  companies: IcpCompanyRow[];
  nps: IcpNpsRow[];
  npsThemes: IcpNpsTheme[];
  linkedin: IcpDemographicRow[];
  ga4Cities: IcpCitySessions[];
  whatsapp: IcpWhatsappLead[];
  profiles: IcpGroupProfile[];
}

export type IcpTierKey = "A" | "B" | "C" | "D";

export interface IcpTier {
  key: IcpTierKey;
  label: string;
  range: string;
  groups: number;
  groupShare: number;
  revenue: number;
  revenueShare: number;
  avgMonthly: number;
  avgAreas: number;
  retainerShare: number;
  overdueRatio: number;
}

/** Números de um grupo dentro de uma área (ou "Outros"). */
export interface IcpAreaMetrics {
  revenue: number;
  hours: number;
  cost: number;
  overdue: number;
}

export interface IcpGroupRow {
  grupo: string;
  tier: IcpTierKey;
  revenue12m: number;
  monthly: number;
  /** Tipo de contrato: receita de 12 meses por plano de contas do SIOE (nome de planLabel). */
  revenueByPlan: Record<string, number>;
  /** O mesmo por área que faturou (chaves de byArea), para o filtro de área da Carteira. */
  revenueByPlanByArea: Record<string, Record<string, number>>;
  hasRetainer: boolean;
  areas: string[];
  entryArea: string | null;
  firstProcess: string | null;
  activeSince2025: boolean;
  /** Descrição do CNAE principal da empresa de referência (Receita). */
  sector: string | null;
  /** Macrossetor do CNAE. */
  sectorBucket: string | null;
  /** Porte da Receita (ME, EPP ou Demais) da empresa de referência. */
  registeredSize: string | null;
  /** Faixa de colaboradores (EMPLOYEE_BANDS) pela página do LinkedIn. */
  employeeBand: IcpEmployeeBand | null;
  /** Página do LinkedIn, faixa declarada e logo; null quando o grupo não foi pesquisado. */
  profile: IcpGroupProfile | null;
  city: string | null;
  uf: string | null;
  /** "receita" = sede da empresa de referência; "vios" = cidade mais frequente no cadastro. */
  regionSource: "receita" | "vios" | null;
  cnpjs: number;
  referenceCompany: IcpReferenceCompany | null;
  decisionMakers: { nome: string; qualificacao: string | null }[];
  hasLegalEntity: boolean;
  /** Tipo de cliente no cadastro do VIOS: só pessoa física, com empresa, ou sem cadastro. */
  clientType: "pessoa_fisica" | "pessoa_juridica" | null;
  overdue: number;
  hours12m: number;
  deliveryCost: number;
  byArea: Record<string, IcpAreaMetrics>;
}

export interface IcpReferenceCompany {
  cnpj: string;
  razaoSocial: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  porte: string | null;
  capitalSocial: number | null;
  situacao: string | null;
}

/** Custo por hora de uma área: custo de pessoal do departamento ÷ horas apontadas. */
export interface IcpHourlyCost {
  area: string;
  cost: number;
  hours: number;
  rate: number;
  /** true quando a área não tem custo próprio e usa a média do escritório. */
  fallback: boolean;
}

export interface IcpCount {
  label: string;
  count: number;
}

export interface IcpShare {
  label: string;
  value: number;
  share: number;
}

export interface IcpData {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  totals: {
    revenue12m: number;
    payingGroups: number;
    groupsFor50: number;
    groupsFor80: number;
    coreGroups: number;
    coreRevenueShare: number;
    breadthMultiplier: number | null;
    /** Receita de quem não é cliente, deixada fora do ICP. */
    excludedPayers: number;
    excludedRevenue: number;
  };
  tiers: IcpTier[];
  delivery: {
    personnelCost: number;
    hours: number;
    clientHours: number;
    officeRate: number;
    rates: IcpHourlyCost[];
  };
  areaRevenue: IcpShare[];
  breadth: { label: string; groups: number; median: number }[];
  entry: { core: IcpCount[]; rest: IcpCount[]; coreViaInsolvency: number };
  newCore: { total: number; viaInsolvency: number };
  sectors: { core: IcpShare[]; coverageShare: number; coreKnown: number };
  sizes: {
    /** Porte da Receita dos grupos A e B, sempre na ordem ME, EPP, Demais. */
    coreRegistered: IcpCount[];
    coreRegisteredKnown: number;
  };
  cnpjCoverage: {
    groups: number;
    withCompany: number;
    companies: number;
    coreGroups: number;
    coreWithCompany: number;
    /** Data da consulta mais recente ao cadastro da Receita. */
    fetchedAt: string | null;
  };
  /** Região dos grupos A e B (os painéis da tela recalculam por faixa a partir de `groups`). */
  geography: {
    coreInterior: number;
    coreCapital: number;
    coreOtherUf: number;
    coreUnknown: number;
    coreFromReceita: number;
  };
  legalEntityShare: { core: number; rest: number };
  retainer: { core: number; rest: number; revenueShare: number };
  decisor: {
    responses: number;
    nps: number | null;
    ownerResponses: number;
    ownerAvg: number | null;
    financeOrDirector: number;
    byRole: IcpCount[];
    strengths: IcpCount[];
    pains: IcpCount[];
    /** Quadro de sócios da Receita: grupos A e B com sócio que administra a empresa. */
    coreWithAdmins: number;
    adminRoles: IcpCount[];
  };
  marketing: {
    linkedinFollowers: number;
    linkedinLegalShare: number | null;
    linkedinIndustryShare: number | null;
    linkedinDecisionShare: number | null;
    ga4TopCities: IcpCitySessions[];
    whatsappTotal: number;
    whatsappBySource: IcpCount[];
    whatsappUnqualified: number;
  };
  groups: IcpGroupRow[];
}

/** Áreas de prática (os demais departamentos de receita entram como "Outros"). */
export const PRACTICE_AREAS = [
  "Insolvência",
  "Cível",
  "Trabalhista",
  "Contratos",
  "Distressed Deals",
  "Recuperação de Crédito",
  "Tributário",
  "Operações Legais",
] as const;

export const CORE_MIN_REVENUE = 60_000;

const TIER_DEFS: { key: IcpTierKey; label: string; range: string; min: number; max: number }[] = [
  { key: "A", label: "Faixa A", range: "R$ 200 mil+", min: 200_000, max: Infinity },
  { key: "B", label: "Faixa B", range: "R$ 60 a 200 mil", min: CORE_MIN_REVENUE, max: 200_000 },
  { key: "C", label: "Faixa C", range: "R$ 20 a 60 mil", min: 20_000, max: CORE_MIN_REVENUE },
  { key: "D", label: "Faixa D", range: "até R$ 20 mil", min: 0, max: 20_000 },
];

const ROLE_TOKENS: { label: string; test: RegExp }[] = [
  { label: "Sócio ou proprietário", test: /s[óo]ci|propriet|dono/i },
  { label: "Diretoria", test: /diretor|ceo|presidente/i },
  { label: "Financeiro", test: /financ/i },
  { label: "Jurídico ou compliance", test: /jur[íi]d|compliance/i },
  { label: "RH", test: /recursos humanos|\brh\b/i },
];

const THEME_LABELS: Record<string, string> = {
  relacionamento: "Relacionamento",
  tecnica: "Competência técnica",
  agilidade: "Agilidade",
  organizacao: "Organização",
  disponibilidade: "Disponibilidade",
  comunicacao: "Comunicação",
  inovacao: "Inovação",
  engajamento_socio: "Presença dos sócios",
  outro: "Outros",
};

export function normalizePracticeArea(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/insolv/i.test(value)) return "Insolvência";
  if (/special situations|distressed/i.test(value)) return "Distressed Deals";
  const match = PRACTICE_AREAS.find((a) => a.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function countBy<T>(items: T[], key: (item: T) => string | null): IcpCount[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function mode(values: (string | null)[]): string | null {
  const counts = countBy(values, (v) => v);
  return counts[0]?.label ?? null;
}

function cleanCity(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || /n[ãa]o informad/i.test(v)) return null;
  return v;
}

/** Porte da Receita, que segue a receita bruta anual declarada (LC 123/2006). */
export const REGISTERED_SIZES = ["ME", "EPP", "Demais"] as const;
export const REGISTERED_SIZE_RANGE: Record<(typeof REGISTERED_SIZES)[number], string> = {
  ME: "até R$ 360 mil por ano",
  EPP: "até R$ 4,8 mi por ano",
  Demais: "não enquadrada como ME ou EPP; em geral, acima de R$ 4,8 mi por ano",
};

/**
 * Porte por colaboradores, nas faixas do LinkedIn agrupadas: até 10, 11 a 50, 51 a 200,
 * 201 a 500 e mais de 500.
 */
export const EMPLOYEE_BANDS = [
  { key: "ate10", label: "Até 10", min: 0, max: 10 },
  { key: "11a50", label: "11 a 50", min: 11, max: 50 },
  { key: "51a200", label: "51 a 200", min: 51, max: 200 },
  { key: "201a500", label: "201 a 500", min: 201, max: 500 },
  { key: "500mais", label: "Mais de 500", min: 501, max: null },
] as const;

export type IcpEmployeeBand = (typeof EMPLOYEE_BANDS)[number]["key"];

export function employeeBandOf(employeeMin: number | null | undefined): IcpEmployeeBand | null {
  if (employeeMin == null) return null;
  return [...EMPLOYEE_BANDS].reverse().find((b) => employeeMin >= b.min)!.key;
}

/**
 * Menor sequência de faixas vizinhas que reúne pelo menos `coverage` dos grupos com porte
 * (em empate, a que reúne mais grupos). Vira o critério de porte do ICP: "De 51 a 500".
 */
export function typicalEmployeeRange(
  groups: { employeeBand: IcpEmployeeBand | null }[],
  coverage = 0.6
): { label: string; count: number; known: number } | null {
  const counts = EMPLOYEE_BANDS.map((b) => groups.filter((g) => g.employeeBand === b.key).length);
  const known = counts.reduce((acc, c) => acc + c, 0);
  if (known === 0) return null;
  for (let size = 1; size <= counts.length; size++) {
    let best: { start: number; count: number } | null = null;
    for (let start = 0; start + size <= counts.length; start++) {
      const count = counts.slice(start, start + size).reduce((acc, c) => acc + c, 0);
      if (count >= coverage * known && (!best || count > best.count)) best = { start, count };
    }
    if (!best) continue;
    const first = EMPLOYEE_BANDS[best.start];
    const last = EMPLOYEE_BANDS[best.start + size - 1];
    const label =
      last.max == null
        ? first.min === 0
          ? "Qualquer porte"
          : `Mais de ${first.min - 1}`
        : first.min === 0
          ? `Até ${last.max}`
          : `De ${first.min} a ${last.max}`;
    return { label, count: best.count, known };
  }
  return null;
}

function normalizeRegisteredSize(porte: string | null | undefined): string | null {
  if (!porte) return null;
  if (/micro|^me\b|\(me\)/i.test(porte)) return "ME";
  if (/pequeno|epp/i.test(porte)) return "EPP";
  if (/demais/i.test(porte)) return "Demais";
  return null;
}

const LOWERCASE_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "SAO JOSE DO RIO PRETO" → "Sao Jose do Rio Preto" (a Receita grava município em caixa alta). */
function titleCase(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWERCASE_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const hasAccent = (value: string) => /[̀-ͯ]/.test(value.normalize("NFD"));

/** Chave de comparação de cidade: sem acento, sem caixa e sem espaços extras. */
function foldCity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const DECISION_ROLE = /administra|diretor|presidente|gerente|titular/i;

/**
 * Sócios com poder de administração (quadro de sócios da Receita), começando pela
 * empresa de referência. Indica quem assina pela empresa, não necessariamente quem
 * contrata o jurídico.
 */
function decisionMakers(
  companies: IcpCnpjRecord[],
  ref: IcpCnpjRecord | null
): { nome: string; qualificacao: string | null }[] {
  const ordered = ref ? [ref, ...companies.filter((c) => c.cnpj !== ref.cnpj)] : companies;
  const seen = new Set<string>();
  const result: { nome: string; qualificacao: string | null }[] = [];
  for (const company of ordered) {
    for (const s of company.socios ?? []) {
      const key = s.nome.toUpperCase();
      if (!DECISION_ROLE.test(s.qualificacao ?? "") || seen.has(key)) continue;
      seen.add(key);
      result.push({ nome: titleCase(s.nome) ?? s.nome, qualificacao: s.qualificacao });
      if (result.length >= 4) return result;
    }
  }
  return result;
}

function isClientCategory(categoria: string | null): boolean {
  const c = (categoria ?? "").toLowerCase();
  if (!c) return true;
  return c.includes("cliente");
}

function isLegalEntityType(tipo: string | null): boolean {
  return /jur/i.test(tipo ?? "");
}

export interface IcpPlanRow {
  /** Nome do plano de contas como no SIOE ("HONORÁRIOS MENSAIS"). */
  plan: string;
  /** Grupos que pagaram algum honorário neste plano (um grupo pode estar em vários). */
  groups: number;
  groupShare: number;
  revenue: number;
  revenueShare: number;
  /** Receita do plano em 12 meses ÷ 12 ÷ grupos que pagaram nele. */
  avgMonthly: number;
}

export interface IcpPlanSummary {
  /** Um plano por linha, na ordem do SIOE (HONORARIO_PLANS); só planos com receita. */
  rows: IcpPlanRow[];
  groups: number;
  revenue: number;
}

/** Tipo de contrato: grupos e receita por plano de contas do SIOE, para uma lista de grupos. */
export function planSummary(list: Pick<IcpGroupRow, "revenue12m" | "revenueByPlan">[]): IcpPlanSummary {
  const revenue = list.reduce((acc, g) => acc + g.revenue12m, 0);
  const byPlan = new Map<string, { groups: number; revenue: number }>();
  for (const g of list) {
    for (const [plan, value] of Object.entries(g.revenueByPlan)) {
      if (value <= 0) continue;
      const entry = byPlan.get(plan) ?? { groups: 0, revenue: 0 };
      entry.groups += 1;
      entry.revenue += value;
      byPlan.set(plan, entry);
    }
  }
  const rows = [...byPlan.entries()]
    .sort(([a], [b]) => comparePlans(a, b))
    .map(([plan, e]) => ({
      plan,
      groups: e.groups,
      groupShare: list.length ? e.groups / list.length : 0,
      revenue: e.revenue,
      revenueShare: revenue > 0 ? e.revenue / revenue : 0,
      avgMonthly: e.groups ? e.revenue / e.groups / 12 : 0,
    }));
  return { rows, groups: list.length, revenue };
}

/** Receita por segmento, em fração da receita dos grupos que têm segmento. */
export function sectorShares(list: { sectorBucket: string | null; revenue12m: number }[]): IcpShare[] {
  const total = list.reduce((acc, g) => acc + g.revenue12m, 0);
  const bySector = new Map<string, number>();
  for (const g of list) {
    if (g.sectorBucket) bySector.set(g.sectorBucket, (bySector.get(g.sectorBucket) ?? 0) + g.revenue12m);
  }
  return [...bySector.entries()]
    .map(([label, value]) => ({ label, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

function isIndividualType(tipo: string | null): boolean {
  return /f[íi]s/i.test(tipo ?? "");
}

const MIN_REVENUE_ITEM = 1;

function windowStartFor(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function tierFor(revenue: number): IcpTierKey {
  return (TIER_DEFS.find((t) => revenue >= t.min && revenue < t.max)?.key ?? "D") as IcpTierKey;
}

export function computeIcp(input: IcpInput): IcpData {
  const windowStart = isoDate(windowStartFor(input.now));
  const windowEnd = isoDate(input.now);
  const inWindow = (d: string) => d >= windowStart && d <= windowEnd;

  // Receita por grupo nos últimos 12 meses.
  const byGroup = new Map<
    string,
    {
      revenue: number;
      plans: Map<string, number>;
      areas: Map<string, number>;
      plansByArea: Map<string, Map<string, number>>;
    }
  >();
  const areaTotals = new Map<string, number>();
  const areaKey = (raw: string | null) => normalizePracticeArea(raw) ?? "Outros";
  for (const item of input.revenue) {
    // Itens abaixo de R$ 1 são ajustes de centavos no financeiro, não honorário pago.
    if (!item.grupo || item.valor < MIN_REVENUE_ITEM || !inWindow(item.dataPagamento)) continue;
    const entry = byGroup.get(item.grupo) ?? { revenue: 0, plans: new Map(), areas: new Map(), plansByArea: new Map() };
    entry.revenue += item.valor;
    const plan = planLabel(item.planoContas);
    entry.plans.set(plan, (entry.plans.get(plan) ?? 0) + item.valor);
    const area = areaKey(item.departamento);
    entry.areas.set(area, (entry.areas.get(area) ?? 0) + item.valor);
    const areaPlans = entry.plansByArea.get(area) ?? new Map<string, number>();
    areaPlans.set(plan, (areaPlans.get(plan) ?? 0) + item.valor);
    entry.plansByArea.set(area, areaPlans);
    areaTotals.set(area, (areaTotals.get(area) ?? 0) + item.valor);
    byGroup.set(item.grupo, entry);
  }

  // Custo de entrega: cada área tem um custo por hora (custo de pessoal do departamento
  // ÷ todas as horas apontadas na área, inclusive trabalho interno), aplicado às horas
  // que a área apontou para cada cliente. Áreas sem custo próprio usam a média do escritório.
  const costByArea = new Map<string, number>();
  for (const c of input.personnelCost) {
    const area = normalizePracticeArea(c.departamento);
    if (!area || c.valor <= 0) continue;
    costByArea.set(area, (costByArea.get(area) ?? 0) + c.valor);
  }
  const hoursByArea = new Map<string, number>();
  const hoursByGroup = new Map<string, Map<string, number>>();
  for (const h of input.hours) {
    if (h.horas <= 0) continue;
    const area = areaKey(h.area);
    hoursByArea.set(area, (hoursByArea.get(area) ?? 0) + h.horas);
    if (!h.grupo) continue;
    const perArea = hoursByGroup.get(h.grupo) ?? new Map<string, number>();
    perArea.set(area, (perArea.get(area) ?? 0) + h.horas);
    hoursByGroup.set(h.grupo, perArea);
  }
  const totalHours = [...hoursByArea.values()].reduce((acc, v) => acc + v, 0);
  const allocatedCost = [...costByArea.entries()]
    .filter(([area]) => hoursByArea.has(area))
    .reduce((acc, [, v]) => acc + v, 0);
  const allocatedHours = [...hoursByArea.entries()]
    .filter(([area]) => costByArea.has(area))
    .reduce((acc, [, v]) => acc + v, 0);
  const officeRate = allocatedHours > 0 ? allocatedCost / allocatedHours : 0;
  const rates: IcpHourlyCost[] = [...hoursByArea.entries()]
    .map(([area, hours]) => {
      const cost = costByArea.get(area);
      return cost
        ? { area, cost, hours, rate: cost / hours, fallback: false }
        : { area, cost: hours * officeRate, hours, rate: officeRate, fallback: true };
    })
    .sort((a, b) => (a.area === "Outros" ? 1 : b.area === "Outros" ? -1 : b.hours - a.hours));
  const rateOf = new Map(rates.map((r) => [r.area, r.rate]));

  const overdueByGroup = new Map<string, Map<string, number>>();
  for (const o of input.overdue) {
    if (!o.grupo || o.valor <= 0) continue;
    const perArea = overdueByGroup.get(o.grupo) ?? new Map<string, number>();
    const area = areaKey(o.departamento);
    perArea.set(area, (perArea.get(area) ?? 0) + o.valor);
    overdueByGroup.set(o.grupo, perArea);
  }

  function areaMetrics(grupo: string, revenueByArea: Map<string, number>): Record<string, IcpAreaMetrics> {
    const hours = hoursByGroup.get(grupo) ?? new Map<string, number>();
    const overdue = overdueByGroup.get(grupo) ?? new Map<string, number>();
    const result: Record<string, IcpAreaMetrics> = {};
    for (const area of new Set([...revenueByArea.keys(), ...hours.keys(), ...overdue.keys()])) {
      const h = hours.get(area) ?? 0;
      result[area] = {
        revenue: revenueByArea.get(area) ?? 0,
        hours: h,
        cost: h * (rateOf.get(area) ?? officeRate),
        overdue: overdue.get(area) ?? 0,
      };
    }
    return result;
  }

  // Primeiro processo do grupo = porta de entrada.
  const firstProcess = new Map<string, { area: string | null; date: string }>();
  for (const p of input.processes) {
    if (!p.grupo || !p.dataCadastro) continue;
    const current = firstProcess.get(p.grupo);
    if (!current || p.dataCadastro < current.date) {
      firstProcess.set(p.grupo, { area: p.area, date: p.dataCadastro });
    }
  }

  const pessoasByGroup = new Map<string, IcpPessoaRow[]>();
  for (const p of input.pessoas) {
    if (!p.grupo || !isClientCategory(p.categoria)) continue;
    const list = pessoasByGroup.get(p.grupo) ?? [];
    list.push(p);
    pessoasByGroup.set(p.grupo, list);
  }

  // A Receita grava o município sem acento ("SAO PAULO"); usa a grafia do cadastro do
  // VIOS quando a cidade aparece lá, para não separar "Sao Paulo" de "São Paulo".
  const viosCitySpelling = new Map<string, string>();
  for (const p of input.pessoas) {
    const city = cleanCity(p.cidade);
    if (!city) continue;
    const known = viosCitySpelling.get(foldCity(city));
    // Prefere a grafia com acento quando o VIOS tem as duas.
    if (!known || (!hasAccent(known) && hasAccent(city))) viosCitySpelling.set(foldCity(city), titleCase(city)!);
  }
  const accentedCity = (municipio: string | null | undefined) => {
    const city = cleanCity(titleCase(municipio));
    return city ? (viosCitySpelling.get(foldCity(city)) ?? city) : null;
  };

  const profileByGroup = new Map(input.profiles.map((p) => [p.grupo, p]));

  // Empresas do grupo com cadastro da Receita (uma por CNPJ).
  const companiesByGroup = new Map<string, Map<string, IcpCnpjRecord>>();
  for (const c of input.companies) {
    if (!c.grupo || !isClientCategory(c.categoria)) continue;
    const list = companiesByGroup.get(c.grupo) ?? new Map<string, IcpCnpjRecord>();
    list.set(c.record.cnpj, c.record);
    companiesByGroup.set(c.grupo, list);
  }

  const groups: IcpGroupRow[] = [...byGroup.entries()]
    .map(([grupo, g]) => {
      const pessoas = pessoasByGroup.get(grupo) ?? [];
      const first = firstProcess.get(grupo);
      const companies = [...(companiesByGroup.get(grupo)?.values() ?? [])];
      const ref = pickReferenceCompany(companies);
      const refSector = cnaeSector(ref?.cnae_principal);
      const refCity = accentedCity(ref?.municipio);
      const byArea = areaMetrics(grupo, g.areas);
      const metrics = Object.values(byArea);
      const viosCity = mode(pessoas.map((p) => cleanCity(p.cidade)));
      const viosUf = mode(pessoas.map((p) => (p.uf ?? "").trim().toUpperCase() || null));
      return {
        grupo,
        tier: tierFor(g.revenue),
        revenue12m: g.revenue,
        monthly: g.revenue / 12,
        revenueByPlan: Object.fromEntries(g.plans),
        revenueByPlanByArea: Object.fromEntries(
          [...g.plansByArea.entries()].map(([area, plans]) => [area, Object.fromEntries(plans)]),
        ),
        hasRetainer: g.plans.has(HONORARIOS_MENSAIS),
        areas: [...g.areas.entries()]
          .filter(([a]) => a !== "Outros")
          .sort((a, b) => b[1] - a[1])
          .map(([a]) => a),
        entryArea: first?.area ?? null,
        firstProcess: first?.date ?? null,
        activeSince2025: Boolean(first?.date && first.date >= "2025-01-01"),
        sector: refSector ? ref!.cnae_descricao : null,
        sectorBucket: refSector,
        registeredSize: normalizeRegisteredSize(ref?.porte),
        employeeBand: employeeBandOf(profileByGroup.get(grupo)?.employeeMin),
        profile: profileByGroup.get(grupo) ?? null,
        city: ref?.uf ? refCity : viosCity,
        uf: ref?.uf ?? viosUf,
        regionSource: ref?.uf ? "receita" : viosUf || viosCity ? "vios" : null,
        cnpjs: companies.filter((c) => c.status === "ok").length,
        referenceCompany: ref
          ? {
              cnpj: ref.cnpj,
              razaoSocial: ref.razao_social,
              cnae: ref.cnae_principal,
              cnaeDescricao: ref.cnae_descricao,
              porte: ref.porte,
              capitalSocial: ref.capital_social,
              situacao: ref.situacao_cadastral,
            }
          : null,
        decisionMakers: decisionMakers(companies, ref),
        hasLegalEntity: pessoas.some((p) => isLegalEntityType(p.tipo)),
        clientType: !pessoas.length
          ? null
          : pessoas.every((p) => isIndividualType(p.tipo))
            ? "pessoa_fisica"
            : "pessoa_juridica",
        overdue: metrics.reduce((acc, m) => acc + m.overdue, 0),
        hours12m: metrics.reduce((acc, m) => acc + m.hours, 0),
        deliveryCost: metrics.reduce((acc, m) => acc + m.cost, 0),
        byArea,
      } satisfies IcpGroupRow;
    })
    .sort((a, b) => b.revenue12m - a.revenue12m);

  const total = groups.reduce((acc, g) => acc + g.revenue12m, 0);
  const share = (v: number, base = total) => (base > 0 ? v / base : 0);

  let running = 0;
  let groupsFor50 = 0;
  let groupsFor80 = 0;
  groups.forEach((g, i) => {
    running += g.revenue12m;
    if (!groupsFor50 && running >= total * 0.5) groupsFor50 = i + 1;
    if (!groupsFor80 && running >= total * 0.8) groupsFor80 = i + 1;
  });

  const tiers: IcpTier[] = TIER_DEFS.map((def) => {
    const list = groups.filter((g) => g.tier === def.key);
    const revenue = list.reduce((acc, g) => acc + g.revenue12m, 0);
    const overdue = list.reduce((acc, g) => acc + g.overdue, 0);
    return {
      key: def.key,
      label: def.label,
      range: def.range,
      groups: list.length,
      groupShare: share(list.length, groups.length),
      revenue,
      revenueShare: share(revenue),
      avgMonthly: list.length ? revenue / list.length / 12 : 0,
      avgAreas: list.length ? list.reduce((acc, g) => acc + g.areas.length, 0) / list.length : 0,
      retainerShare: list.length ? list.filter((g) => g.hasRetainer).length / list.length : 0,
      overdueRatio: revenue > 0 ? overdue / revenue : 0,
    };
  });

  const core = groups.filter((g) => g.tier === "A" || g.tier === "B");
  const rest = groups.filter((g) => g.tier === "C" || g.tier === "D");
  const coreRevenue = core.reduce((acc, g) => acc + g.revenue12m, 0);

  const areaRevenue: IcpShare[] = [...areaTotals.entries()]
    .map(([label, value]) => ({ label, value, share: share(value) }))
    .sort((a, b) => (a.label === "Outros" ? 1 : b.label === "Outros" ? -1 : b.value - a.value));

  const breadthBuckets: { label: string; test: (n: number) => boolean }[] = [
    { label: "1 área", test: (n) => n <= 1 },
    { label: "2 áreas", test: (n) => n === 2 },
    { label: "3 ou mais", test: (n) => n >= 3 },
  ];
  const breadth = breadthBuckets.map((b) => {
    const list = groups.filter((g) => b.test(g.areas.length));
    return { label: b.label, groups: list.length, median: median(list.map((g) => g.revenue12m)) };
  });
  const breadthMultiplier =
    breadth[0].median > 0 ? breadth[2].median / breadth[0].median : null;

  const entryLabel = (g: IcpGroupRow) => {
    if (!g.entryArea) return null;
    return /insolv/i.test(g.entryArea) ? "Insolvência" : normalizePracticeArea(g.entryArea) ?? g.entryArea;
  };
  const coreEntry = countBy(core, entryLabel);
  const newCoreList = core.filter((g) => g.activeSince2025);

  const coreWithSector = core.filter((g) => g.sectorBucket);
  const coreSectorRevenue = coreWithSector.reduce((acc, g) => acc + g.revenue12m, 0);
  const sectorMap = new Map<string, number>();
  for (const g of coreWithSector) {
    sectorMap.set(g.sectorBucket!, (sectorMap.get(g.sectorBucket!) ?? 0) + g.revenue12m);
  }
  const allWithSector = groups.filter((g) => g.sectorBucket);

  const isCapital = (g: IcpGroupRow) => /^s[ãa]o paulo$/i.test(g.city ?? "");

  // NPS e decisor.
  const npsScores = input.nps.filter((r) => typeof r.recommend === "number") as {
    cargo: string | null;
    recommend: number;
  }[];
  const promoters = npsScores.filter((r) => r.recommend >= 9).length;
  const detractors = npsScores.filter((r) => r.recommend <= 6).length;
  const roleOf = (cargo: string | null) =>
    ROLE_TOKENS.find((r) => r.test.test(cargo ?? ""))?.label ?? (cargo ? "Outros cargos" : "Não informado");
  const owners = npsScores.filter((r) => roleOf(r.cargo) === "Sócio ou proprietário");
  const themeCount = (polarity: string) =>
    countBy(
      input.npsThemes.filter((t) => t.polarity === polarity),
      (t) => THEME_LABELS[t.id] ?? t.id
    );

  // Marketing.
  const liFollowers = input.linkedin.filter((r) => r.reportType === "followers");
  const sumWhere = (rows: IcpDemographicRow[], dimension: string, test?: RegExp) =>
    rows
      .filter((r) => r.dimension === dimension && (!test || test.test(r.label)))
      .reduce((acc, r) => acc + r.value, 0);
  const industryTotal = sumWhere(liFollowers, "industry");
  const seniorityTotal = sumWhere(liFollowers, "seniority");
  const ratio = (v: number, base: number) => (base > 0 ? v / base : null);

  const whatsappSources = countBy(input.whatsapp, (w) => {
    if (w.leadSource === "meta_ads") return "Meta Ads";
    if (w.leadSource === "site_whatsapp") return "Botão do site";
    return "Sem origem";
  });

  return {
    generatedAt: input.now.toISOString(),
    windowStart,
    windowEnd,
    totals: {
      revenue12m: total,
      payingGroups: groups.length,
      groupsFor50,
      groupsFor80,
      coreGroups: core.length,
      coreRevenueShare: share(coreRevenue),
      breadthMultiplier,
      excludedPayers: input.excludedPayers.count,
      excludedRevenue: input.excludedPayers.revenue,
    },
    tiers,
    delivery: {
      personnelCost: allocatedCost,
      hours: totalHours,
      clientHours: groups.reduce((acc, g) => acc + g.hours12m, 0),
      officeRate,
      rates,
    },
    areaRevenue,
    breadth,
    entry: {
      core: coreEntry,
      rest: countBy(rest, entryLabel),
      coreViaInsolvency: coreEntry.find((e) => e.label === "Insolvência")?.count ?? 0,
    },
    newCore: {
      total: newCoreList.length,
      viaInsolvency: newCoreList.filter((g) => /insolv/i.test(g.entryArea ?? "")).length,
    },
    sectors: {
      core: [...sectorMap.entries()]
        .map(([label, value]) => ({ label, value, share: share(value, coreSectorRevenue) }))
        .sort((a, b) => b.value - a.value),
      coverageShare: share(allWithSector.reduce((acc, g) => acc + g.revenue12m, 0)),
      coreKnown: coreWithSector.length,
    },
    sizes: {
      coreRegistered: REGISTERED_SIZES.map((label) => ({
        label,
        count: core.filter((g) => g.registeredSize === label).length,
      })),
      coreRegisteredKnown: core.filter((g) => g.registeredSize).length,
    },
    cnpjCoverage: {
      groups: groups.length,
      withCompany: groups.filter((g) => g.referenceCompany).length,
      companies: groups.reduce((acc, g) => acc + g.cnpjs, 0),
      coreGroups: core.length,
      coreWithCompany: core.filter((g) => g.referenceCompany).length,
      fetchedAt:
        input.companies.reduce<string | null>(
          (latest, c) => (c.record.status === "ok" && (!latest || c.record.fetched_at > latest) ? c.record.fetched_at : latest),
          null
        ),
    },
    geography: {
      coreInterior: core.filter((g) => g.uf === "SP" && g.city && !isCapital(g)).length,
      coreCapital: core.filter((g) => g.uf === "SP" && isCapital(g)).length,
      coreOtherUf: core.filter((g) => g.uf && g.uf !== "SP").length,
      coreUnknown: core.filter((g) => !g.uf || (g.uf === "SP" && !g.city)).length,
      coreFromReceita: core.filter((g) => g.regionSource === "receita").length,
    },
    legalEntityShare: {
      core: core.length ? core.filter((g) => g.hasLegalEntity).length / core.length : 0,
      rest: rest.length ? rest.filter((g) => g.hasLegalEntity).length / rest.length : 0,
    },
    retainer: {
      core: core.length ? core.filter((g) => g.hasRetainer).length / core.length : 0,
      rest: rest.length ? rest.filter((g) => g.hasRetainer).length / rest.length : 0,
      revenueShare: share(groups.filter((g) => g.hasRetainer).reduce((acc, g) => acc + g.revenue12m, 0)),
    },
    decisor: {
      responses: npsScores.length,
      nps: npsScores.length ? Math.round(((promoters - detractors) / npsScores.length) * 100) : null,
      ownerResponses: owners.length,
      ownerAvg: owners.length ? owners.reduce((acc, r) => acc + r.recommend, 0) / owners.length : null,
      financeOrDirector: npsScores.filter((r) => ["Diretoria", "Financeiro"].includes(roleOf(r.cargo))).length,
      byRole: countBy(npsScores, (r) => roleOf(r.cargo)),
      strengths: themeCount("strength"),
      pains: themeCount("pain"),
      coreWithAdmins: core.filter((g) => g.decisionMakers.length > 0).length,
      adminRoles: countBy(
        core.flatMap((g) => g.decisionMakers),
        (d) => d.qualificacao
      ),
    },
    marketing: {
      linkedinFollowers: industryTotal,
      linkedinLegalShare: ratio(sumWhere(liFollowers, "industry", /jur[íi]d|advoc|justi/i), industryTotal),
      linkedinIndustryShare: ratio(
        sumWhere(liFollowers, "industry", /fabrica|ind[úu]stria|manufatura|metal|pl[áa]stic|t[êe]xt|aliment|m[áa]quin/i),
        industryTotal
      ),
      linkedinDecisionShare: ratio(
        sumWhere(liFollowers, "seniority", /dirigente|propriet|vice|diretor/i),
        seniorityTotal
      ),
      ga4TopCities: [...input.ga4Cities].sort((a, b) => b.sessions - a.sessions).slice(0, 6),
      whatsappTotal: input.whatsapp.length,
      whatsappBySource: whatsappSources,
      whatsappUnqualified: input.whatsapp.filter(
        (w) => !w.pipelineStage || w.pipelineStage === "lead_recebido"
      ).length,
    },
    groups,
  };
}

export type IcpSizeBucketKey = "maiores" | "medios" | "menores";

export interface IcpSizedGroup extends IcpAreaMetrics {
  grupo: string;
  group: IcpGroupRow;
  /** Receita por plano de contas no mesmo recorte de `revenue` (escritório ou área). */
  revenueByPlan: Record<string, number>;
}

export interface IcpSizeBucket {
  key: IcpSizeBucketKey;
  groups: IcpSizedGroup[];
  revenue: number;
  hours: number;
  cost: number;
  overdue: number;
  /** Posições no ranking por receita (1 = quem mais pagou); 0 quando o bloco está vazio. */
  rankFrom: number;
  rankTo: number;
  /** Quantos grupos pagantes entraram no ranking e a receita do grupo do meio. */
  rankedTotal: number;
  medianRevenue: number;
}

/** Números do grupo no escritório todo (area null) ou em uma área. */
export function groupMetrics(group: IcpGroupRow, area: string | null): IcpAreaMetrics {
  if (area) return group.byArea[area] ?? { revenue: 0, hours: 0, cost: 0, overdue: 0 };
  return {
    revenue: group.revenue12m,
    hours: group.hours12m,
    cost: group.deliveryCost,
    overdue: group.overdue,
  };
}

/** Receita do grupo por plano de contas no escritório todo (area null) ou em uma área. */
export function groupPlans(group: IcpGroupRow, area: string | null): Record<string, number> {
  return area ? (group.revenueByPlanByArea[area] ?? {}) : group.revenueByPlan;
}

/** Todos os grupos pagantes (no escritório ou na área), da maior para a menor receita. */
export function rankedGroups(groups: IcpGroupRow[], area: string | null): IcpSizedGroup[] {
  return groups
    .map((group) => ({
      grupo: group.grupo,
      group,
      ...groupMetrics(group, area),
      revenueByPlan: groupPlans(group, area),
    }))
    .filter((g) => g.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * Separa os grupos pagantes (no escritório ou na área) em maiores, médios e menores
 * pela receita de 12 meses. Os médios são os que ficam em volta da mediana; com poucos
 * grupos, os três blocos nunca repetem o mesmo grupo.
 */
export function sizeBuckets(groups: IcpGroupRow[], area: string | null, size = 10): IcpSizeBucket[] {
  const ranked = rankedGroups(groups, area);

  const top = ranked.slice(0, size);
  const bottom = ranked.slice(Math.max(top.length, ranked.length - size));
  const between = ranked.slice(top.length, ranked.length - bottom.length);
  const center = Math.floor(ranked.length / 2) - top.length;
  const start = Math.min(Math.max(0, center - Math.floor(size / 2)), Math.max(0, between.length - size));
  const middle = between.slice(start, start + size);
  const medianRevenue = ranked.length ? ranked[Math.floor(ranked.length / 2)].revenue : 0;

  const bucket = (key: IcpSizeBucketKey, list: IcpSizedGroup[], firstIndex: number): IcpSizeBucket => ({
    key,
    groups: list,
    revenue: list.reduce((acc, g) => acc + g.revenue, 0),
    hours: list.reduce((acc, g) => acc + g.hours, 0),
    cost: list.reduce((acc, g) => acc + g.cost, 0),
    overdue: list.reduce((acc, g) => acc + g.overdue, 0),
    rankFrom: list.length ? firstIndex + 1 : 0,
    rankTo: list.length ? firstIndex + list.length : 0,
    rankedTotal: ranked.length,
    medianRevenue,
  });
  return [
    bucket("maiores", top, 0),
    bucket("medios", middle, top.length + start),
    bucket("menores", bottom, ranked.length - bottom.length),
  ];
}
