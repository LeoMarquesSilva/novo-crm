import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { onlyCnpjDigits } from "@/modules/icp/domain/cnpj";
import {
  computeIcp,
  type IcpData,
  type IcpDemographicRow,
  type IcpGroupProfile,
  type IcpHoursRow,
  type IcpNpsTheme,
  type IcpProcessRow,
  type IcpRevenueItem,
} from "@/modules/icp/domain/compute";
import { loadCnpjRecords, requireSioeClient } from "@/modules/icp/infrastructure/cnpj-sync";
import { orqestraiClient } from "@/lib/orqestrai/client-groups";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Read model do ICP. Fontes:
 * - SIOE (espelho do VIOS): receita, inadimplência, custo de pessoal, processos,
 *   pessoas e timesheet;
 * - ORQESTRAI (marketing, ao vivo): NPS, público do LinkedIn, GA4 e WhatsApp;
 * - CRM: cadastro da Receita (icp_cnpj_cadastro) e perfis do LinkedIn
 *   (icp_group_profiles), com os logos no bucket icp-logos.
 */
export const ICP_CACHE_TAG = "icp";

const PAGE_SIZE = 1000;

/** Lê todas as páginas de uma consulta (o PostgREST devolve no máximo 1.000 linhas). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Versão paralela do fetchAll para tabelas grandes (o timesheet passa de 150 mil linhas
 * em 12 meses): conta as linhas e lê as páginas em lotes. A consulta precisa de ordem estável.
 */
async function fetchAllParallel<T>(
  count: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  build: (from: number, to: number) => PageResult<T>,
  concurrency = 8
): Promise<T[]> {
  const head = await count();
  if (head.error) throw new Error(head.error.message);
  const pages = Math.ceil((head.count ?? 0) / PAGE_SIZE);
  const rows: T[] = [];
  let lastPageFull = pages === 0;
  for (let start = 0; start < pages; start += concurrency) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(concurrency, pages - start) }, (_, i) => {
        const from = (start + i) * PAGE_SIZE;
        return build(from, from + PAGE_SIZE - 1);
      })
    );
    for (const { data, error } of batch) {
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      lastPageFull = (data?.length ?? 0) === PAGE_SIZE;
    }
  }
  // Linhas inseridas depois da contagem.
  if (lastPageFull) {
    const extra = await fetchAll<T>((from, to) => build(pages * PAGE_SIZE + from, pages * PAGE_SIZE + to));
    rows.push(...extra);
  }
  return rows;
}

/**
 * Grupos de conta do financeiro que formam o custo de pessoal das áreas (remuneração
 * fixa e variável, encargos e benefícios). O VIOS grava alguns com acentuação quebrada,
 * por isso o filtro usa prefixos.
 */
const PERSONNEL_COST_FILTER = "grupo_conta.ilike.REMUNERA*,grupo_conta.ilike.ENCARGOS SOCIAIS*,grupo_conta.ilike.BENEF*";

function windowStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** Logos dos grupos, gravados pelo scripts/icp-linkedin-sync.mjs. */
export const ICP_LOGO_BUCKET = "icp-logos";

type ProfileRow = {
  grupo: string;
  status: string;
  match_confidence: string | null;
  linkedin_url: string | null;
  linkedin_name: string | null;
  employee_range: string | null;
  employee_min: number | null;
  linkedin_members: number | null;
  website: string | null;
  logo_path: string | null;
  updated_at: string;
};

const CONFIDENCES = new Set(["alta", "media", "baixa"]);

function toProfile(r: ProfileRow): IcpGroupProfile {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return {
    grupo: r.grupo,
    employeeRange: r.employee_range,
    employeeMin: r.employee_min,
    linkedinMembers: r.linkedin_members,
    linkedinUrl: r.linkedin_url,
    linkedinName: r.linkedin_name,
    website: r.website,
    // O arquivo é regravado no mesmo caminho: a data evita o logo antigo no cache.
    logoUrl: r.logo_path
      ? `${base}/storage/v1/object/public/${ICP_LOGO_BUCKET}/${r.logo_path}?v=${Date.parse(r.updated_at)}`
      : null,
    confidence: CONFIDENCES.has(r.match_confidence ?? "")
      ? (r.match_confidence as IcpGroupProfile["confidence"])
      : null,
  };
}

