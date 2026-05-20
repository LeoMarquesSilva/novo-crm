import { NextResponse } from "next/server";
import { assertD4SignSendEnv, getD4SignEnv } from "@/lib/d4sign/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildInitialD4SignSigners } from "@/lib/crm/sync-oportunidade-d4sign-signers";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function isAllowedMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m === "application/pdf" ||
    m === "application/msword" ||
    m ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "image/jpeg" ||
    m === "image/png" ||
    m === "image/bmp"
  );
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("app_users")
      .select("role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (profileError || !profile || (profile.role !== "admin" && profile.role !== "comercial")) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode enviar documentos à D4Sign." },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const opportunityId = String(form.get("opportunityId") ?? "").trim();
    const signerEmail = String(form.get("signerEmail") ?? "").trim().toLowerCase();
    const signerForeign = String(form.get("signerForeign") ?? "1").trim();
    const message = String(form.get("message") ?? "").trim();
    const skipEmail = (String(form.get("skipEmail") ?? "0").trim() === "1" ? "1" : "0") as
      | "0"
      | "1";
    const signingWorkflow = (String(form.get("signingWorkflow") ?? "0").trim() === "1"
      ? "1"
      : "0") as "0" | "1";
    const file = form.get("file");

    if (!opportunityId || !/^[0-9a-f-]{36}$/i.test(opportunityId)) {
      return NextResponse.json({ ok: false, error: "opportunityId inválido." }, { status: 400 });
    }
    if (!signerEmail || !signerEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "signerEmail inválido." }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ ok: false, error: "Ficheiro (file) é obrigatório." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Ficheiro demasiado grande (máx. ${MAX_FILE_BYTES / (1024 * 1024)} MB).` },
        { status: 400 },
      );
    }
    let mime = (file.type || "").toLowerCase();
    if (!mime || mime === "application/octet-stream") {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".pdf")) mime = "application/pdf";
      else if (lower.endsWith(".doc")) mime = "application/msword";
      else if (lower.endsWith(".docx")) {
        mime =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) mime = "image/jpeg";
      else if (lower.endsWith(".png")) mime = "image/png";
      else if (lower.endsWith(".bmp")) mime = "image/bmp";
    }
    if (!isAllowedMime(mime)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de arquivo não suportado (use PDF, DOC, DOCX ou imagem)." },
        { status: 400 },
      );
    }

    const { data: row, error: fetchError } = await admin
      .from("oportunidades")
      .select("id")
      .eq("id", opportunityId)
      .maybeSingle();

    if (fetchError || !row) {
      return NextResponse.json(
        { ok: false, error: fetchError?.message ?? "Oportunidade não encontrada." },
        { status: 404 },
      );
    }

    const d4Env = assertD4SignSendEnv();
    const connector = D4SignConnector.fromEnv(d4Env);
    const blob = await file.arrayBuffer().then((b) => new Blob([b], { type: mime }));
    const safeUuid = d4Env.safeUuid;
    const foreign = signerForeign === "0" ? "0" : "1";

    const result = await connector.sendDocumentForSignature({
      safeUuid,
      file: blob,
      fileName: file.name || "documento.pdf",
      signers: [{ email: signerEmail, foreign }],
      message: message || undefined,
      skipEmail,
      signingWorkflow,
      uploadWorkflow: signingWorkflow === "1" ? "1" : "2",
    });

    const linkContrato =
      result.primarySignatureLink ??
      (result.signatureLinks[0]?.link ?? null) ??
      null;

    const nowIso = new Date().toISOString();
    // Monta lista de signatários inicial (todos aguardando) — enriquecida com role/name
    const initialSigners = buildInitialD4SignSigners(result.signerKeys, [
      { email: signerEmail, role: "CONTRATANTE" },
    ]);

    const updatePayload: Record<string, unknown> = {
      d4sign_document_uuid: result.documentUuid,
      d4sign_status: "sent",
      d4sign_updated_at: nowIso,
      d4sign_signers: initialSigners,
      updated_at: nowIso,
    };
    if (linkContrato) {
      updatePayload.link_contrato = linkContrato;
    }

    const { data: appUser } = await admin
      .from("app_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const { error: updateError } = await admin
      .from("oportunidades")
      .update(updatePayload as never)
      .eq("id", opportunityId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: `Documento criado na D4Sign mas falha ao salvar no CRM: ${updateError.message}` },
        { status: 500 },
      );
    }

    await admin.from("d4sign_documents").upsert(
      {
        uuid_doc: result.documentUuid,
        name_document: file.name || "documento.pdf",
        safe_uuid: safeUuid,
        d4sign_status: "sent",
        status_name: "Enviado",
        oportunidade_id: opportunityId,
        link_contrato: linkContrato,
        created_at_d4sign: nowIso,
        last_synced_at: nowIso,
        updated_at: nowIso,
        signers: initialSigners as never,
        sent_by_app_user_id: appUser?.id ?? null,
      },
      { onConflict: "uuid_doc", ignoreDuplicates: false },
    );

    const webhookBase = getD4SignEnv().webhookHmacSecret
      ? new URL(request.url).origin
      : null;
    if (webhookBase) {
      const webhookUrl = `${webhookBase}/api/integrations/d4sign/webhook`;
      try {
        await connector.registerWebhook(result.documentUuid, webhookUrl);
      } catch {
        // Não falhar o envio se o registro de webhook falhar (URL local, permissões, etc.)
      }
    }

    return NextResponse.json({
      ok: true,
      documentUuid: result.documentUuid,
      linkContrato,
      signatureLinks: result.signatureLinks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada ao enviar para a D4Sign.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
