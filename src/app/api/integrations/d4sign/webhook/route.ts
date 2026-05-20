import { NextResponse } from "next/server";
import { verifyD4SignContentHmac } from "@/lib/d4sign/webhook-hmac";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

/** Envia e-mail de notificação via Outlook (silencia falhas). */
async function sendContractEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  subject: string,
  html: string,
): Promise<void> {
  try {
    const fromEmail = process.env.OUTLOOK_FROM_EMAIL?.trim();
    if (!fromEmail) return;

    // Destinatários: todos admin/comercial com e-mail em Auth
    const { data: users } = await admin
      .from("app_users")
      .select("auth_user_id")
      .in("role", ["admin", "comercial"])
      .not("auth_user_id", "is", null);

    if (!users || users.length === 0) return;

    const authIds = users.map((u) => u.auth_user_id as string);
    const { data: authList } = await admin.auth.admin.listUsers();
    const emails = (authList?.users ?? [])
      .filter((u) => authIds.includes(u.id) && u.email?.trim())
      .map((u) => u.email as string);

    if (emails.length === 0) return;

    // Reutiliza o endpoint interno de e-mail (não duplicar lógica Graph)
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/crm/email/send-internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "" },
      body: JSON.stringify({ to: emails, subject, html }),
    }).catch(() => null);
  } catch {
    // notificação por e-mail é best-effort — não falha o webhook
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const hmacSecret = process.env.D4SIGN_WEBHOOK_HMAC_SECRET?.trim();

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

  // HMAC opcional
  if (hmacSecret) {
    const contentHmac = request.headers.get("Content-Hmac");
    if (!verifyD4SignContentHmac(documentUuid, hmacSecret, contentHmac)) {
      return NextResponse.json({ ok: false, error: "Assinatura HMAC inválida." }, { status: 401 });
    }
  }

  const emailRaw    = form.get("email");
  const signerEmail = emailRaw != null && String(emailRaw).trim() ? String(emailRaw).trim() : null;
  const payload     = formToRecord(form);

  const admin  = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // 1. Registra evento
  const { error: insertError } = await admin.from("d4sign_webhook_events").insert({
    document_uuid: documentUuid,
    type_post:     typePost,
    signer_email:  signerEmail,
    raw_payload:   payload,
  });
  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === "23505" && typePost === "1") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ ok: false, error: insertError.message }, { status: code === "23505" ? 409 : 500 });
  }

  // 2. Busca dados atuais do documento + oportunidade vinculada
  const { data: d4doc } = await admin
    .from("d4sign_documents")
    .select("signers, oportunidade_id, name_document, safe_name")
    .eq("uuid_doc", documentUuid)
    .maybeSingle();

  const { data: opp } = d4doc?.oportunidade_id
    ? await admin
        .from("oportunidades")
        .select("id, etapa, solicitante_nome, d4sign_signers")
        .eq("id", d4doc.oportunidade_id)
        .maybeSingle()
    : { data: null };

  const currentSigners = (d4doc?.signers ?? []) as D4SignSigner[];

  const d4signStatus = TYPE_POST_TO_D4SIGN_STATUS[typePost] ?? typePost;

  // 3. Atualiza status em oportunidades (se vinculada)
  if (d4doc?.oportunidade_id) {
    await admin
      .from("oportunidades")
      .update({ d4sign_status: d4signStatus, d4sign_updated_at: nowIso, updated_at: nowIso } as never)
      .eq("d4sign_document_uuid", documentUuid);
  }

  // 4. Lógica por tipo de evento (type_post oficial D4Sign)
  let updatedSigners = currentSigners;
  let finalizedAtForDoc: string | undefined;

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
      await admin
        .from("oportunidades")
        .update({
          d4sign_signers: oppSigners as never,
          d4sign_updated_at: nowIso,
          updated_at: nowIso,
        } as never)
        .eq("id", opp.id);
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
      await admin
        .from("oportunidades")
        .update({
          d4sign_signers: updatedSigners as never,
          d4sign_updated_at: nowIso,
          updated_at: nowIso,
        } as never)
        .eq("id", opp.id);
    }

    // Avança etapa
    if (opp?.etapa === "contrato_enviado") {
      await admin
        .from("oportunidades")
        .update({ etapa: "contrato_assinado", updated_at: nowIso } as never)
        .eq("id", opp.id);

      await admin.from("transicoes_etapa").insert({
        oportunidade_id: opp.id,
        etapa_origem:    "contrato_enviado",
        etapa_destino:   "contrato_assinado",
        alterado_por:    null,
        observacao:      "Automático via webhook D4Sign (documento finalizado).",
      });
    }

    // Notificação in-app
    const leadNome = opp?.solicitante_nome ?? "Lead";
    const docNome  = d4doc?.name_document?.replace(/\.docx?$/i, "") ?? documentUuid;
    const path     = opp ? `/crm/leads/${opp.id}` : "/crm/contratos";

    await notifyAdminComercial(admin, "contrato_assinado", {
      oportunidade_id: d4doc?.oportunidade_id ?? null,
      solicitante_nome: leadNome,
      uuid_doc: documentUuid,
      name_document: docNome,
      signer_email: signerEmail,
      title:   `Contrato assinado — ${leadNome}`,
      preview: `O documento "${docNome}" foi assinado por todos os signatários.`,
      path,
    });

    // E-mail
    const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const leadLink = `${appUrl}${path}`;
    await sendContractEmail(
      admin,
      `✅ Contrato assinado — ${leadNome}`,
      `<p>O contrato <strong>${docNome}</strong> do lead <strong>${leadNome}</strong> foi assinado por todos os signatários.</p>
       <p><a href="${leadLink}">Ver lead no CRM →</a></p>`,
    );
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
  await admin
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

  return NextResponse.json({ ok: true });
}
