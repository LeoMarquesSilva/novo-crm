import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  planContractDailyWork,
  saoPauloDateFromInstant,
  type ContractDailyPlanningRow,
} from "@/modules/contracts/application/services/generate-contract-alerts";

export const maxDuration = 120;

function isAuthorized(request: Request, secret: string) {
  return request.headers.get("authorization") === `Bearer ${secret}`
    || request.headers.get("x-cron-secret") === secret;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 8) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET ausente ou fraco." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const today = saoPauloDateFromInstant(new Date());
  const { data: contracts, error: contractsError } = await supabase
    .from("contratos")
    .select("id, oportunidade_id, titulo, status, vigente_de, vigente_ate, prazo_indeterminado, primeiro_vencimento, dia_vencimento, antecedencia_faturamento_dias, data_base_renovacao, data_alerta_renovacao, versao_ativa_id")
    .in("status", ["rascunho", "em_revisao", "ativo"]);
  if (contractsError) throw contractsError;

  const contractIds = (contracts ?? []).map((contract) => contract.id);
  const opportunityIds = (contracts ?? []).flatMap((contract) => contract.oportunidade_id ? [contract.oportunidade_id] : []);
  const [{ data: responsibles, error: responsiblesError }, { data: controladoria, error: usersError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
    contractIds.length
      ? supabase.from("contrato_responsaveis").select("contrato_id, papel, app_user_id").in("contrato_id", contractIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("app_users").select("id, auth_user_id").in("role", ["controladoria", "admin"]).not("auth_user_id", "is", null),
    opportunityIds.length
      ? supabase.from("oportunidades").select("id, etapa").in("id", opportunityIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const lookupError = responsiblesError ?? usersError ?? opportunitiesError;
  if (lookupError) throw lookupError;

  const allAssigneeIds = [...new Set([
    ...(responsibles ?? []).flatMap((item) => item.app_user_id ? [item.app_user_id] : []),
    ...(controladoria ?? []).map((item) => item.id),
  ])];
  const { data: assigneeUsers, error: assigneeError } = allAssigneeIds.length
    ? await supabase.from("app_users").select("id, auth_user_id").in("id", allAssigneeIds)
    : { data: [], error: null };
  if (assigneeError) throw assigneeError;
  const authByAppUser = new Map((assigneeUsers ?? []).map((user) => [user.id, user.auth_user_id]));
  const fallbackUsers = controladoria ?? [];
  const stageByOpportunity = new Map((opportunities ?? []).map((opportunity) => [opportunity.id, opportunity.etapa]));
  const responsibleFor = (contractId: string, pattern: RegExp) =>
    (responsibles ?? []).find((item) => item.contrato_id === contractId && pattern.test(item.papel))?.app_user_id ?? null;

  const planningRows: ContractDailyPlanningRow[] = (contracts ?? []).map((contract) => ({
    id: contract.id,
    lifecycle: contract.status,
    startsAt: contract.vigente_de,
    endsAt: contract.vigente_ate,
    indefinite: contract.prazo_indeterminado,
    firstDueDate: contract.primeiro_vencimento,
    dueDay: contract.dia_vencimento,
    closingLeadDays: contract.antecedencia_faturamento_dias,
    renewalDate: contract.data_base_renovacao,
    renewalAlertDate: contract.data_alerta_renovacao,
    operationalResponsibleId: responsibleFor(contract.id, /operacional|faturamento/i),
    renewalResponsibleId: responsibleFor(contract.id, /renova|gestor/i),
    opportunityStage: contract.oportunidade_id ? stageByOpportunity.get(contract.oportunidade_id) ?? null : null,
  }));
  const planned = planContractDailyWork({ today, contracts: planningRows });
  const titleByContract = new Map((contracts ?? []).map((contract) => [contract.id, contract.titulo]));
  const errors: Array<{ contractId: string; error: string }> = [];
  let alertsCreated = 0;
  let closingsCreated = 0;
  let notificationsCreated = 0;

  async function notify(contractId: string, type: string, idempotencyKey: string, assigneeId: string | null, preview: string) {
    const assignedAuth = assigneeId ? authByAppUser.get(assigneeId) : null;
    const recipients = assignedAuth
      ? [assignedAuth]
      : fallbackUsers.flatMap((user) => user.auth_user_id ? [user.auth_user_id] : []);
    for (const userId of recipients) {
      const { count, error: lookupError } = await supabase
        .from("crm_in_app_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .contains("payload", { idempotency_key: idempotencyKey });
      if (lookupError) throw lookupError;
      if ((count ?? 0) > 0) continue;
      const { error } = await supabase.from("crm_in_app_notifications").insert({
        user_id: userId,
        tipo: type,
        payload: {
          title: titleByContract.get(contractId) ?? "Contrato",
          preview,
          path: `/crm/contratos/${contractId}`,
          contrato_id: contractId,
          idempotency_key: idempotencyKey,
        },
      });
      if (error) throw error;
      notificationsCreated += 1;
    }
  }

  for (const intent of planned.alerts) {
    const assigneeId = intent.assigneeId ?? fallbackUsers[0]?.id ?? null;
    try {
      const { error } = await supabase.from("contrato_alertas").upsert({
        contrato_id: intent.contractId,
        tipo: intent.type,
        data_base: intent.baseDate,
        data_vencimento: intent.dueDate,
        responsavel_app_user_id: assigneeId,
        idempotency_key: intent.idempotencyKey,
      }, { onConflict: "idempotency_key" });
      if (error) throw error;
      alertsCreated += 1;
    } catch (error) {
      errors.push({ contractId: intent.contractId, error: error instanceof Error ? error.message : "Falha ao criar alerta." });
    }
    try {
      await notify(intent.contractId, intent.type, intent.idempotencyKey, assigneeId, intent.type === "contrato_renovacao_pendente" ? `Renovação prevista para ${intent.dueDate}.` : "Implantação financeira pendente.");
    } catch (error) {
      errors.push({ contractId: intent.contractId, error: error instanceof Error ? error.message : "Falha ao reconciliar notificação." });
    }
  }

  for (const intent of planned.closings) {
    const contract = (contracts ?? []).find((item) => item.id === intent.contractId);
    let closing: { id: string } | null = null;
    try {
      if (!contract?.versao_ativa_id) throw new Error("Contrato ativo sem versão ativa.");
      const { data, error: closingError } = await supabase.from("contrato_fechamentos").upsert({
        contrato_id: intent.contractId,
        competencia: intent.competency,
        versao_id: contract.versao_ativa_id,
      }, { onConflict: "contrato_id,competencia" }).select("id").single();
      if (closingError) throw closingError;
      closing = data;
      closingsCreated += 1;
    } catch (error) {
      errors.push({ contractId: intent.contractId, error: error instanceof Error ? error.message : "Falha ao criar fechamento." });
      const { data } = await supabase.from("contrato_fechamentos").select("id").eq("contrato_id", intent.contractId).eq("competencia", intent.competency).maybeSingle();
      closing = data;
    }
    if (closing) {
      const assigneeId = intent.assigneeId ?? fallbackUsers[0]?.id ?? null;
      try {
        const { error: alertError } = await supabase.from("contrato_alertas").upsert({
          contrato_id: intent.contractId,
          fechamento_id: closing.id,
          tipo: "contrato_fechamento_pendente",
          data_base: `${intent.competency}-01`,
          data_vencimento: intent.dueDate,
          responsavel_app_user_id: assigneeId,
          idempotency_key: intent.idempotencyKey,
        }, { onConflict: "idempotency_key" });
        if (alertError) throw alertError;
        alertsCreated += 1;
      } catch (error) {
        errors.push({ contractId: intent.contractId, error: error instanceof Error ? error.message : "Falha ao reconciliar alerta de fechamento." });
      }
      try {
        await notify(intent.contractId, "contrato_fechamento_pendente", intent.idempotencyKey, assigneeId, `Preparar fechamento de ${intent.competency}.`);
      } catch (error) {
        errors.push({ contractId: intent.contractId, error: error instanceof Error ? error.message : "Falha ao reconciliar notificação de fechamento." });
      }
    }
  }

  const { data: blockingItems, error: blockingError } = await supabase
    .from("contrato_fechamento_itens")
    .select("id, revisao_id, area_id, bloqueio_tipo, metadados")
    .eq("bloqueante", true)
    .is("resolvido_em", null)
    .in("bloqueio_tipo", ["missing_excess_rate", "missing_unit_rate"]);
  if (blockingError) throw blockingError;
  const revisionIds = [...new Set((blockingItems ?? []).map((item) => item.revisao_id))];
  const { data: revisions, error: revisionsError } = revisionIds.length
    ? await supabase.from("contrato_fechamento_revisoes").select("id, fechamento_id").in("id", revisionIds)
    : { data: [], error: null };
  if (revisionsError) throw revisionsError;
  const closingIds = [...new Set((revisions ?? []).map((revision) => revision.fechamento_id))];
  const { data: itemClosings, error: itemClosingsError } = closingIds.length
    ? await supabase.from("contrato_fechamentos").select("id, contrato_id, competencia").in("id", closingIds)
    : { data: [], error: null };
  if (itemClosingsError) throw itemClosingsError;
  const closingById = new Map((itemClosings ?? []).map((closing) => [closing.id, closing]));
  const revisionToClosing = new Map((revisions ?? []).map((revision) => [revision.id, closingById.get(revision.fechamento_id)]));
  for (const item of blockingItems ?? []) {
    const closing = revisionToClosing.get(item.revisao_id);
    if (!closing) continue;
    const metric = String(asRecord(item.metadados).metric ?? item.bloqueio_tipo ?? "excedente");
    const key = `contract-missing-rate:${closing.contrato_id}:${closing.id}:${item.area_id ?? "sem-area"}:${metric}`;
    const assigneeId = responsibleFor(closing.contrato_id, /operacional|faturamento/i) ?? fallbackUsers[0]?.id ?? null;
    try {
      const { error } = await supabase.from("contrato_alertas").upsert({
        contrato_id: closing.contrato_id,
        fechamento_id: closing.id,
        tipo: "contrato_excedente_sem_preco",
        data_base: `${closing.competencia}-01`,
        data_vencimento: today,
        responsavel_app_user_id: assigneeId,
        idempotency_key: key,
      }, { onConflict: "idempotency_key" });
      if (error) throw error;
      alertsCreated += 1;
    } catch (error) {
      errors.push({ contractId: closing.contrato_id, error: error instanceof Error ? error.message : "Falha ao criar alerta de excedente." });
    }
    try {
      await notify(closing.contrato_id, "contrato_excedente_sem_preco", key, assigneeId, "Excedente sem preço contratual exige decisão.");
    } catch (error) {
      errors.push({ contractId: closing.contrato_id, error: error instanceof Error ? error.message : "Falha ao reconciliar notificação de excedente." });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    today,
    summary: { contracts: contracts?.length ?? 0, closingsCreated, alertsCreated, notificationsCreated, errors },
  }, { status: errors.length ? 207 : 200 });
}

export async function GET(request: Request) {
  try { return await run(request); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha no cron de contratos." }, { status: 500 }); }
}

export async function POST(request: Request) {
  try { return await run(request); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha no cron de contratos." }, { status: 500 }); }
}
