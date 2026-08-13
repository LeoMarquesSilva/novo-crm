import { NextResponse } from "next/server";
import { verifyD4SignContentHmac } from "@/lib/d4sign/webhook-hmac";
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

// ─── Tipos ────────────────────────────────────────────────────────────────────

type D4SignSigner = {
  email: string;
  key_signer: string | null;
  signed: boolean;
  signed_at: string | null;
  email_sent_status?: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formToRecord(form: FormData): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) raw[k] = typeof v === "string" ? v : "";
  return raw;
}

const TYPE_POST_TO_STATUS_NAME: Record<string, string> = {
  "1": "Finalizado",
  "2": "E-mail não entregue",
  "3": "Cancelado",
  "4": "Assinando",
  sent:       "Enviado",
  processing: "Processando",
};

/** Mapeia type_post do webhook → d4sign_status interno. */
const TYPE_POST_TO_D4SIGN_STATUS: Record<string, string> = {
  "1": "1",
  "2": "3",
  "3": "4",
  "4": "3",
};

/** Atualiza o signer matching `email` no array JSONB e retorna o novo array. */
function updateSignerInArray(
  signers: D4SignSigner[],
  email: string,
  patch: Partial<D4SignSigner>,
): D4SignSigner[] {
  const lower = email.toLowerCase();
  return signers.map((s) =>
    s.email.toLowerCase() === lower ? { ...s, ...patch } : s,
  );
}

