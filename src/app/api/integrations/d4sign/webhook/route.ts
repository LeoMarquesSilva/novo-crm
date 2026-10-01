/**
 * POST /api/integrations/d4sign/webhook — POSTback da D4Sign (1.0 e 2.0).
 *
 * O Webhook 2.0 é cadastrado no cofre inteiro (`ensureSafeWebhookV2`) e manda
 * JSON; o 1.0 manda form-data. `readD4SignWebhookRequest` lê os dois.
 *
 * Confiança: com `D4SIGN_WEBHOOK_HMAC_SECRET` e cabeçalho `Content-Hmac`
 * válido, o evento é aplicado (signatários, status, notificações). Cabeçalho
 * presente e inválido → 401. Sem cabeçalho (ou sem segredo configurado) o
 * evento só é registrado e o documento volta para o topo da fila de
 * signatários — um POST forjado não altera dados, só antecipa uma consulta.
 *
 * Documento que não está no catálogo (criado direto na D4Sign) é criado aqui,
 * em vez de falhar e esperar o próximo sync.
 *
 * Os campos de controle do evento (`processing_status`…) dependem da
 * migration `20260727170000_harden_webhooks`; a gravação deles é best-effort.
 */
import { NextResponse } from "next/server";
import { estimateD4SignCreatedAt } from "@/lib/d4sign/created-at-estimate";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { normalizeFirmSigner } from "@/lib/d4sign/firm-signers";
import { verifyD4SignContentHmac } from "@/lib/d4sign/webhook-hmac";
import {
  applyWebhookToSigners,
  readD4SignWebhookRequest,
  type StoredWebhookSigner,
} from "@/lib/d4sign/webhook-payload";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  isAllowedD4SignTypePost,
  isPayloadLengthAllowed,
} from "@/lib/webhooks/security";
import {
  fetchLeadStakeholderContext,
  notifyLeadStakeholdersInApp,
  resolveLeadStakeholderAuthUserIds,
} from "@/lib/crm/notify-lead-stakeholders";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const TYPE_POST_TO_STATUS_NAME: Record<string, string> = {
  "1": "Finalizado",
  "2": "E-mail não entregue",
  "3": "Cancelado",
  "4": "Assinando",
};

/** Mapeia type_post do webhook → d4sign_status interno. */
const TYPE_POST_TO_D4SIGN_STATUS: Record<string, string> = {
  "1": "1",
  "2": "3",
  "3": "4",
  "4": "3",
};

/** Status que um evento de assinatura/bounce atrasado não pode desfazer. */
const TERMINAL_STATUSES = new Set(["1", "4", "6"]);

/** Insere notificações in-app para todos os usuários admin/comercial. */
async function notifyAdminComercial(
  admin: Admin,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: users } = await admin
    .from("app_users")
    .select("auth_user_id")
    .in("role", ["admin", "comercial"])
    .not("auth_user_id", "is", null);

  if (!users || users.length === 0) return;

  await admin.from("crm_in_app_notifications").insert(
    users.map((u) => ({
      user_id: u.auth_user_id as string,
      tipo,
      payload: payload as never,
    })),
  );
}

/** Controle do evento; não derruba o webhook se as colunas não existirem. */
async function markEvent(
  admin: Admin,
  eventId: string | null,
  patch: { processing_status: "processed" | "failed"; last_error?: string | null },
): Promise<void> {
  if (!eventId) return;
  const { error } = await admin
    .from("d4sign_webhook_events")
    .update({
      processing_status: patch.processing_status,
      processed_at: patch.processing_status === "processed" ? new Date().toISOString() : null,
      last_error: patch.last_error ?? null,
    })
    .eq("id", eventId);
  if (error) console.warn("[D4Sign webhook] controle do evento não gravado", error.message);
}