const toNumber = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

type MarketingRows = {
  npsRows: { id: string; respondent_cargo: string | null; score_recommend: number | null }[];
  insightRows: { id: string; themes: unknown; is_noise: boolean | null }[];
  linkedin: IcpDemographicRow[];
  ga4Rows: { id: string; city: string | null; sessions: number | null }[];
  whatsappRows: { id: string; lead_source: string | null; pipeline_stage: string | null; is_group: boolean | null }[];
};

const EMPTY_MARKETING: MarketingRows = { npsRows: [], insightRows: [], linkedin: [], ga4Rows: [], whatsappRows: [] };

/**
 * Sinais de marketing que continuam no ORQESTRAI. Sem ORQESTRAI configurado, os painéis
 * de marketing ficam vazios e o resto do ICP (VIOS + Receita) segue calculado.
 */
async function loadMarketingRows(orq: SupabaseClient | null, since: string): Promise<MarketingRows> {
  if (!orq) return EMPTY_MARKETING;

  const [npsRows, insightRows, linkedinLatest, ga4Rows, whatsappRows] = await Promise.all([
    fetchAll<MarketingRows["npsRows"][number]>((from, to) =>
      orq.from("nps_responses").select("id, respondent_cargo, score_recommend").order("id").range(from, to)
    ),
    fetchAll<MarketingRows["insightRows"][number]>((from, to) =>
      orq.from("nps_response_insights").select("id, themes, is_noise").order("id").range(from, to)
    ),
    orq
      .from("linkedin_demographic_snapshots")
      .select("captured_at")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchAll<MarketingRows["ga4Rows"][number]>((from, to) =>
      orq
        .from("ga4_location_daily_metrics")
        .select("id, city, sessions")
        .gte("metric_date", since)
        .ilike("country", "Brazil%")
        .order("id")
        .range(from, to)
    ),
    fetchAll<MarketingRows["whatsappRows"][number]>((from, to) =>
      orq
        .from("whatsapp_conversations")
        .select("id, lead_source, pipeline_stage, is_group")
        .order("id")
        .range(from, to)
    ),
  ]);

  let linkedin: IcpDemographicRow[] = [];
  const latestCapture = (linkedinLatest.data as { captured_at: string } | null)?.captured_at;
  if (latestCapture) {
    const rows = await fetchAll<{
      id: string;
      report_type: string;
      dimension: string;
      label: string;
      metric_value: number | null;
    }>((from, to) =>
      orq
        .from("linkedin_demographic_snapshots")
        .select("id, report_type, dimension, label, metric_value")
        .eq("captured_at", latestCapture)
        .order("id")
        .range(from, to)
    );
    linkedin = rows.map((r) => ({
      reportType: r.report_type,
      dimension: r.dimension,
      label: r.label,
      value: toNumber(r.metric_value),
    }));
  }

  return { npsRows, insightRows, linkedin, ga4Rows, whatsappRows };
}

/** Horas, pastas ativas e primeiro processo por grupo, já somados. */
type SioeAggregates = {
  hours: IcpHoursRow[];
  activeFolders: { grupo: string; area: string | null; count: number }[];
  /** O cálculo fica com o mais antigo de cada grupo; a função do SIOE já manda só ele. */
  processes: IcpProcessRow[];
};

type SioeAggregatesJson = {
  horas?: { grupo: string | null; area: string | null; horas: number | string | null }[];
  pastas_ativas?: { grupo: string | null; area: string | null; pastas: number | string | null }[];
  primeiro_processo?: { grupo: string | null; area: string | null; data_cadastro: string | null }[];
};

/**
 * Função `icp_agregados` do SIOE (supabase/sioe/20261016120000_icp_agregados.sql): soma no
 * banco e devolve ~110 KB numa chamada. Devolve `null` se a função ainda não existir no SIOE.
 */
