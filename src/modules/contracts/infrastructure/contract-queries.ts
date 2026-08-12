import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

export type ContractSource = "proposta" | "contrato" | "rd" | "manual";

export type ContractSourceField = {
  source: ContractSource;
  originalValue: string;
};

export type ContractSetupProgress = {
  complete: number;
  total: number;
  percent: number;
};

export type ContractPortfolioItem = {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string;
  managerId: string | null;
  managerName: string;
  areas: string[];
  tags: string[];
  origin: string;
  lifecycle: Database["public"]["Enums"]["contract_lifecycle_status"];
  billingKinds: string[];
  renewalDate: string | null;
  renewalSoon: boolean;
  annualReferenceCents: string | null;
  monthlyProjectionCents: string | null;
  setupProgress: ContractSetupProgress;
  closingCount: number;
  pendingClosingCount: number;
  updatedAt: string;
};

export type ContractPortfolioResult = {
  items: ContractPortfolioItem[];
  error: string | null;
};

export type ContractComponentDraft = {
  id: string;
  kind: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  areaId?: string;
  amountCents?: string;
  installments?: Array<{ number: number; competency: string; amountCents: string }>;
  requiresManualRelease?: boolean;
  chargeMode?: "quantidade_total" | "excedente";
  includedQuantity?: number;
  unitAmountCents?: string | null;
  percentageBasisPoints?: number;
  reason?: string;
  tax?: { mode: "added" | "included"; percentageBasisPoints: number };
  areaAllocationEligible?: boolean;
  partnerShareEligible?: boolean;
  commissionEligible?: boolean;
};

export type ContractConfigurationDraft = {
  clientId: string | null;
  startsAt: string | null;
  firstInvoiceAt: string | null;
  firstInvoiceConditioned: boolean;
  responsibles: Array<{ id: string; role: string }>;
  areas: Array<{
    id: string;
    areaKey: string;
    includedProcesses?: number | null;
    includedHours?: number | null;
    processExcessRateCents?: string | null;
    hourExcessRateCents?: string | null;
  }>;
  version: {
    id: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    components: ContractComponentDraft[];
    areaAllocations: Array<
      | { id: string; componentId?: string; areaId: string; mode: "percentual"; percentageBasisPoints: number }
      | { id: string; componentId?: string; areaId: string; mode: "valor"; amountCents: string }
    >;
    partnerShares: Array<{
      id: string;
      componentId?: string;
      beneficiaryId: string;
      percentageBasisPoints: number;
    }>;
    commissions: Array<
      | { id: string; componentId?: string; beneficiaryId: string; mode: "percentual"; percentageBasisPoints: number }
      | { id: string; componentId?: string; beneficiaryId: string; mode: "valor"; amountCents: string }
    >;
  };
};

export type ContractDetailViewModel = {
  id: string;
  title: string;
  lifecycle: Database["public"]["Enums"]["contract_lifecycle_status"];
  signatureStatus: Database["public"]["Enums"]["contract_status"];
  clientName: string;
  opportunityId: string | null;
  opportunityName: string | null;
  opportunityStage: Database["public"]["Enums"]["opportunity_stage"] | null;
  startsAt: string | null;
  endsAt: string | null;
  indefinite: boolean;
  firstInvoiceAt: string | null;
  firstInvoiceConditioned: boolean;
  dueDay: number | null;
  renewalDate: string | null;
  renewalAlertDate: string | null;
  adjustmentIndex: string | null;
  annualReferenceCents: string | null;
  activeVersionId: string | null;
  editableVersionStatus: Database["public"]["Enums"]["contract_version_status"] | null;
  expectedVersionUpdatedAt: string | null;
  configuration: ContractConfigurationDraft | null;
  sourceFields: Record<string, ContractSourceField>;
  originLabel: string;
  users: Array<{ id: string; name: string; role: string }>;
  clients: Array<{ id: string; name: string }>;
  versions: Array<{
    id: string;
    number: number;
    status: Database["public"]["Enums"]["contract_version_status"];
    startsAt: string | null;
    endsAt: string | null;
    activatedAt: string | null;
  }>;
  addenda: Array<{ id: string; title: string; status: string; signedAt: string | null; link: string | null }>;
  closings: Array<{ id: string; competency: string; status: string; revision: number }>;
  documents: Array<{ id: string; name: string; status: string | null; link: string | null; updatedAt: string }>;
  events: Array<{ id: string; title: string; detail: string | null; type: string; origin: string | null; createdAt: string }>;
};