async function failWebhookProcessing(
  admin: Admin,
  eventId: string | null,
  context: string,
  error: unknown,
) {
  console.error(context, error);
  await markEvent(admin, eventId, { processing_status: "failed", last_error: context.slice(0, 500) });
  return NextResponse.json(
    { ok: false, error: "Falha temporária ao processar o webhook." },
    { status: 503, headers: { "Retry-After": "10" } },
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isPayloadLengthAllowed(request.headers.get("content-length"), 256_000)) {
    return NextResponse.json(
      { ok: false, error: "Payload excede o limite permitido." },
      { status: 413 },
    );
  }

  const event = await readD4SignWebhookRequest(request);
  if (!event) {
    return NextResponse.json(
      { ok: false, error: "Body inválido: esperado JSON (2.0) ou form-data (1.0) com uuid e type_post." },
      { status: 400 },
    );
  }
  if (!isAllowedD4SignTypePost(event.typePost)) {
    return NextResponse.json({ ok: false, error: "Tipo de evento não suportado." }, { status: 400 });
  }

  const hmacSecret = process.env.D4SIGN_WEBHOOK_HMAC_SECRET?.trim();
  const contentHmac = request.headers.get("Content-Hmac");
  if (hmacSecret && contentHmac && !verifyD4SignContentHmac(event.uuid, hmacSecret, contentHmac)) {
    return NextResponse.json({ ok: false, error: "Assinatura HMAC inválida." }, { status: 401 });
  }
  const trusted = Boolean(hmacSecret && contentHmac);

  const documentUuid = event.uuid;
  const typePost = event.typePost;
  const signerEmail = event.signerEmail;
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Registra evento (idempotência pelo índice único quando existir)
  const { data: insertedEvent, error: insertError } = await admin
    .from("d4sign_webhook_events")
    .insert({
      document_uuid: documentUuid,
      type_post: typePost,
      signer_email: signerEmail,
      raw_payload: {
        ...event.raw,
        _crm: { version: event.version, hmac: trusted ? "valid" : contentHmac ? "invalid" : "missing" },
      } as never,
    })
    .select("id")
    .single();
  let eventId = insertedEvent?.id ?? null;
  if (insertError) {
    if ((insertError as { code?: string }).code !== "23505") {
      console.error("Falha ao registrar webhook D4Sign", insertError);
      return NextResponse.json(
        { ok: false, error: "Falha temporária ao registrar o webhook." },
        { status: 503, headers: { "Retry-After": "10" } },
      );
    }
    let duplicateQuery = admin
      .from("d4sign_webhook_events")
      .select("id, processing_status")
      .eq("document_uuid", documentUuid)
      .eq("type_post", typePost);
    duplicateQuery = signerEmail
      ? duplicateQuery.ilike("signer_email", signerEmail)
      : duplicateQuery.is("signer_email", null);
    const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
    // Sem a coluna de controle não dá para saber se terminou: trata como já processado.
    if (duplicateError || !duplicate || duplicate.processing_status === "processed") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    eventId = duplicate.id;
  }

  // 2. Documento no catálogo
  const { data: d4doc, error: documentError } = await admin
    .from("d4sign_documents")
    .select("signers, oportunidade_id, name_document, safe_name, d4sign_status")
    .eq("uuid_doc", documentUuid)
    .maybeSingle();
  if (documentError) {
    return failWebhookProcessing(admin, eventId, "Falha ao buscar documento D4Sign", documentError);
  }

  // Evento sem HMAC: não altera dados; só antecipa a busca de signatários.
  if (!trusted) {
    if (d4doc) {
      await admin
        .from("d4sign_documents")
        .update({ details_fetched_at: null, updated_at: nowIso })
        .eq("uuid_doc", documentUuid);
    }
    await markEvent(admin, eventId, { processing_status: "processed", last_error: "sem HMAC: só reenfileirado" });
    return NextResponse.json({ ok: true, trusted: false, queued: Boolean(d4doc) }, { status: 202 });
  }

  const oportunidadeId = d4doc?.oportunidade_id ?? null;
  const documentName = d4doc?.name_document ?? event.documentName;

  const { data: opp, error: opportunityError } = oportunidadeId
    ? await admin
        .from("oportunidades")
        .select("id, etapa, solicitante_nome, d4sign_signers, criado_por, solicitante_email")
        .eq("id", oportunidadeId)
        .maybeSingle()
    : { data: null, error: null };
  if (opportunityError) {
    return failWebhookProcessing(admin, eventId, "Falha ao buscar oportunidade do documento D4Sign", opportunityError);
  }

  const currentStatus = d4doc?.d4sign_status ?? null;
  const eventStatus = TYPE_POST_TO_D4SIGN_STATUS[typePost] ?? typePost;
  // Assinatura ou bounce que chega depois da finalização não reabre o documento.
  const d4signStatus =
    (typePost === "2" || typePost === "4") && currentStatus && TERMINAL_STATUSES.has(currentStatus)
      ? currentStatus
      : eventStatus;

  // 3. Status na oportunidade vinculada
  if (oportunidadeId && d4signStatus !== currentStatus) {
    const { error: statusUpdateError } = await admin
      .from("oportunidades")
      .update({ d4sign_status: d4signStatus, d4sign_updated_at: nowIso, updated_at: nowIso } as never)
      .eq("d4sign_document_uuid", documentUuid);
    if (statusUpdateError) {
      return failWebhookProcessing(admin, eventId, "Falha ao atualizar status D4Sign da oportunidade", statusUpdateError);
    }
  }

  // 4. Signatários
  const currentSigners = ((d4doc?.signers ?? []) as StoredWebhookSigner[]).filter(
    (s) => s && typeof s.email === "string",
  );
  const applied = applyWebhookToSigners(currentSigners, event, nowIso);
  const updatedSigners = applied.signers.map(normalizeFirmSigner);
  const finalizedAt = applied.finalizedAt;
  const docNome = documentName?.replace(/\.(docx?|pdf)$/i, "") ?? documentUuid;
  const leadNome = opp?.solicitante_nome ?? "Lead";
  const path = opp ? `/crm/leads/${opp.id}` : "/crm/contratos";

  // ── E-mail não entregue (type_post "2") ───────────────────────────────────
  if (typePost === "2" && signerEmail) {
    const reason = updatedSigners.find((s) => s.email.toLowerCase() === signerEmail.toLowerCase())
      ?.email_sent_status;
    await notifyAdminComercial(admin, "contrato_email_bounce", {
      uuid_doc: documentUuid,
      name_document: documentName ?? documentUuid,
      signer_email: signerEmail,
      title: "E-mail de contrato não entregue",
      preview: `Falha ao enviar o contrato para ${signerEmail}${reason && reason !== "Bounce" ? ` (${reason})` : ""}.`,
      path: "/crm/contratos",
    });
  }

  // ── Signatário assinou (type_post "4") ────────────────────────────────────
  if (typePost === "4" && signerEmail) {
    if (opp) {
      const oppSigners = applyWebhookToSigners(
        ((opp.d4sign_signers ?? []) as StoredWebhookSigner[]).filter((s) => s && typeof s.email === "string"),
        event,
        nowIso,
      ).signers.map(normalizeFirmSigner);
      const { error: signerUpdateError } = await admin
        .from("oportunidades")
        .update({
          d4sign_signers: oppSigners as never,
          d4sign_updated_at: nowIso,
          updated_at: nowIso,
        } as never)
        .eq("id", opp.id);
      if (signerUpdateError) {
        return failWebhookProcessing(admin, eventId, "Falha ao atualizar signatário da oportunidade", signerUpdateError);
      }
    }

    // Notificação de assinatura parcial (se houver mais de 1 signer)
    if (updatedSigners.length > 1) {
      const signed = updatedSigners.filter((s) => s.signed).length;
      const total = updatedSigners.length;
      await notifyAdminComercial(admin, "contrato_parcialmente_assinado", {
        oportunidade_id: oportunidadeId,
        solicitante_nome: leadNome,
        uuid_doc: documentUuid,
        name_document: docNome,
        signer_email: signerEmail,
        signed_count: signed,
        total_signers: total,
        title: `${leadNome} — ${signed}/${total} assinaram`,
        preview: `${signerEmail} assinou o contrato. Aguardando ${total - signed} signatário(s).`,
        path,
      });
    }
  }

  // ── Documento finalizado (todos assinaram) ───────────────────────────────
  if (typePost === "1" && opp) {
    const { data: transitionId, error: finalizeError } = await admin.rpc(
      "finalize_d4sign_opportunity",
      {
        p_opportunity_id: opp.id,
        p_signers: updatedSigners as never,
        p_now: nowIso,
      },
    );
    if (finalizeError) {
      return failWebhookProcessing(admin, eventId, "Falha ao finalizar oportunidade via D4Sign", finalizeError);
    }

    if (transitionId) {
      await recordLeadActivityEvent(admin, {
        oportunidadeId: opp.id,
        kind: "contrato_assinado",
        title: `Contrato assinado — ${docNome}`,
        detail: "Documento finalizado via D4Sign (todos os signatários).",
        etapa: "contrato_assinado",
        sourceId: `trans:${transitionId}`,
        metadata: { document_uuid: documentUuid, transition_id: transitionId },
      });
    }

    const stakeholderCtx = await fetchLeadStakeholderContext(admin, opp.id);
    const stakeholderAuthIds = await resolveLeadStakeholderAuthUserIds(admin, stakeholderCtx);
    await notifyLeadStakeholdersInApp(admin, stakeholderAuthIds, "contrato_assinado", {
      oportunidade_id: oportunidadeId,
      solicitante_nome: leadNome,
      uuid_doc: documentUuid,
      name_document: docNome,
      signer_email: signerEmail,
      title: `Contrato assinado — ${leadNome}`,
      preview: `O documento "${docNome}" foi assinado por todos os signatários.`,
      path,
    });
    // E-mail desligado por enquanto — apenas notificação in-app para envolvidos do lead.
  }

  // ── Documento cancelado (type_post "3") ─────────────────────────────────
  if (typePost === "3") {
    await notifyAdminComercial(admin, "contrato_cancelado", {
      oportunidade_id: oportunidadeId,
      solicitante_nome: leadNome,
      uuid_doc: documentUuid,
      name_document: docNome,
      title: `Contrato cancelado — ${leadNome}`,
      preview: event.cancellationMessage
        ? `O documento "${docNome}" foi cancelado na D4Sign: ${event.cancellationMessage}`
        : `O documento "${docNome}" foi cancelado na D4Sign.`,
      path,
    });
  }

  // 5. Persiste no catálogo (cria o documento se ainda não existia)
  const { error: documentUpdateError } = await admin
    .from("d4sign_documents")
    .upsert(
      {
        uuid_doc: documentUuid,
        d4sign_status: d4signStatus,
        // Evento atrasado sobre documento já encerrado não troca o nome do status.
        ...(d4signStatus === eventStatus ? { status_name: TYPE_POST_TO_STATUS_NAME[typePost] } : {}),
        signers: updatedSigners as never,
        last_synced_at: nowIso,
        updated_at: nowIso,
        ...(finalizedAt ? { finalized_at: finalizedAt } : {}),
        ...(typePost === "3" && event.cancellationMessage ? { status_comment: event.cancellationMessage } : {}),
        // Finalização do 2.0 traz a lista completa: dispensa o GET /list.
        ...(typePost === "1" && event.signers?.length ? { details_fetched_at: nowIso } : {}),
        ...(d4doc
          ? {}
          : {
              name_document: event.documentName,
              ...(getD4SignEnv().safeUuid ? { safe_uuid: getD4SignEnv().safeUuid } : {}),
              created_at_d4sign: estimateD4SignCreatedAt(documentUuid, event.documentName),
            }),
      },
      { onConflict: "uuid_doc", ignoreDuplicates: false },
    );
  if (documentUpdateError) {
    return failWebhookProcessing(admin, eventId, "Falha ao persistir documento após webhook D4Sign", documentUpdateError);
  }

  await markEvent(admin, eventId, { processing_status: "processed" });
  return NextResponse.json({ ok: true, created: !d4doc });
}