/** Insere notificações in-app para todos os usuários admin/comercial. */
async function notifyAdminComercial(
  admin: ReturnType<typeof createSupabaseAdminClient>,
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

async function failWebhookProcessing(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  eventId: string,
  context: string,
  error: unknown,
) {
  console.error(context, error);
  await admin
    .from("d4sign_webhook_events")
    .update({
      processing_status: "failed",
      last_error: context.slice(0, 500),
    })
    .eq("id", eventId);

  return NextResponse.json(
    { ok: false, error: "Falha temporária ao processar o webhook." },
    { status: 503, headers: { "Retry-After": "10" } },
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const hmacSecret = process.env.D4SIGN_WEBHOOK_HMAC_SECRET?.trim();
  if (!hmacSecret) {
    return NextResponse.json(
      { ok: false, error: "Webhook temporariamente indisponível." },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }

  if (!isPayloadLengthAllowed(request.headers.get("content-length"), 64_000)) {
    return NextResponse.json(
      { ok: false, error: "Payload excede o limite permitido." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Body inválido (esperado form-data)." }, { status: 400 });
  }

  const documentUuid = String(form.get("uuid")      ?? "").trim();
  const typePost     = String(form.get("type_post")  ?? "").trim();

  if (!documentUuid || !typePost) {
    return NextResponse.json({ ok: false, error: "Campos uuid e type_post são obrigatórios." }, { status: 400 });
  }

  if (!isAllowedD4SignTypePost(typePost)) {
    return NextResponse.json(
      { ok: false, error: "Tipo de evento não suportado." },
      { status: 400 },
    );
  }

  const contentHmac = request.headers.get("Content-Hmac");
  if (!verifyD4SignContentHmac(documentUuid, hmacSecret, contentHmac)) {
    return NextResponse.json({ ok: false, error: "Assinatura HMAC inválida." }, { status: 401 });
  }

  const emailRaw    = form.get("email");
  const signerEmail = emailRaw != null && String(emailRaw).trim() ? String(emailRaw).trim() : null;
  const payload     = formToRecord(form);

  const admin  = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Registra evento
  const { data: insertedEvent, error: insertError } = await admin
    .from("d4sign_webhook_events")
    .insert({
      document_uuid: documentUuid,
      type_post: typePost,
      signer_email: signerEmail,
      raw_payload: payload,
    })
    .select("id")
    .single();
  let eventId = insertedEvent?.id ?? null;
  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505") {
      let duplicateQuery = admin
        .from("d4sign_webhook_events")
        .select("id, processing_status, attempt_count, created_at")
        .eq("document_uuid", documentUuid)
        .eq("type_post", typePost);
      duplicateQuery = signerEmail
        ? duplicateQuery.ilike("signer_email", signerEmail)
        : duplicateQuery.is("signer_email", null);
      const { data: duplicate, error: duplicateError } =
        await duplicateQuery.maybeSingle();
      if (duplicateError || !duplicate) {
        console.error("Falha ao consultar webhook D4Sign duplicado", duplicateError);
        return NextResponse.json(
          { ok: false, error: "Falha temporária ao validar a duplicidade." },
          { status: 503, headers: { "Retry-After": "10" } },
        );
      }
      if (duplicate.processing_status === "processed") {
        return NextResponse.json({ ok: true, duplicate: true });
      }

      const stale =
        Date.now() - new Date(duplicate.created_at).getTime() > 5 * 60_000;
      if (duplicate.processing_status === "processing" && !stale) {
        return NextResponse.json(
          { ok: true, duplicate: true, processing: true },
          { status: 202 },
        );
      }

      const { data: reclaimed, error: reclaimError } = await admin
        .from("d4sign_webhook_events")
        .update({
          processing_status: "processing",
          attempt_count: duplicate.attempt_count + 1,
          last_error: null,
          created_at: nowIso,
        })
        .eq("id", duplicate.id)
        .neq("processing_status", "processed")
        .select("id")
        .maybeSingle();
      if (reclaimError || !reclaimed) {
        return NextResponse.json(
          { ok: true, duplicate: true, processing: true },
          { status: 202 },
        );
      }
      eventId = reclaimed.id;
    } else {
      console.error("Falha ao registrar webhook D4Sign", insertError);
      return NextResponse.json(
        { ok: false, error: "Falha temporária ao registrar o webhook." },
        { status: 503, headers: { "Retry-After": "10" } },
      );
    }
  }
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "Falha temporária ao registrar o webhook." },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }

  // 2. Busca dados atuais do documento + oportunidade vinculada
  const { data: d4doc, error: documentError } = await admin
    .from("d4sign_documents")
    .select("signers, oportunidade_id, name_document, safe_name")
    .eq("uuid_doc", documentUuid)
    .maybeSingle();
  if (documentError) {
    return failWebhookProcessing(
      admin,
      eventId,
      "Falha ao buscar documento D4Sign",
      documentError,
    );
  }
  if (!d4doc) {
    return failWebhookProcessing(
      admin,
      eventId,
      "Documento D4Sign recebido pelo webhook não está no catálogo",
      { documentUuid },
    );
  }

  const { data: opp, error: opportunityError } = d4doc.oportunidade_id
    ? await admin
        .from("oportunidades")
        .select("id, etapa, solicitante_nome, d4sign_signers, criado_por, solicitante_email")
        .eq("id", d4doc.oportunidade_id)
        .maybeSingle()
    : { data: null, error: null };
  if (opportunityError) {
    return failWebhookProcessing(
      admin,
      eventId,
      "Falha ao buscar oportunidade do documento D4Sign",
      opportunityError,
    );
  }

  const currentSigners = (d4doc?.signers ?? []) as D4SignSigner[];

  const d4signStatus = TYPE_POST_TO_D4SIGN_STATUS[typePost] ?? typePost;

  // 3. Atualiza status em oportunidades (se vinculada)
  if (d4doc.oportunidade_id) {
    const { error: statusUpdateError } = await admin
      .from("oportunidades")
      .update({ d4sign_status: d4signStatus, d4sign_updated_at: nowIso, updated_at: nowIso } as never)
      .eq("d4sign_document_uuid", documentUuid);
    if (statusUpdateError) {
      return failWebhookProcessing(
        admin,
        eventId,
        "Falha ao atualizar status D4Sign da oportunidade",
        statusUpdateError,
      );
    }
  }

  // 4. Lógica por tipo de evento (type_post oficial D4Sign)
  let updatedSigners = currentSigners;
  let finalizedAtForDoc: string | undefined;
  let finalizedTransitionId: string | null = null;

  // ── E-mail não entregue (type_post "2") ───────────────────────────────────
  if (typePost === "2" && signerEmail) {
    updatedSigners = updateSignerInArray(currentSigners, signerEmail, {
      email_sent_status: "Bounce",
    });
    await notifyAdminComercial(admin, "contrato_email_bounce", {
      uuid_doc: documentUuid,
      name_document: d4doc?.name_document ?? documentUuid,
      signer_email: signerEmail,
      title: "E-mail de contrato não entregue",
      preview: `Bounce ao enviar contrato para ${signerEmail}.`,
      path: "/crm/contratos",
    });
  }

  // ── Signatário assinou (type_post "4") ────────────────────────────────────
  if (typePost === "4" && signerEmail) {
    updatedSigners = updateSignerInArray(currentSigners, signerEmail, {
      signed: true,
      signed_at: nowIso,
    });

    // Atualiza d4sign_signers em oportunidades também
    if (opp) {
      const oppSigners = updateSignerInArray(
        (opp.d4sign_signers ?? []) as D4SignSigner[],
        signerEmail,
        { signed: true, signed_at: nowIso },
      );
      const { error: signerUpdateError } = await admin
        .from("oportunidades")
        .update({
          d4sign_signers: oppSigners as never,
          d4sign_updated_at: nowIso,
          updated_at: nowIso,
        } as never)
        .eq("id", opp.id);
      if (signerUpdateError) {
        return failWebhookProcessing(
          admin,
          eventId,
          "Falha ao atualizar signatário da oportunidade",
          signerUpdateError,
        );
      }
    }

    // Notificação de assinatura parcial (se houver mais de 1 signer)
    if (currentSigners.length > 1) {
      const signed   = updatedSigners.filter((s) => s.signed).length;
      const total    = updatedSigners.length;
      const leadNome = opp?.solicitante_nome ?? "Lead";
      const docNome  = d4doc?.name_document?.replace(/\.docx?$/i, "") ?? documentUuid;
      await notifyAdminComercial(admin, "contrato_parcialmente_assinado", {
        oportunidade_id: d4doc?.oportunidade_id ?? null,
        solicitante_nome: leadNome,
        uuid_doc: documentUuid,
        name_document: docNome,
        signer_email: signerEmail,
        signed_count: signed,
        total_signers: total,
        title:   `${leadNome} — ${signed}/${total} assinaram`,
        preview: `${signerEmail} assinou o contrato. Aguardando ${total - signed} signatário(s).`,
        path:    opp ? `/crm/leads/${opp.id}` : "/crm/contratos",
      });
    }
  }

  // ── Documento finalizado (todos assinaram) ───────────────────────────────
  if (typePost === "1") {
    // Marca todos como assinados; finalized_at = última assinatura conhecida
    const signedDates = currentSigners
      .map((s) => s.signed_at)
      .filter((d): d is string => Boolean(d));
    const docFinalizedAt =
      signedDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? nowIso;
    finalizedAtForDoc = docFinalizedAt;

    updatedSigners = currentSigners.map((s) => ({
      ...s,
      signed: true,
      signed_at: s.signed_at ?? nowIso,
    }));

    if (opp) {
      const { data: transitionId, error: finalizeError } = await admin.rpc(
        "finalize_d4sign_opportunity",
        {
          p_opportunity_id: opp.id,
          p_signers: updatedSigners as never,
          p_now: nowIso,
        },
      );
      if (finalizeError) {
        return failWebhookProcessing(
          admin,
          eventId,
          "Falha ao finalizar oportunidade via D4Sign",
          finalizeError,
        );
      }
      finalizedTransitionId = transitionId;
    }

    if (opp && finalizedTransitionId) {
      await recordLeadActivityEvent(admin, {
        oportunidadeId: opp.id,
        kind: "contrato_assinado",
        title: `Contrato assinado — ${d4doc?.name_document?.replace(/\.docx?$/i, "") ?? "Documento"}`,
        detail: "Documento finalizado via D4Sign (todos os signatários).",
        etapa: "contrato_assinado",
        sourceId: `trans:${finalizedTransitionId}`,
        metadata: {
          document_uuid: documentUuid,
          transition_id: finalizedTransitionId,
        },
      });
    }

    // Notificação in-app
    const leadNome = opp?.solicitante_nome ?? "Lead";
    const docNome  = d4doc?.name_document?.replace(/\.docx?$/i, "") ?? documentUuid;
    const path     = opp ? `/crm/leads/${opp.id}` : "/crm/contratos";

    if (opp?.id) {
      const stakeholderCtx = await fetchLeadStakeholderContext(admin, opp.id);
      const stakeholderAuthIds = await resolveLeadStakeholderAuthUserIds(admin, stakeholderCtx);
      await notifyLeadStakeholdersInApp(admin, stakeholderAuthIds, "contrato_assinado", {
        oportunidade_id: d4doc?.oportunidade_id ?? null,
        solicitante_nome: leadNome,
        uuid_doc: documentUuid,
        name_document: docNome,
        signer_email: signerEmail,
        title: `Contrato assinado — ${leadNome}`,
        preview: `O documento "${docNome}" foi assinado por todos os signatários.`,
        path,
      });
    }

    // E-mail desligado por enquanto — apenas notificação in-app para envolvidos do lead.
  }

  // ── Documento cancelado (type_post "3") ─────────────────────────────────
  if (typePost === "3") {
    const leadNome = opp?.solicitante_nome ?? "Lead";
    const docNome  = d4doc?.name_document?.replace(/\.docx?$/i, "") ?? documentUuid;

    await notifyAdminComercial(admin, "contrato_cancelado", {
      oportunidade_id: d4doc?.oportunidade_id ?? null,
      solicitante_nome: leadNome,
      uuid_doc: documentUuid,
      name_document: docNome,
      title:   `Contrato cancelado — ${leadNome}`,
      preview: `O documento "${docNome}" foi cancelado na D4Sign.`,
      path:    opp ? `/crm/leads/${opp.id}` : "/crm/contratos",
    });
  }

  // 5. Persiste signers atualizados em d4sign_documents
  const { error: documentUpdateError } = await admin
    .from("d4sign_documents")
    .upsert(
      {
        uuid_doc:      documentUuid,
        d4sign_status: d4signStatus,
        status_name:   TYPE_POST_TO_STATUS_NAME[typePost] ?? typePost,
        signers:       updatedSigners as never,
        last_synced_at: nowIso,
        updated_at:    nowIso,
        ...(finalizedAtForDoc ? { finalized_at: finalizedAtForDoc } : {}),
      },
      { onConflict: "uuid_doc", ignoreDuplicates: false },
    );
  if (documentUpdateError) {
    return failWebhookProcessing(
      admin,
      eventId,
      "Falha ao persistir documento após webhook D4Sign",
      documentUpdateError,
    );
  }

  const { error: completionError } = await admin
    .from("d4sign_webhook_events")
    .update({
      processing_status: "processed",
      processed_at: nowIso,
      last_error: null,
    })
    .eq("id", eventId);
  if (completionError) {
    return failWebhookProcessing(
      admin,
      eventId,
      "Falha ao concluir evento D4Sign",
      completionError,
    );
  }

  return NextResponse.json({ ok: true });
}