async function loadSioeAggregatesRpc(sioe: SupabaseClient, since: string): Promise<SioeAggregates | null> {
  const { data, error } = await sioe.rpc("icp_agregados", { p_desde: since });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return null;
    throw new Error(error.message);
  }
  const raw = (data ?? {}) as SioeAggregatesJson;
  return {
    hours: (raw.horas ?? []).map((r) => ({ grupo: r.grupo ?? "", area: r.area, horas: toNumber(r.horas) })),
    activeFolders: (raw.pastas_ativas ?? []).map((r) => ({
      grupo: r.grupo ?? "",
      area: r.area,
      count: toNumber(r.pastas),
    })),
    processes: (raw.primeiro_processo ?? []).map((r) => ({
      grupo: r.grupo ?? "",
      area: r.area,
      dataCadastro: r.data_cadastro,
    })),
  };
}

/** Sem a função no SIOE: baixa as linhas (~20 MB, 200+ requisições) e soma aqui. */
async function loadSioeAggregatesRows(sioe: SupabaseClient, since: string): Promise<SioeAggregates> {
  const [processRows, activeFolderRows, timesheetRows] = await Promise.all([
    fetchAllParallel<{ id: string; grupo_cliente: string | null; area: string | null; data_cadastro: string | null }>(
      () =>
        sioe
          .from("processos_completo")
          .select("id", { count: "exact", head: true })
          .not("grupo_cliente", "is", null)
          .not("data_cadastro", "is", null),
      (from, to) =>
        sioe
          .from("processos_completo")
          .select("id, grupo_cliente, area, data_cadastro")
          .not("grupo_cliente", "is", null)
          .not("data_cadastro", "is", null)
          .order("id")
          .range(from, to)
    ),
    // Pastas ativas: mesmo critério da projeção de contratos (src/lib/sioe/usage.ts).
    fetchAll<{ id: string; grupo_cliente: string | null; area: string | null }>((from, to) =>
      sioe
        .from("processos_completo")
        .select("id, grupo_cliente, area")
        .eq("processo_encerrado", "Não")
        .eq("situacao_processo", "Ativo")
        .not("grupo_cliente", "is", null)
        .order("id")
        .range(from, to)
    ),
    fetchAllParallel<{ grupo_cliente: string | null; area: string | null; total_horas_decimal: number | string | null }>(
      () => sioe.from("timesheets").select("id", { count: "exact", head: true }).gte("data", since),
      (from, to) =>
        sioe
          .from("timesheets")
          .select("grupo_cliente, area, total_horas_decimal")
          .gte("data", since)
          .order("id")
          .range(from, to)
    ),
  ]);

  // O timesheet tem mais de 150 mil linhas: soma por grupo e área antes do cálculo.
  const hoursByKey = new Map<string, IcpHoursRow>();
  for (const t of timesheetRows) {
    const grupo = (t.grupo_cliente ?? "").trim();
    const key = `${grupo}\u0000${t.area ?? ""}`;
    const entry = hoursByKey.get(key) ?? { grupo, area: t.area, horas: 0 };
    entry.horas += toNumber(t.total_horas_decimal);
    hoursByKey.set(key, entry);
  }

  return {
    hours: [...hoursByKey.values()],
    activeFolders: activeFolderRows.map((p) => ({ grupo: (p.grupo_cliente ?? "").trim(), area: p.area, count: 1 })),
    processes: processRows.map((p) => ({
      grupo: (p.grupo_cliente ?? "").trim(),
      area: p.area,
      dataCadastro: p.data_cadastro,
    })),
  };
}

async function loadSioeAggregates(sioe: SupabaseClient, since: string): Promise<SioeAggregates> {
  return (await loadSioeAggregatesRpc(sioe, since)) ?? (await loadSioeAggregatesRows(sioe, since));
}

