import { filledFieldsFromLeadIntake } from "@/lib/crm/lead-intake-to-fields";
import {
  isRdFieldAppUserKey,
  labelForRdFieldKey,
  LEAD_RD_FIELD_LABELS,
} from "@/lib/crm/lead-rd-field-labels";
import {
  fetchAppUsersByEmails,
  fetchAppUsersByIds,
  looksLikeUuid,
  resolvedUserFromEmailMap,
  type ResolvedAppUser,
} from "@/lib/crm/resolve-app-user-display";
import { appUserAreaCandidatesForScopeKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import {
  fieldOptionsFromDb,
  valueJsonToDisplayString,
} from "@/lib/crm/pipeline-field-values";
import { formatMaybeDateLikeBr } from "@/lib/format-datetime";
import { resolvePipelineEtapaFromDbAndRd } from "@/lib/crm/rd-pipeline-stage-from-reconciliation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Oportunidade } from "@/modules/crm/domain/entities";
import { LeadDetailView } from "./lead-detail-view";
import type { LeadIntakeEmpresaRow } from "./lead-intake-types";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import { fetchLeadLifecycleTimeline, type LeadLifecycleTimeline } from "@/lib/crm/lead-lifecycle-timeline";

export type { LeadIntakeEmpresaRow } from "./lead-intake-types";

/** Sessão + perfil CRM para ações condicionais na ficha (ex.: notificar outras áreas). */
export type LeadDetailViewer = {
  appUserId: string;
  role: string;
  /** `app_users.area` — chave alinhada a `cp_areas_objeto` / escopo por área. */
  area: string | null;
};

export interface LeadDetailData extends Oportunidade {
  d4signDocumentUuid: string | null;
  d4signStatus: string | null;
  d4signUpdatedAt: string | null;
  /** E-mail do solicitante/lead (`oportunidades.solicitante_email`). */
  solicitanteEmail: string | null;
  rdDealId: string | null;
  rdDealUrl: string | null;
  isSystemCreated: boolean;
  /** Dados do formulário de nova demanda (`lead_intakes`). */
  intakeFields: Array<{
    key: string;
    label: string;
    value: string;
    resolvedUser?: ResolvedAppUser;
  }>;
  /** Empresas do cadastro inicial (`empresas_json`): um bloco por empresa na UI. */
  empresasIntake: LeadIntakeEmpresaRow[];
  /** Custom fields do último snapshot RD (`rd_deal_reconciliacao`), com sobreposições do CRM quando existirem. */
  filledFields: Array<{
    key: string;
    label: string;
    value: string;
    valueSource: "rd" | "crm";
    resolvedUser?: ResolvedAppUser;
  }>;
  /** Campos configuráveis por etapa salvos em `field_values` (ex.: ao transicionar para elaboração da proposta). */
  pipelineFields: Array<{
    definitionId: string;
    fieldCode: string;
    label: string;
    fieldType: string;
    value: string;
    /** Opções fixas (`field_definitions.field_options`), alinhadas ao `DynamicForm`. */
    fieldOptions: string[] | null;
    conditionJson: unknown;
    resolvedUser?: ResolvedAppUser;
  }>;
  /** `cp_escopo_detalhe_json`: definido na BD mesmo sem linha em `field_values`. */
  escopoDetalhe: { definitionId: string; value: string } | null;
  /** Linhas de `proposta_escopo_solicitacao` na etapa confecção de proposta; `null` fora dessa etapa. */
  escopoSolicitacoes: Array<{
    areaKey: string;
    concluidoEm: string | null;
    notificadoEm: string | null;
    prazoAte: string | null;
    gestor?: ResolvedAppUser;
    preenchidoPor?: ResolvedAppUser;
    responsaveis: Array<ResolvedAppUser & { id: string }>;
  }> | null;
  dueAreaTasks: Array<{
    id: string;
    areaKey: string;
    status: "pendente" | "em_andamento" | "disponibilizado";
    prazoAte: string | null;
    pastaDueConfirmada: boolean;
    semProcessosAtivos: boolean;
    observacaoSemProcessos: string | null;
    iniciadoEm: string | null;
    dadosDisponibilizadosEm: string | null;
    responsavelAppUserId: string | null;
    responsavel?: ResolvedAppUser;
  }>;
  dueRevisionCycle: number;
  dueCompilacaoEntradaEm: string | null;
  dueRevisaoEntradaEm: string | null;
  dueDocuments: Array<{
    id: string;
    documentKind: string;
    originalFilename: string;
    contentType: string | null;
    byteSize: number | null;
    uploadedAt: string;
    uploadedByAppUserId: string | null;
    uploadedBy?: ResolvedAppUser;
  }>;
  dueAreaReviewTasks: Array<{
    id: string;
    areaKey: string;
    status: "pendente" | "ok" | "ajustes_solicitados";
    prazoAte: string | null;
    observacaoAjustes: string | null;
    reviewStartedAt: string | null;
    adjustmentsRequestedAt: string | null;
    approvedAt: string | null;
    compilationReturnedAt: string | null;
    revisaoReentryAt: string | null;
    reviewElapsedMs: number | null;
    compilationElapsedMs: number | null;
    adjustmentCompletedAt: string | null;
    adjustmentCompletedByAppUserId: string | null;
    adjustmentCompletionNote: string | null;
    adjustmentEvidenceKind: "link" | "file" | null;
    adjustmentEvidenceValue: string | null;
    respondedAt: string | null;
    respondedByAppUserId: string | null;
    responsavelAppUserId: string | null;
    responsavel?: ResolvedAppUser;
    respondedBy?: ResolvedAppUser;
  }>;
  lifecycleTimeline: LeadLifecycleTimeline;
}

function normalizeLabel(label: string): string {
  return label
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function getFieldValue(dealCustomFields: unknown[], labels: string[]): string | null {
  const normalizedTargets = labels.map(normalizeLabel);
  for (const field of dealCustomFields) {
    if (!field || typeof field !== "object") continue;
    const row = field as Record<string, unknown>;
    const customField =
      row.custom_field && typeof row.custom_field === "object"
        ? (row.custom_field as Record<string, unknown>)
        : null;

    const rawLabel = asString(customField?.label) ?? asString(row.label);
    if (!rawLabel) continue;
    if (!normalizedTargets.includes(normalizeLabel(rawLabel))) continue;

    const value = asString(row.value) ?? asString(row.content);
    if (value) return value;
  }
  return null;
}

function extractFilledFields(reconciliationDetails: unknown): Array<{ key: string; label: string; value: string }> {
  if (!reconciliationDetails || typeof reconciliationDetails !== "object") return [];
  const details = reconciliationDetails as Record<string, unknown>;
  const deal =
    details.deal && typeof details.deal === "object"
      ? (details.deal as Record<string, unknown>)
      : null;
  if (!deal) return [];

  const dealCustomFields = Array.isArray(deal.deal_custom_fields) ? deal.deal_custom_fields : [];
  const filled: Array<{ key: string; label: string; value: string }> = [];

  const stageName =
    deal.deal_stage && typeof deal.deal_stage === "object"
      ? asString((deal.deal_stage as Record<string, unknown>).name)
      : null;
  if (stageName) {
    filled.push({ key: "stage_name", label: "Etapa RD", value: stageName });
  }

  for (const mapping of LEAD_RD_FIELD_LABELS) {
    const labels = [mapping.label, ...(mapping.aliases ?? [])];
    const value = getFieldValue(dealCustomFields, labels);
    if (value) {
      filled.push({
        key: mapping.key,
        label: mapping.label.trim(),
        value: formatMaybeDateLikeBr(value),
      });
    }
  }

  return filled;
}

function mergeFilledFieldsWithCrmOverrides(
  extracted: Array<{ key: string; label: string; value: string }>,
  overridesRaw: unknown,
): Array<{ key: string; label: string; value: string; valueSource: "rd" | "crm" }> {
  const overrides =
    overridesRaw && typeof overridesRaw === "object" && !Array.isArray(overridesRaw)
      ? (overridesRaw as Record<string, unknown>)
      : {};
  const keysWithRow = new Set(extracted.map((r) => r.key));
  const out: Array<{ key: string; label: string; value: string; valueSource: "rd" | "crm" }> = [];

  for (const row of extracted) {
    const o = overrides[row.key];
    const str = typeof o === "string" ? o.trim() : "";
    if (str) {
      out.push({
        ...row,
        value: formatMaybeDateLikeBr(str),
        valueSource: "crm",
      });
    } else {
      out.push({ ...row, valueSource: "rd" });
    }
  }

  for (const [key, val] of Object.entries(overrides)) {
    if (keysWithRow.has(key)) continue;
    const str = typeof val === "string" ? val.trim() : "";
    if (!str) continue;
    const label = labelForRdFieldKey(key);
    if (!label) continue;
    out.push({
      key,
      label,
      value: formatMaybeDateLikeBr(str),
      valueSource: "crm",
    });
  }

  return out;
}

async function getLeadById(id: string): Promise<LeadDetailData | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("oportunidades")
    .select(
      "id, cliente_id, contrato_base_id, tipo, etapa, havera_due_diligence, solicitante_nome, solicitante_email, created_at, updated_at, link_proposta, link_contrato, encerramento, crm_rd_field_overrides, d4sign_document_uuid, d4sign_status, d4sign_updated_at, d4sign_signers, due_compilacao_entrada_em, due_revisao_entrada_em, due_revision_cycle",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const [{ data: reconciliation, error: reconciliationError }, { data: intake, error: intakeError }] =
    await Promise.all([
      supabase
        .from("rd_deal_reconciliacao")
        .select("rd_deal_id, detalhes")
        .eq("oportunidade_id", id)
        .order("reconciled_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("lead_intakes")
        .select("*")
        .eq("oportunidade_id", id)
        .maybeSingle(),
    ]);

  if (reconciliationError) throw reconciliationError;
  if (intakeError) throw intakeError;

  const rdDealId = reconciliation?.rd_deal_id ?? null;
  const rdDealUrl =
    rdDealId && !rdDealId.startsWith("lead_")
      ? `https://crm.rdstation.com/deals/${encodeURIComponent(rdDealId)}`
      : null;

  const encerramento =
    data.encerramento === "ganho" || data.encerramento === "perdido"
      ? data.encerramento
      : undefined;

  const etapa = resolvePipelineEtapaFromDbAndRd(
    data.etapa,
    Boolean(reconciliation?.detalhes),
    reconciliation?.detalhes,
  );

  const solicitanteEmail =
    data.solicitante_email != null && String(data.solicitante_email).trim() !== ""
      ? String(data.solicitante_email).trim()
      : null;

  const intakeFieldsRaw =
    intake && typeof intake === "object"
      ? filledFieldsFromLeadIntake(intake as Record<string, unknown>, {
          solicitanteEmail,
        })
      : [];

  const empresasIntake: LeadIntakeEmpresaRow[] =
    intake && typeof intake === "object"
      ? parseEmpresasIntakeFromRecord(intake as Record<string, unknown>)
      : [];

  const emailsForIntakeUsers: string[] = [];
  for (const f of intakeFieldsRaw) {
    if (
      (f.key === "email_solicitante" || f.key === "cadastrado_por") &&
      f.value.includes("@")
    ) {
      emailsForIntakeUsers.push(f.value.trim());
    }
  }
  const intakeEmailMap = await fetchAppUsersByEmails(supabase, emailsForIntakeUsers);

  const intakeFields = intakeFieldsRaw
    .filter((f) => !/^empresa_\d+_(razao|doc)$/.test(f.key))
    .map((f) => {
      if (f.key !== "email_solicitante" && f.key !== "cadastrado_por") {
        return { ...f };
      }
      const ru = resolvedUserFromEmailMap(intakeEmailMap, f.value);
      return { ...f, ...(ru ? { resolvedUser: ru } : {}) };
    });

  const { data: fvRows, error: fvErr } = await supabase
    .from("field_values")
    .select("field_definition_id, value_json")
    .eq("entity_name", "oportunidade")
    .eq("entity_record_id", id)
    .order("updated_at", { ascending: false, nullsFirst: false });

  if (fvErr) throw fvErr;

  const { data: dueTaskRows, error: dueTaskErr } = await supabase
    .from("due_area_tasks")
    .select(
      "id, area_key, status, prazo_ate, pasta_due_confirmada, sem_processos_ativos, observacao_sem_processos, iniciado_em, dados_disponibilizados_em, responsavel_app_user_id",
    )
    .eq("oportunidade_id", id)
    .order("area_key", { ascending: true });

  if (dueTaskErr) throw dueTaskErr;

  let dueDocuments: LeadDetailData["dueDocuments"] = [];
  let dueAreaReviewTasks: LeadDetailData["dueAreaReviewTasks"] = [];

  const dueRevisionCycle =
    typeof data.due_revision_cycle === "number"
      ? data.due_revision_cycle
      : Number(data.due_revision_cycle) || 0;

  if (data.havera_due_diligence) {
    const [{ data: docRows, error: docErr }, { data: revRows, error: revErr }] = await Promise.all([
      supabase
        .from("due_documents")
        .select(
          "id, document_kind, original_filename, content_type, byte_size, uploaded_at, uploaded_by_app_user_id",
        )
        .eq("oportunidade_id", id)
        .order("uploaded_at", { ascending: false }),
      dueRevisionCycle >= 1
        ? supabase
            .from("due_area_review_tasks")
            .select(
              "id, area_key, status, prazo_ate, observacao_ajustes, review_started_at, adjustments_requested_at, approved_at, compilation_returned_at, revisao_reentry_at, review_elapsed_ms, compilation_elapsed_ms, adjustment_completed_at, adjustment_completed_by_app_user_id, adjustment_completion_note, adjustment_evidence_kind, adjustment_evidence_value, responded_at, responded_by_app_user_id, responsavel_app_user_id",
            )
            .eq("oportunidade_id", id)
            .eq("revision_cycle", dueRevisionCycle)
            .order("area_key", { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (docErr) throw docErr;
    if (revErr) throw revErr;

    const docUploaderIds = [...new Set((docRows ?? []).map((r) => r.uploaded_by_app_user_id).filter(Boolean))] as string[];
    const revUserIds = [
      ...new Set(
        (revRows ?? []).flatMap((r) => [r.responsavel_app_user_id, r.responded_by_app_user_id].filter(Boolean)),
      ),
    ] as string[];
    const mergedRevIds = [...new Set([...docUploaderIds, ...revUserIds])];
    const dueExtraUserMap = mergedRevIds.length ? await fetchAppUsersByIds(supabase, mergedRevIds) : new Map();

    dueDocuments = (docRows ?? []).map((r) => ({
      id: r.id,
      documentKind: r.document_kind,
      originalFilename: r.original_filename,
      contentType: r.content_type,
      byteSize: r.byte_size != null ? Number(r.byte_size) : null,
      uploadedAt: r.uploaded_at,
      uploadedByAppUserId: r.uploaded_by_app_user_id,
      uploadedBy: r.uploaded_by_app_user_id ? dueExtraUserMap.get(r.uploaded_by_app_user_id) : undefined,
    }));

    dueAreaReviewTasks = (revRows ?? []).map((r) => ({
      id: r.id,
      areaKey: r.area_key,
      status: r.status as "pendente" | "ok" | "ajustes_solicitados",
      prazoAte: r.prazo_ate,
      observacaoAjustes: r.observacao_ajustes,
      reviewStartedAt: r.review_started_at,
      adjustmentsRequestedAt: r.adjustments_requested_at,
      approvedAt: r.approved_at,
      compilationReturnedAt: r.compilation_returned_at,
      revisaoReentryAt: r.revisao_reentry_at,
      reviewElapsedMs: r.review_elapsed_ms != null ? Number(r.review_elapsed_ms) : null,
      compilationElapsedMs: r.compilation_elapsed_ms != null ? Number(r.compilation_elapsed_ms) : null,
      adjustmentCompletedAt: r.adjustment_completed_at,
      adjustmentCompletedByAppUserId: r.adjustment_completed_by_app_user_id,
      adjustmentCompletionNote: r.adjustment_completion_note,
      adjustmentEvidenceKind:
        r.adjustment_evidence_kind === "link" || r.adjustment_evidence_kind === "file"
          ? r.adjustment_evidence_kind
          : null,
      adjustmentEvidenceValue: r.adjustment_evidence_value,
      respondedAt: r.responded_at,
      respondedByAppUserId: r.responded_by_app_user_id,
      responsavelAppUserId: r.responsavel_app_user_id,
      responsavel: r.responsavel_app_user_id ? dueExtraUserMap.get(r.responsavel_app_user_id) : undefined,
      respondedBy: r.responded_by_app_user_id ? dueExtraUserMap.get(r.responded_by_app_user_id) : undefined,
    }));
  }

  const defIds = [...new Set((fvRows ?? []).map((r) => r.field_definition_id))];
  let pipelineFields: LeadDetailData["pipelineFields"] = [];

  if (defIds.length > 0) {
    const { data: defRows, error: defErr } = await supabase
      .from("field_definitions")
      .select("id, field_code, label, field_type, sort_order, field_options, condition_json")
      .in("id", defIds)
      .eq("entity_name", "oportunidade");

    if (defErr) throw defErr;

    const valueByDefId = new Map(
      (fvRows ?? []).map((r) => [r.field_definition_id, r.value_json]),
    );

    pipelineFields = (defRows ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((d) => ({
        definitionId: d.id,
        fieldCode: d.field_code,
        label: d.label,
        fieldType: d.field_type,
        fieldOptions: fieldOptionsFromDb(d.field_options),
        conditionJson: d.condition_json ?? null,
        value: valueJsonToDisplayString(valueByDefId.get(d.id)),
      }));
  }

  const filledFieldsMerged = mergeFilledFieldsWithCrmOverrides(
    extractFilledFields(reconciliation?.detalhes),
    data.crm_rd_field_overrides,
  );

  const userIdsToResolve = new Set<string>();
  for (const f of filledFieldsMerged) {
    if (isRdFieldAppUserKey(f.key) && looksLikeUuid(f.value)) {
      userIdsToResolve.add(f.value.trim());
    }
  }
  for (const p of pipelineFields) {
    if (p.fieldType === "user" && looksLikeUuid(p.value)) {
      userIdsToResolve.add(p.value.trim());
    }
  }
  for (const task of dueTaskRows ?? []) {
    if (task.responsavel_app_user_id) {
      userIdsToResolve.add(task.responsavel_app_user_id);
    }
  }

  const appUserMap = await fetchAppUsersByIds(supabase, [...userIdsToResolve]);

  const filledFieldsResolved = filledFieldsMerged.map((f) => ({
    ...f,
    resolvedUser:
      isRdFieldAppUserKey(f.key) && looksLikeUuid(f.value)
        ? appUserMap.get(f.value.trim())
        : undefined,
  }));

  const pipelineFieldsResolved = pipelineFields.map((p) => ({
    ...p,
    resolvedUser:
      p.fieldType === "user" && looksLikeUuid(p.value)
        ? appUserMap.get(p.value.trim())
        : undefined,
  }));

  const dueAreaTasks: LeadDetailData["dueAreaTasks"] = (dueTaskRows ?? []).map((task) => ({
    id: task.id,
    areaKey: task.area_key,
    status: task.status as "pendente" | "em_andamento" | "disponibilizado",
    prazoAte: task.prazo_ate,
    pastaDueConfirmada: Boolean(task.pasta_due_confirmada),
    semProcessosAtivos: Boolean(task.sem_processos_ativos),
    observacaoSemProcessos: task.observacao_sem_processos,
    iniciadoEm: task.iniciado_em,
    dadosDisponibilizadosEm: task.dados_disponibilizados_em,
    responsavelAppUserId: task.responsavel_app_user_id,
    responsavel: task.responsavel_app_user_id
      ? appUserMap.get(task.responsavel_app_user_id)
      : undefined,
  }));

  const { data: escopoDefRows, error: escopoDefErr } = await supabase
    .from("field_definitions")
    .select("id")
    .eq("entity_name", "oportunidade")
    .eq("field_code", "cp_escopo_detalhe_json")
    .eq("pipeline_code", "vendas")
    .eq("stage_code", "confeccao_proposta")
    .order("id", { ascending: true })
    .limit(1);

  if (escopoDefErr) throw escopoDefErr;

  const escopoDefRow = escopoDefRows?.[0];

  let escopoDetalhe: LeadDetailData["escopoDetalhe"] = null;
  if (escopoDefRow?.id) {
    const rawFv = (fvRows ?? []).find((r) => r.field_definition_id === escopoDefRow.id);
    escopoDetalhe = {
      definitionId: escopoDefRow.id,
      value: rawFv ? valueJsonToDisplayString(rawFv.value_json) : "",
    };
  }

  const d4signDocumentUuid =
    data.d4sign_document_uuid != null && String(data.d4sign_document_uuid).trim() !== ""
      ? String(data.d4sign_document_uuid).trim()
      : null;
  const d4signStatus =
    data.d4sign_status != null && String(data.d4sign_status).trim() !== ""
      ? String(data.d4sign_status).trim()
      : null;
  const d4signUpdatedAt =
    data.d4sign_updated_at != null && String(data.d4sign_updated_at).trim() !== ""
      ? String(data.d4sign_updated_at).trim()
      : null;

  let escopoSolicitacoes: LeadDetailData["escopoSolicitacoes"] = null;
  if (etapa === "confeccao_proposta") {
    const { data: solRows, error: solErr } = await supabase
      .from("proposta_escopo_solicitacao")
      .select("area_key, concluido_em, notificado_em, prazo_ate, gestor_app_user_id, preenchido_por_app_user_id")
      .eq("oportunidade_id", id)
      .order("area_key", { ascending: true });
    if (solErr) throw solErr;
    const gestoresMap = await fetchAppUsersByIds(
      supabase,
      [
        ...new Set(
          (solRows ?? [])
            .flatMap((r) => [r.gestor_app_user_id, r.preenchido_por_app_user_id])
            .filter((id): id is string => Boolean(id)),
        ),
      ],
    );
    const responsaveisByArea = new Map<string, Array<ResolvedAppUser & { id: string }>>();
    for (const areaKey of [...new Set((solRows ?? []).map((r) => r.area_key).filter(Boolean))]) {
      const { data: users } = await supabase
        .from("app_users")
        .select("id, full_name, avatar_url, area")
        .eq("role", "comercial")
        .in("area", appUserAreaCandidatesForScopeKey(areaKey))
        .order("full_name", { ascending: true });
      responsaveisByArea.set(
        normalizePracticeAreaKey(areaKey),
        (users ?? []).map((u) => ({
          id: u.id,
          fullName: u.full_name,
          avatarUrl: u.avatar_url,
        })),
      );
    }
    escopoSolicitacoes = (solRows ?? []).map((r) => ({
      areaKey: r.area_key,
      concluidoEm: r.concluido_em,
      notificadoEm: r.notificado_em,
      prazoAte: r.prazo_ate,
      gestor: r.gestor_app_user_id ? gestoresMap.get(r.gestor_app_user_id) : undefined,
      preenchidoPor: r.preenchido_por_app_user_id
        ? gestoresMap.get(r.preenchido_por_app_user_id)
        : undefined,
      responsaveis: responsaveisByArea.get(normalizePracticeAreaKey(r.area_key)) ?? [],
    }));
  }

  const lifecycleTimeline = await fetchLeadLifecycleTimeline(supabase, id);

  return {
    id: data.id,
    clienteId: data.cliente_id ?? undefined,
    contratoBaseId: data.contrato_base_id ?? undefined,
    tipo: data.tipo,
    etapa,
    haveraDueDiligence: data.havera_due_diligence,
    solicitante: data.solicitante_nome,
    criadoEm: data.created_at,
    atualizadoEm: data.updated_at,
    d4signDocumentUuid,
    d4signStatus,
    d4signUpdatedAt,
    d4signSigners: Array.isArray(data.d4sign_signers)
      ? (data.d4sign_signers as Oportunidade["d4signSigners"])
      : null,
    solicitanteEmail,
    linkProposta: data.link_proposta?.toString().trim()
      ? data.link_proposta.toString().trim()
      : null,
    linkContrato: data.link_contrato?.toString().trim()
      ? data.link_contrato.toString().trim()
      : null,
    ...(encerramento ? { encerramento } : {}),
    rdDealId,
    rdDealUrl,
    isSystemCreated: Boolean(intake),
    intakeFields,
    empresasIntake,
    filledFields: filledFieldsResolved,
    pipelineFields: pipelineFieldsResolved,
    escopoDetalhe,
    escopoSolicitacoes,
    dueAreaTasks,
    dueRevisionCycle,
    dueCompilacaoEntradaEm: data.due_compilacao_entrada_em,
    dueRevisaoEntradaEm: data.due_revisao_entrada_em,
    dueDocuments,
    dueAreaReviewTasks,
    lifecycleTimeline,
  };
}

async function getAppUsersByEmail(): Promise<Record<string, { avatarUrl: string | null; fullName: string }>> {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: appUsers }, { data: authData }] = await Promise.all([
      supabase.from("app_users").select("auth_user_id, full_name, avatar_url"),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const map: Record<string, { avatarUrl: string | null; fullName: string }> = {};
    for (const u of appUsers ?? []) {
      const email = emailById.get(u.auth_user_id)?.toLowerCase();
      if (email) map[email] = { avatarUrl: u.avatar_url ?? null, fullName: u.full_name };
    }
    return map;
  } catch {
    return {};
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);

  const authSupabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  const [lead, appUsersByEmail] = await Promise.all([
    getLeadById(id),
    getAppUsersByEmail(),
  ]);

  let viewer: LeadDetailViewer | null = null;
  if (user) {
    const { data: au } = await authSupabase
      .from("app_users")
      .select("id, role, area")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (au?.id) {
      const ar = au.area != null ? String(au.area).trim() : "";
      viewer = {
        appUserId: au.id,
        role: String(au.role ?? ""),
        area: ar ? ar : null,
      };
    }
  }

  return <LeadDetailView lead={lead} viewer={viewer} appUsersByEmail={appUsersByEmail} />;
}
