import type { OpportunityStage } from "@/modules/crm/domain/entities";

/**
 * Mesmas chaves que `STAGE_MAP` em `rd-import.ts` — mantenha alinhado ao sincronizar com o RD.
 * Usado para exibir a etapa “real” do funil quando `oportunidades.etapa` ainda está em `cadastro_lead`
 * mas o snapshot do RD em `rd_deal_reconciliacao.detalhes` já reflete outra etapa.
 */
export const RD_PIPELINE_STAGE_MAP: Record<string, OpportunityStage> = {
  cadastro_do_lead: "cadastro_lead",
  cadastro_lead: "cadastro_lead",
  levantamento_de_dados: "levantamento_dados",
  /** Nome curto na exportação CRM-BP / RD. */
  levantamento_dos_dados: "levantamento_dados",
  compilacao: "compilacao",
  revisao: "revisao",
  due_diligence_finalizada: "due_diligence_finalizada",
  /** Typo comum em exports / planilhas. */
  due_dilligence_finalizada: "due_diligence_finalizada",
  reuniao: "reuniao",
  reuniao_realizada: "reuniao",
  confeccao_de_proposta: "confeccao_proposta",
  /** Sem "de" — normalização de "Elaboração da proposta". */
  confeccao_proposta: "confeccao_proposta",
  proposta_enviada: "proposta_enviada",
  confeccao_de_contrato: "confeccao_contrato",
  confeccao_do_contrato: "confeccao_contrato",
  contrato_elaborado: "contrato_elaborado",
  contrato_enviado: "contrato_enviado",
  contrato_assinado: "contrato_assinado",
  aguardando_cadastro: "aguardando_cadastro",
  aguardando_cadastro_solicitante: "aguardando_cadastro",
  cadastro_de_novo_cliente: "cadastro_novo_cliente",
  cadastro_novo_cliente: "cadastro_novo_cliente",
  cadastro_de_novo_cliente_solicitante: "cadastro_novo_cliente",
  inclusao_no_fluxo_de_faturamento: "inclusao_faturamento",
  inclusao_faturamento: "inclusao_faturamento",
  inclusao_no_fluxo_de_faturamento_financeiro: "inclusao_faturamento",
  boas_vindas: "boas_vindas",
  boas_vindas_ao_cliente: "boas_vindas",
  boas_vindas_recep: "boas_vindas",
  reuniao_kickoff: "reuniao_kickoff",
  reuniao_kick_off: "reuniao_kickoff",
  reuniao_de_kick_off: "reuniao_kickoff",
  reuniao_kick_off_alinh: "reuniao_kickoff",
  contrato_assinado_solicitante: "contrato_assinado",
  proposta_enviada_aguarda_cliente: "proposta_enviada",
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractString(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = payload[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (typeof candidate === "number") {
      return String(candidate);
    }
  }
  return null;
}

function extractObject(
  payload: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!isObject(payload)) {
    return null;
  }
  for (const key of keys) {
    const candidate = payload[key];
    if (isObject(candidate)) {
      return candidate;
    }
  }
  return null;
}

function stripRdStageAreaSuffix(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function looksLikeRdInternalStageId(value: string): boolean {
  const t = value.trim();
  if (t.length === 24 && /^[a-f0-9]+$/i.test(t)) {
    return true;
  }
  return t.length >= 20 && /^[0-9a-f]+$/i.test(t);
}

/** Nome da etapa no deal (API RD / snapshot em `detalhes`). */
function extractRdStageDisplayLabel(deal: Record<string, unknown>): string | null {
  const dealStage = extractObject(deal, ["deal_stage"]);
  if (dealStage) {
    const name = extractString(dealStage, ["name"]);
    if (name?.trim()) {
      return name.trim();
    }
    const label = extractString(dealStage, ["label"]);
    if (label?.trim()) {
      return label.trim();
    }
    const nick = extractString(dealStage, ["nickname"]);
    if (nick && nick.trim().length > 2) {
      return nick.trim();
    }
  }

  const stageName = extractString(deal, ["stage_name", "stage_label"]);
  if (stageName?.trim()) {
    return stageName.trim();
  }

  const stageRoot = extractString(deal, ["stage", "stageName"]);
  if (stageRoot && !looksLikeRdInternalStageId(stageRoot)) {
    return stageRoot.trim();
  }

  return null;
}

function extractDealFromReconciliation(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== "object") return null;
  const root = details as Record<string, unknown>;
  const deal = root.deal;
  if (isObject(deal)) {
    return deal;
  }
  return null;
}

/**
 * Mapeia rótulo de etapa (planilha CRM-BP / nome exibido no RD) para etapa interna —
 * mesma regra conceitual que `RdImportConnector.mapStage` / `opportunityStageFromRdDealPayload`.
 */
export function opportunityStageFromDisplayLabel(rawLabel: string): OpportunityStage {
  const trimmed = rawLabel.trim();
  if (!trimmed) {
    return "cadastro_lead";
  }

  const forMap = stripRdStageAreaSuffix(trimmed);
  const normalizedStage = normalizeText(forMap.length > 0 ? forMap : trimmed);
  const mapped =
    RD_PIPELINE_STAGE_MAP[normalizedStage] ?? RD_PIPELINE_STAGE_MAP[normalizeText(trimmed)];
  if (mapped) {
    return mapped;
  }

  return "cadastro_lead";
}

/** Indica se o rótulo tem entrada explícita em `RD_PIPELINE_STAGE_MAP` (útil p/ alertas em scripts / QA). */
export function isRdDisplayLabelInPipelineMap(rawLabel: string): boolean {
  const trimmed = rawLabel.trim();
  if (!trimmed) {
    return true;
  }
  const forMap = stripRdStageAreaSuffix(trimmed);
  const normalizedStage = normalizeText(forMap.length > 0 ? forMap : trimmed);
  if (RD_PIPELINE_STAGE_MAP[normalizedStage] || RD_PIPELINE_STAGE_MAP[normalizeText(trimmed)]) {
    return true;
  }
  return false;
}

export function opportunityStageFromRdDealPayload(deal: Record<string, unknown>): OpportunityStage {
  const rawLabel = extractRdStageDisplayLabel(deal);
  if (!rawLabel) {
    return "cadastro_lead";
  }
  return opportunityStageFromDisplayLabel(rawLabel);
}

export function opportunityStageFromReconciliationDetails(
  details: unknown,
): OpportunityStage | null {
  const deal = extractDealFromReconciliation(details);
  if (!deal) return null;
  return opportunityStageFromRdDealPayload(deal);
}

/**
 * Quando o CRM ainda tem `cadastro_lead` no banco mas o RD já mostra outra etapa no último snapshot,
 * usamos a etapa derivada do RD para o kanban e para validar transições — evita coluna falsa "Cadastro".
 */
export function resolvePipelineEtapaFromDbAndRd(
  dbEtapa: OpportunityStage,
  hasReconciliation: boolean,
  reconciliationDetails: unknown,
): OpportunityStage {
  if (dbEtapa !== "cadastro_lead") {
    return dbEtapa;
  }
  if (!hasReconciliation) {
    return dbEtapa;
  }
  const fromRd = opportunityStageFromReconciliationDetails(reconciliationDetails);
  if (fromRd && fromRd !== "cadastro_lead") {
    return fromRd;
  }
  return dbEtapa;
}