async function loadIcpData(): Promise<IcpData> {
  const now = new Date();
  const since = windowStart(now);
  const today = now.toISOString().slice(0, 10);
  const sioe = requireSioeClient();
  const crm = createSupabaseAdminClient();
  // Sem ORQESTRAI_SUPABASE_URL/_SERVICE_ROLE_KEY no ambiente, os painéis de marketing ficam vazios.
  const orq = orqestraiClient();

  const [
    groupMap,
    revenueRows,
    sioeAggregates,
    pessoaRows,
    overdueRows,
    personnelRows,
    marketing,
    cnpjRecords,
    profileRows,
  ] = await Promise.all([
    fetchAll<{ cliente_norm: string; grupo_cliente: string | null }>((from, to) =>
      sioe.from("receita_grupo_por_nome_cliente").select("cliente_norm, grupo_cliente").range(from, to)
    ),
    fetchAll<{
      id: string;
      cliente: string | null;
      departamento: string | null;
      plano_contas: string | null;
      valor_pago_item: number | string | null;
      data_pagamento: string | null;
    }>((from, to) =>
      sioe
        .from("financeiro_parcelas_itens")
        .select("id, cliente, departamento, plano_contas, valor_pago_item, data_pagamento")
        .eq("tipo", "RECEBER")
        .ilike("plano_contas", "HONOR%")
        .gt("valor_pago_item", 0)
        .gte("data_pagamento", since)
        .order("id")
        .range(from, to)
    ),
    loadSioeAggregates(sioe, since),
    // ~30 mil pessoas: páginas em paralelo, não uma atrás da outra.
    fetchAllParallel<{
      id: string;
      grupo_cliente: string | null;
      tipo: string | null;
      uf: string | null;
      cidade: string | null;
      categoria: string | null;
      cpf_cnpj: string | null;
      nome: string | null;
    }>(
      () => sioe.from("pessoas").select("id", { count: "exact", head: true }),
      (from, to) =>
        sioe
          .from("pessoas")
          .select("id, grupo_cliente, tipo, uf, cidade, categoria, cpf_cnpj, nome")
          .order("id")
          .range(from, to)
    ),
    fetchAll<{ id: string; cliente: string | null; departamento: string | null; valor_parcial_aberto: number | string | null }>(
      (from, to) =>
        sioe
          .from("financeiro_parcelas_itens")
          .select("id, cliente, departamento, valor_parcial_aberto")
          .eq("tipo", "RECEBER")
          .ilike("plano_contas", "HONOR%")
          .gt("valor_parcial_aberto", 0)
          .lt("data_vencimento", today)
          .order("id")
          .range(from, to)
    ),
    fetchAll<{ id: string; departamento: string | null; valor_pago_item: number | string | null }>((from, to) =>
      sioe
        .from("financeiro_parcelas_itens")
        .select("id, departamento, valor_pago_item")
        .eq("tipo", "PAGAR")
        .or(PERSONNEL_COST_FILTER)
        .gt("valor_pago_item", 0)
        .gte("data_pagamento", since)
        .order("id")
        .range(from, to)
    ),
    loadMarketingRows(orq, since),
    loadCnpjRecords(crm),
    fetchAll<ProfileRow>((from, to) =>
      crm
        .from("icp_group_profiles")
        .select(
          "grupo, status, match_confidence, linkedin_url, linkedin_name, employee_range, employee_min, linkedin_members, website, logo_path, updated_at"
        )
        .order("grupo")
        .range(from, to)
    ),
  ]);

  const { npsRows, insightRows, linkedin, ga4Rows, whatsappRows } = marketing;
  const recordByCnpj = new Map(cnpjRecords.map((r) => [r.cnpj, r]));

  const nameToGroup = new Map(
    groupMap.filter((m) => m.grupo_cliente).map((m) => [m.cliente_norm, m.grupo_cliente!.trim()])
  );
  const groupOf = (cliente: string) => {
    const name = cliente.trim();
    return nameToGroup.get(name.toLowerCase()) ?? name;
  };

  // Só conta como cliente quem está num grupo de cliente ou cadastrado como cliente no
  // VIOS. Pagamentos da parte contrária, de fornecedores ou de quem não tem cadastro
  // (em geral sucumbência e êxito) ficam fora do ICP.
  const clientNames = new Set(
    pessoaRows.filter((p) => /cliente/i.test(p.categoria ?? "")).map((p) => (p.nome ?? "").trim().toLowerCase())
  );
  const isClientPayer = (cliente: string) => {
    const name = cliente.trim().toLowerCase();
    return nameToGroup.has(name) || clientNames.has(name);
  };
  const excludedPayers = new Map<string, number>();
  const revenue: IcpRevenueItem[] = revenueRows
    .filter((r) => r.cliente && r.data_pagamento)
    .filter((r) => {
      if (isClientPayer(r.cliente!)) return true;
      const name = r.cliente!.trim();
      excludedPayers.set(name, (excludedPayers.get(name) ?? 0) + toNumber(r.valor_pago_item));
      return false;
    })
    .map((r) => {
      return {
        grupo: groupOf(r.cliente!),
        departamento: r.departamento,
        planoContas: r.plano_contas,
        valor: toNumber(r.valor_pago_item),
        dataPagamento: r.data_pagamento!,
      };
    });

  // Cliente sem grupo no VIOS: a receita fica no nome do cliente, então a pessoa com o
  // mesmo nome entra como o próprio "grupo" (para pegar cidade e CNPJ dela).
  const revenueKeyByName = new Map(revenue.map((r) => [r.grupo.toLowerCase(), r.grupo]));
  const pessoaGroup = (p: { grupo_cliente: string | null; nome: string | null }) =>
    (p.grupo_cliente ?? "").trim() || revenueKeyByName.get((p.nome ?? "").trim().toLowerCase()) || null;

  const npsThemes: IcpNpsTheme[] = insightRows
    .filter((r) => !r.is_noise && Array.isArray(r.themes))
    .flatMap((r) => r.themes as { id?: string; polarity?: string }[])
    .filter((t) => t && typeof t.id === "string")
    .map((t) => ({ id: t.id!, polarity: t.polarity ?? "" }));

  const ga4ByCity = new Map<string, number>();
  for (const r of ga4Rows) {
    if (!r.city || r.city === "(not set)") continue;
    ga4ByCity.set(r.city, (ga4ByCity.get(r.city) ?? 0) + toNumber(r.sessions));
  }

  const data = computeIcp({
    now,
    revenue,
    excludedPayers: {
      count: excludedPayers.size,
      revenue: [...excludedPayers.values()].reduce((acc, v) => acc + v, 0),
    },
    activeFolders: sioeAggregates.activeFolders,
    processes: sioeAggregates.processes,
    pessoas: pessoaRows.flatMap((p) => {
      const grupo = pessoaGroup(p);
      return grupo ? [{ grupo, tipo: p.tipo, uf: p.uf, cidade: p.cidade, categoria: p.categoria }] : [];
    }),
    companies: pessoaRows.flatMap((p) => {
      const grupo = pessoaGroup(p);
      const cnpj = onlyCnpjDigits(p.cpf_cnpj);
      const record = grupo && cnpj ? recordByCnpj.get(cnpj) : undefined;
      return record ? [{ grupo: grupo!, categoria: p.categoria, record }] : [];
    }),
    overdue: overdueRows
      .filter((o) => o.cliente && isClientPayer(o.cliente))
      .map((o) => ({
        grupo: groupOf(o.cliente!),
        departamento: o.departamento,
        valor: toNumber(o.valor_parcial_aberto),
      })),
    hours: sioeAggregates.hours,
    personnelCost: personnelRows.map((p) => ({ departamento: p.departamento, valor: toNumber(p.valor_pago_item) })),
    nps: npsRows.map((r) => ({ cargo: r.respondent_cargo, recommend: r.score_recommend })),
    npsThemes,
    linkedin,
    ga4Cities: [...ga4ByCity.entries()].map(([city, sessions]) => ({ city, sessions })),
    whatsapp: whatsappRows
      .filter((w) => !w.is_group)
      .map((w) => ({ leadSource: w.lead_source, pipelineStage: w.pipeline_stage })),
    profiles: profileRows.map(toProfile),
  });
  return { ...data, marketingAvailable: orq != null };
}

/** Resultado em cache por 6 horas; o botão "Recalcular" invalida a tag. */
export const getIcpData = unstable_cache(loadIcpData, ["crm-icp-data-v6"], {
  revalidate: 60 * 60 * 6,
  tags: [ICP_CACHE_TAG],
});