type ContractRow = Database["public"]["Tables"]["contratos"]["Row"];
type ComponentRow = Database["public"]["Tables"]["contrato_componentes_cobranca"]["Row"];

function asRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeSource(value: unknown, fallback: ContractSource = "contrato"): ContractSource {
  return value === "proposta" || value === "contrato" || value === "rd" || value === "manual"
    ? value
    : fallback;
}

export function readContractSource(snapshot: Json, key: string, fallback: ContractSource = "contrato"): ContractSource {
  const record = asRecord(snapshot);
  const sources = asRecord((record.sources ?? null) as Json | null);
  const candidate = sources[key] ?? record[key];
  if (typeof candidate === "string") return normalizeSource(candidate, fallback);
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    return normalizeSource((candidate as Record<string, unknown>).source, fallback);
  }
  return fallback;
}

function snapshotLabel(snapshot: Json): string {
  const record = asRecord(snapshot);
  for (const key of ["origem", "origin", "origem_comercial", "commercialOrigin"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const value = (candidate as Record<string, unknown>).value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "Manual";
}

function toCents(value: number | null): string | null {
  return value === null ? null : String(Math.round(Number(value) * 100));
}

function percentageToBasisPoints(value: number | null): number {
  return Math.round(Number(value ?? 0) * 100);
}

function monthlyProjectionCents(components: ComponentRow[]): string | null {
  const recurring = new Set(["mensal_fixo", "mensal_escalonado", "manutencao"]);
  const total = components
    .filter((component) => recurring.has(component.tipo))
    .reduce((sum, component) => sum + Number(component.valor_fixo ?? 0), 0);
  return total > 0 ? String(Math.round(total * 100)) : null;
}

export function computeContractSetupProgress(input: {
  contract: Pick<ContractRow, "cliente_id" | "vigente_de" | "primeiro_vencimento" | "primeiro_faturamento_condicionado">;
  responsibleCount: number;
  areaCount: number;
  componentCount: number;
  allocationCount: number;
}): ContractSetupProgress {
  const checks = [
    Boolean(input.contract.cliente_id),
    Boolean(input.contract.vigente_de),
    Boolean(input.contract.primeiro_vencimento || input.contract.primeiro_faturamento_condicionado),
    input.responsibleCount > 0,
    input.areaCount > 0,
    input.componentCount > 0,
    input.areaCount < 2 || input.allocationCount > 0,
  ];
  const complete = checks.filter(Boolean).length;
  return { complete, total: checks.length, percent: Math.round((complete / checks.length) * 100) };
}

function errorMessage(errors: Array<{ message: string } | null>): string | null {
  return errors.find(Boolean)?.message ?? null;
}

export async function getContractsPortfolio(): Promise<ContractPortfolioResult> {
  const supabase = createSupabaseAdminClient();
  const { data: contracts, error: contractError } = await supabase
    .from("contratos")
    .select("id, titulo, cliente_id, status, vigente_de, vigente_ate, primeiro_vencimento, primeiro_faturamento_condicionado, data_base_renovacao, valor_anual_referencia, valor_anual_override, etiquetas, updated_at")
    .order("updated_at", { ascending: false });

  if (contractError) return { items: [], error: contractError.message };
  const rows = contracts ?? [];
  if (rows.length === 0) return { items: [], error: null };

  const contractIds = rows.map((row) => row.id);
  const clientIds = [...new Set(rows.map((row) => row.cliente_id).filter((id): id is string => Boolean(id)))];
  const [clientsResult, responsiblesResult, versionsResult, closingsResult] = await Promise.all([
    clientIds.length
      ? supabase.from("clientes").select("id, razao_social").in("id", clientIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("contrato_responsaveis").select("id, contrato_id, papel, app_user_id, nome").in("contrato_id", contractIds),
    supabase.from("contrato_versoes").select("id, contrato_id, numero, status, origem_snapshot, updated_at").in("contrato_id", contractIds),
    supabase.from("contrato_fechamentos").select("id, contrato_id, status").in("contrato_id", contractIds),
  ]);

  const versions = versionsResult.data ?? [];
  const versionIds = versions.map((version) => version.id);
  const [areasResult, componentsResult, allocationsResult] = versionIds.length
    ? await Promise.all([
        supabase.from("contrato_areas").select("id, versao_id, area_key").in("versao_id", versionIds),
        supabase.from("contrato_componentes_cobranca").select("id, versao_id, tipo, valor_fixo").in("versao_id", versionIds),
        supabase.from("contrato_rateios_area").select("id, versao_id").in("versao_id", versionIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  const clientMap = new Map((clientsResult.data ?? []).map((client) => [client.id, client.razao_social]));
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 90);

  const items = rows.map<ContractPortfolioItem>((contract) => {
    const contractVersions = versions.filter((version) => version.contrato_id === contract.id);
    const selectedVersion = contractVersions.find((version) => version.status === "ativa")
      ?? [...contractVersions].sort((a, b) => b.numero - a.numero)[0];
    const selectedVersionId = selectedVersion?.id;
    const areas = (areasResult.data ?? []).filter((area) => area.versao_id === selectedVersionId);
    const components = (componentsResult.data ?? []).filter((component) => component.versao_id === selectedVersionId);
    const responsibles = (responsiblesResult.data ?? []).filter((item) => item.contrato_id === contract.id);
    const manager = responsibles.find((item) => /gestor/i.test(item.papel)) ?? responsibles[0];
    const allocations = (allocationsResult.data ?? []).filter((item) => item.versao_id === selectedVersionId);
    const closings = (closingsResult.data ?? []).filter((item) => item.contrato_id === contract.id);
    const renewalDate = contract.data_base_renovacao;
    const annual = contract.valor_anual_override ?? contract.valor_anual_referencia;
    return {
      id: contract.id,
      title: contract.titulo,
      clientId: contract.cliente_id,
      clientName: contract.cliente_id ? clientMap.get(contract.cliente_id) ?? "Cliente não identificado" : "Cliente pendente",
      managerId: manager?.app_user_id ?? null,
      managerName: manager?.nome ?? "Sem responsável",
      areas: areas.map((area) => area.area_key),
      tags: contract.etiquetas,
      origin: selectedVersion ? snapshotLabel(selectedVersion.origem_snapshot) : "Manual",
      lifecycle: contract.status,
      billingKinds: [...new Set(components.map((component) => component.tipo))],
      renewalDate,
      renewalSoon: Boolean(renewalDate && new Date(`${renewalDate}T12:00:00`) >= now && new Date(`${renewalDate}T12:00:00`) <= soon),
      annualReferenceCents: toCents(annual),
      monthlyProjectionCents: monthlyProjectionCents(components as ComponentRow[]),
      setupProgress: computeContractSetupProgress({
        contract,
        responsibleCount: responsibles.length,
        areaCount: areas.length,
        componentCount: components.length,
        allocationCount: allocations.length,
      }),
      closingCount: closings.length,
      pendingClosingCount: closings.filter((closing) => closing.status === "a_calcular" || closing.status === "em_revisao").length,
      updatedAt: contract.updated_at,
    };
  });

  return {
    items,
    error: errorMessage([
      clientsResult.error,
      responsiblesResult.error,
      versionsResult.error,
      closingsResult.error,
      areasResult.error,
      componentsResult.error,
      allocationsResult.error,
    ]),
  };
}

function parseTax(value: string | null): ContractComponentDraft["tax"] {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if ((parsed.mode === "added" || parsed.mode === "included") && typeof parsed.percentageBasisPoints === "number") {
      return { mode: parsed.mode, percentageBasisPoints: parsed.percentageBasisPoints };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function getContractDetail(contractId: string): Promise<ContractDetailViewModel | null> {
  const supabase = createSupabaseAdminClient();
  const { data: contract, error } = await supabase
    .from("contratos")
    .select("id, titulo, status, status_assinatura, cliente_id, oportunidade_id, versao_ativa_id, vigente_de, vigente_ate, prazo_indeterminado, primeiro_vencimento, primeiro_faturamento_condicionado, dia_vencimento, data_base_renovacao, data_alerta_renovacao, indice_reajuste, valor_anual_referencia, valor_anual_override, d4sign_document_id")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contract) return null;

  const [clientResult, opportunityResult, versionsResult, responsiblesResult, usersResult, clientsResult, addendaResult, closingsResult, eventsResult, documentResult] = await Promise.all([
    contract.cliente_id ? supabase.from("clientes").select("id, razao_social").eq("id", contract.cliente_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    contract.oportunidade_id ? supabase.from("oportunidades").select("id, solicitante_nome, etapa").eq("id", contract.oportunidade_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("contrato_versoes").select("id, numero, status, vigente_de, vigente_ate, origem_snapshot, ativada_em, updated_at").eq("contrato_id", contractId).order("numero", { ascending: false }),
    supabase.from("contrato_responsaveis").select("id, papel, app_user_id, nome").eq("contrato_id", contractId),
    supabase.from("app_users").select("id, full_name, role").order("full_name"),
    supabase.from("clientes").select("id, razao_social").order("razao_social"),
    supabase.from("aditivos").select("id, titulo, status, updated_at").eq("contrato_base_id", contractId).order("created_at", { ascending: false }),
    supabase.from("contrato_fechamentos").select("id, competencia, status, revisao_atual_id").eq("contrato_id", contractId).order("competencia", { ascending: false }),
    supabase.from("contrato_eventos").select("id, titulo, detalhe, tipo, origem, created_at").eq("contrato_id", contractId).order("created_at", { ascending: false }).limit(100),
    contract.d4sign_document_id ? supabase.from("d4sign_documents").select("id, uuid_doc, name_document, status_name, d4sign_status, link_contrato, updated_at").eq("id", contract.d4sign_document_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);

  const versions = versionsResult.data ?? [];
  const editableVersion = versions.find((version) => version.status === "rascunho")
    ?? versions.find((version) => version.id === contract.versao_ativa_id)
    ?? versions[0];
  const versionId = editableVersion?.id;
  const [areasResult, componentsResult, allocationsResult, sharesResult, commissionsResult] = versionId
    ? await Promise.all([
        supabase.from("contrato_areas").select("id, area_key, processos_incluidos, horas_incluidas, valor_excedente_processo, valor_excedente_hora").eq("versao_id", versionId).order("area_key"),
        supabase.from("contrato_componentes_cobranca").select("id, area_id, tipo, descricao, periodo_inicio, periodo_fim, valor_fixo, valor_unitario, quantidade_incluida, percentual, modo_cobranca_variavel, liberacao_manual_necessaria, condicao_liberacao, tratamento_tributario, elegivel_rateio, elegivel_participacao, elegivel_comissao, ordem").eq("versao_id", versionId).order("ordem"),
        supabase.from("contrato_rateios_area").select("id, componente_id, area_id, modo, percentual, valor").eq("versao_id", versionId),
        supabase.from("contrato_participacoes_socios").select("id, componente_id, socio_app_user_id, percentual").eq("versao_id", versionId),
        supabase.from("contrato_comissoes").select("id, componente_id, beneficiario_app_user_id, percentual, valor, base_calculo").eq("versao_id", versionId),
      ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const componentIds = (componentsResult.data ?? []).map((component) => component.id);
  const installmentsResult = componentIds.length
    ? await supabase.from("contrato_parcelas").select("id, componente_id, numero, competencia, valor").in("componente_id", componentIds).order("numero")
    : { data: [], error: null };

  const areas = (areasResult.data ?? []).map((area) => ({
    id: area.id,
    areaKey: area.area_key,
    includedProcesses: area.processos_incluidos,
    includedHours: area.horas_incluidas,
    processExcessRateCents: toCents(area.valor_excedente_processo),
    hourExcessRateCents: toCents(area.valor_excedente_hora),
  }));
  const components = (componentsResult.data ?? []).map<ContractComponentDraft>((component) => {
    const installments = (installmentsResult.data ?? [])
      .filter((installment) => installment.componente_id === component.id)
      .map((installment) => ({ number: installment.numero, competency: installment.competencia, amountCents: toCents(installment.valor) ?? "0" }));
    return {
      id: component.id,
      kind: component.tipo,
      description: component.descricao,
      effectiveFrom: component.periodo_inicio ?? editableVersion?.vigente_de ?? contract.vigente_de ?? "",
      effectiveTo: component.periodo_fim,
      ...(component.area_id ? { areaId: component.area_id } : {}),
      ...(component.valor_fixo !== null ? { amountCents: toCents(component.valor_fixo) ?? "0" } : {}),
      ...(installments.length ? { installments } : {}),
      ...(component.modo_cobranca_variavel === "quantidade_total" || component.modo_cobranca_variavel === "excedente"
        ? { chargeMode: component.modo_cobranca_variavel, includedQuantity: component.quantidade_incluida ?? 0, unitAmountCents: toCents(component.valor_unitario) }
        : {}),
      ...(component.percentual !== null ? { percentageBasisPoints: percentageToBasisPoints(component.percentual) } : {}),
      ...(component.condicao_liberacao ? { reason: component.condicao_liberacao } : {}),
      requiresManualRelease: component.liberacao_manual_necessaria,
      tax: parseTax(component.tratamento_tributario),
      areaAllocationEligible: component.elegivel_rateio,
      partnerShareEligible: component.elegivel_participacao,
      commissionEligible: component.elegivel_comissao,
    };
  });
  const areaAllocations: ContractConfigurationDraft["version"]["areaAllocations"] = [];
  for (const allocation of allocationsResult.data ?? []) {
    const base = { id: allocation.id, ...(allocation.componente_id ? { componentId: allocation.componente_id } : {}), areaId: allocation.area_id };
    if (allocation.modo === "percentual") areaAllocations.push({ ...base, mode: "percentual", percentageBasisPoints: percentageToBasisPoints(allocation.percentual) });
    else if (allocation.valor !== null) areaAllocations.push({ ...base, mode: "valor", amountCents: toCents(allocation.valor) ?? "0" });
  }
  const commissions: ContractConfigurationDraft["version"]["commissions"] = [];
  for (const commission of commissionsResult.data ?? []) {
    if (!commission.beneficiario_app_user_id) continue;
    const base = { id: commission.id, ...(commission.componente_id ? { componentId: commission.componente_id } : {}), beneficiaryId: commission.beneficiario_app_user_id };
    if (commission.percentual !== null) commissions.push({ ...base, mode: "percentual", percentageBasisPoints: percentageToBasisPoints(commission.percentual) });
    else if (commission.valor !== null) commissions.push({ ...base, mode: "valor", amountCents: toCents(commission.valor) ?? "0" });
  }

  const configuration: ContractConfigurationDraft | null = editableVersion ? {
    clientId: contract.cliente_id,
    startsAt: contract.vigente_de,
    firstInvoiceAt: contract.primeiro_vencimento,
    firstInvoiceConditioned: contract.primeiro_faturamento_condicionado,
    responsibles: (responsiblesResult.data ?? [])
      .filter((responsible): responsible is typeof responsible & { app_user_id: string } => Boolean(responsible.app_user_id))
      .map((responsible) => ({ id: responsible.app_user_id, role: responsible.papel })),
    areas,
    version: {
      id: editableVersion.id,
      effectiveFrom: editableVersion.vigente_de ?? contract.vigente_de ?? "",
      effectiveTo: editableVersion.vigente_ate,
      components,
      areaAllocations,
      partnerShares: (sharesResult.data ?? []).flatMap((share) => share.socio_app_user_id ? [{
        id: share.id,
        ...(share.componente_id ? { componentId: share.componente_id } : {}),
        beneficiaryId: share.socio_app_user_id,
        percentageBasisPoints: percentageToBasisPoints(share.percentual),
      }] : []),
      commissions,
    },
  } : null;

  const sourceFields: Record<string, ContractSourceField> = {};
  if (configuration && editableVersion) {
    for (const [key, value] of Object.entries({
      clientId: configuration.clientId,
      startsAt: configuration.startsAt,
      firstInvoiceAt: configuration.firstInvoiceAt,
      areas: configuration.areas,
      components: configuration.version.components,
      allocations: configuration.version.areaAllocations,
      partnerShares: configuration.version.partnerShares,
      commissions: configuration.version.commissions,
    })) {
      sourceFields[key] = {
        source: readContractSource(editableVersion.origem_snapshot, key),
        originalValue: JSON.stringify(value),
      };
    }
  }

  const loadError = errorMessage([
    clientResult.error, opportunityResult.error, versionsResult.error, responsiblesResult.error,
    usersResult.error, clientsResult.error, addendaResult.error, closingsResult.error,
    eventsResult.error, documentResult.error, areasResult.error, componentsResult.error,
    allocationsResult.error, sharesResult.error, commissionsResult.error, installmentsResult.error,
  ]);
  if (loadError) throw new Error(loadError);

  const document = documentResult.data;
  return {
    id: contract.id,
    title: contract.titulo,
    lifecycle: contract.status,
    signatureStatus: contract.status_assinatura,
    clientName: clientResult.data?.razao_social ?? "Cliente pendente",
    opportunityId: contract.oportunidade_id,
    opportunityName: opportunityResult.data?.solicitante_nome ?? null,
    opportunityStage: opportunityResult.data?.etapa ?? null,
    startsAt: contract.vigente_de,
    endsAt: contract.vigente_ate,
    indefinite: contract.prazo_indeterminado,
    firstInvoiceAt: contract.primeiro_vencimento,
    firstInvoiceConditioned: contract.primeiro_faturamento_condicionado,
    dueDay: contract.dia_vencimento,
    renewalDate: contract.data_base_renovacao,
    renewalAlertDate: contract.data_alerta_renovacao,
    adjustmentIndex: contract.indice_reajuste,
    annualReferenceCents: toCents(contract.valor_anual_override ?? contract.valor_anual_referencia),
    activeVersionId: contract.versao_ativa_id,
    editableVersionStatus: editableVersion?.status ?? null,
    expectedVersionUpdatedAt: editableVersion?.updated_at ?? null,
    configuration,
    sourceFields,
    originLabel: editableVersion ? snapshotLabel(editableVersion.origem_snapshot) : "Manual",
    users: (usersResult.data ?? []).map((user) => ({ id: user.id, name: user.full_name, role: user.role })),
    clients: (clientsResult.data ?? []).map((client) => ({ id: client.id, name: client.razao_social })),
    versions: versions.map((version) => ({ id: version.id, number: version.numero, status: version.status, startsAt: version.vigente_de, endsAt: version.vigente_ate, activatedAt: version.ativada_em })),
    addenda: (addendaResult.data ?? []).map((addendum) => ({ id: addendum.id, title: addendum.titulo, status: addendum.status, signedAt: null, link: null })),
    closings: (closingsResult.data ?? []).map((closing) => ({ id: closing.id, competency: closing.competencia, status: closing.status, revision: closing.revisao_atual_id ? 1 : 0 })),
    documents: document ? [{ id: document.uuid_doc, name: document.name_document ?? "Documento D4Sign", status: document.status_name ?? document.d4sign_status, link: document.link_contrato, updatedAt: document.updated_at }] : [],
    events: (eventsResult.data ?? []).map((event) => ({ id: event.id, title: event.titulo, detail: event.detalhe, type: event.tipo, origin: event.origem, createdAt: event.created_at })),
  };
}
