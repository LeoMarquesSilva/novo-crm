/**
 * GET  /api/crm/leads/[id]/contrato/send-d4sign — prontidão para o diálogo de envio:
 *      revisão, pendências, documento atual, sócios (e-mails aceitos) e sugestões de
 *      signatários do cliente.
 * POST /api/crm/leads/[id]/contrato/send-d4sign — gera o DOCX do builder e envia para
 *      assinatura na D4Sign. Primeiro envio só em `contrato_elaborado` (o lead vai para
 *      `contrato_enviado`); reenvio em `contrato_enviado` cancela o documento pendente
 *      anterior. A etapa muda pelo RPC `register_contract_sent_atomic`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { readStoredEngine } from "@/lib/crm/contract-engine/persist";
import { buildCanonicalContratoPage } from "@/lib/crm/contract-engine/legacy-preview";
import {
  getContractSendBlockReason,
  isContractReviewApproved,
  type ContractReviewTaskLike,
} from "@/lib/crm/contract-send-gate";
import {
  listFirmSignerOptions,
  resolveChosenFirmSigners,
  type ChosenFirmSigner,
} from "@/lib/crm/contract-send/firm-signer-options";
import { buildClientSignerSuggestions } from "@/lib/crm/contract-send/signer-suggestions";
import { normalizeLegacySignaturePins } from "@/lib/crm/contrato-signature-pins";
import {
  buildContratoDocumentPagePreview,
  buildContratoDocxTemplateData,
  listContratoPendingFields,
} from "@/lib/crm/contrato-docx-data";
import { persistGeneratedDocumentVersion } from "@/lib/crm/persist-generated-document-version";
import {
  buildContratoDocumentSnapshot,
  buildGeneratedContratoDocxFilePath,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
  sanitizeFilenamePart,
} from "@/lib/crm/proposta-document-data";
import { formatPropostaFileStamp } from "@/lib/crm/proposta-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { renderContratoDocx } from "@/lib/crm/render-contrato-docx";
import { buildInitialD4SignSigners } from "@/lib/crm/sync-oportunidade-d4sign-signers";
import { cancelD4SignDocument } from "@/lib/d4sign/cancel-document";
import { enrichDocuments, PENDING_D4SIGN_STATUSES, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { assertD4SignSendEnv } from "@/lib/d4sign/env";
import { isFirmSignerEmail, firmSignerForEmail } from "@/lib/d4sign/firm-signers";
import { parseSigners, signerIsPending } from "@/lib/d4sign/partner-signatures";
import { resolveClientFolder } from "@/lib/d4sign/resolve-client-folder";
import { ensureSafeWebhookV2 } from "@/lib/d4sign/webhook-registration";
import { internalErrorResponse, logServerError } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import type { OpportunityStage } from "@/modules/crm/domain/entities";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

const SEND_STAGES = new Set<OpportunityStage>(["contrato_elaborado", "contrato_enviado"]);
/** Trava de envio (document_instances.status = 'sending') vence depois disso. */
const SEND_CLAIM_STALE_MS = 3 * 60_000;

const signerSchema = z.object({
  email: z.string().email("E-mail do signatário inválido."),
  /** foreign: 0 = CPF brasileiro, 1 = sem CPF / estrangeiro */
  foreign: z.enum(["0", "1"]).optional().default("0"),
  /** Só CONTRATANTE (cliente); os sócios vêm em `firmSigners`. */
  role: z.literal("CONTRATANTE").optional(),
  /** Nome para exibição apenas (não usado pela D4Sign). */
  name: z.string().optional(),
});

const pinSchema = z.object({
  /** E-mail ou placeholder `"__client__"` (resolvido para o CONTRATANTE no envio) */
  email: z.string().min(1),
  page: z.number().int().min(0),
  position_x: z.number().min(0),
  position_y: z.number().min(0),
  page_width: z.number().positive(),
  page_height: z.number().positive(),
  /** 0 = assinatura, 1 = rubrica, 2 = carimbo */
  type: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

const bodySchema = z.object({
  /** Signatários do cliente (CONTRATANTE). Pelo menos um. */
  signers: z.array(signerSchema).min(1, "Informe pelo menos um signatário do cliente."),
  /**
   * Sócios (CONTRATADA) com o e-mail escolhido. Ausente = todos os sócios com o e-mail
   * padrão; lista vazia = nenhum sócio.
   */
  firmSigners: z.array(z.object({ email: z.string().email() })).optional(),
  /** Etapa que a tela viu; diferente da atual → 409. */
  expectedStage: z.enum(["contrato_elaborado", "contrato_enviado"]).optional(),
  /** Reenvio com documento pendente: confirma o cancelamento do anterior. */
  resend: z.object({ confirmCancelPrevious: z.literal(true) }).optional(),
  message: z.string().max(500).optional(),
  templateId: z.string().uuid().optional(),
  /** Cláusulas adicionais salvas no builder (se não informado, busca do data_json) */
  clausulasAdicionais: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
  /** Pins de assinatura/rubrica posicionados via builder. */
  pins: z.array(pinSchema).optional(),
  /** EMBED: a D4Sign não envia e-mail aos signatários (assinatura no iframe do CRM). */
  embedMode: z.boolean().optional().default(false),
});

type OpportunityRow = {
  id: string;
  solicitante_nome: string | null;
  etapa: OpportunityStage;
  d4sign_document_uuid: string | null;
  d4sign_signers: Json;
  cliente_id: string | null;
};

async function loadSendContext(supabase: SupabaseAdmin, oportunidadeId: string, templateId?: string) {
  const { data: op, error: opErr } = await supabase
    .from("oportunidades")
    .select("id, solicitante_nome, etapa, d4sign_document_uuid, d4sign_signers, cliente_id")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opErr) throw opErr;
  if (!op) return null;

  const reviewTask = (
    await supabase
      .from("contract_review_tasks")
      .select("status, prazo_revisao, concluido_em")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle()
  ).data as ContractReviewTaskLike;

  const template = templateId
    ? await loadDocumentTemplateById(supabase, templateId)
    : await loadDefaultContratoTemplate(supabase);

  const currentDocument = op.d4sign_document_uuid
    ? (
        await supabase
          .from("d4sign_documents")
          .select("uuid_doc, d4sign_status, signers")
          .eq("uuid_doc", op.d4sign_document_uuid)
          .maybeSingle()
      ).data
    : null;

  return { op: op as OpportunityRow, reviewTask, template, currentDocument };
}

function describeDocument(
  op: OpportunityRow,
  doc: { uuid_doc: string; d4sign_status: string | null; signers: Json } | null,
) {
  if (!op.d4sign_document_uuid) return null;
  const status = doc?.d4sign_status ?? null;
  const signers = parseSigners(doc?.signers ?? op.d4sign_signers, status);
  return {
    uuid: op.d4sign_document_uuid,
    status,
    pending: status ? PENDING_D4SIGN_STATUSES.has(status) : false,
    finalized: status === "1",
    signed: signers.filter((s) => !signerIsPending(s)).length,
    total: signers.length,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireLeadActionApi({ action: "contract.send" });
    if (!auth.ok) return auth.response;

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();
    const ctx = await loadSendContext(supabase, oportunidadeId);
    if (!ctx) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const { op, reviewTask, template, currentDocument } = ctx;
    const pending: string[] = [];
    let focal = { name: null as string | null, email: null as string | null };
    let hasInstance = false;
    if (template) {
      const { fieldByCode, empresasIntake } = await buildContratoDocumentSnapshot({
        supabase,
        oportunidadeId,
        template,
        generatedAt: new Date(),
      });
      focal = { name: fieldByCode.cp_nome_focal ?? null, email: fieldByCode.cp_email_focal ?? null };
      const { data: instanceRow } = await supabase
        .from("document_instances")
        .select("id, data_json")
        .eq("oportunidade_id", oportunidadeId)
        .eq("template_id", template.id)
        .maybeSingle();
      hasInstance = Boolean(instanceRow);
      const dataJson =
        instanceRow?.data_json && typeof instanceRow.data_json === "object" && !Array.isArray(instanceRow.data_json)
          ? (instanceRow.data_json as Record<string, unknown>)
          : {};
      const empresa = resolvePropostaEmpresaPrincipal({
        empresasIntake,
        cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
      });
      pending.push(
        ...listContratoPendingFields(
          fieldByCode,
          empresa.razaoSocial ?? "",
          readStoredEngine(dataJson).build?.data ?? null,
        ).map((p) => p.label),
      );
    }

    const [{ data: contacts }, { data: cliente }] = await Promise.all([
      op.cliente_id
        ? supabase.from("contatos_cliente").select("nome, email").eq("cliente_id", op.cliente_id)
        : Promise.resolve({ data: [] as { nome: string | null; email: string | null }[] }),
      op.cliente_id
        ? supabase.from("clientes").select("razao_social, email_principal").eq("id", op.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const reviewApproved = isContractReviewApproved(reviewTask);
    const document = describeDocument(op, currentDocument);
    const blockReason = !SEND_STAGES.has(op.etapa)
      ? "O contrato é enviado em Contrato Elaborado (ou reenviado em Contrato Enviado)."
      : !reviewApproved
        ? (getContractSendBlockReason(reviewTask) ?? "Revisão do contrato pendente.")
        : !template
          ? "Modelo de contrato não encontrado."
          : !hasInstance
            ? "Inicialize e salve o contrato no builder antes de enviá-lo para assinatura."
            : pending.length > 0
              ? `Preencha os campos pendentes: ${pending.join(", ")}.`
              : document?.finalized
                ? "O contrato atual já foi assinado por todos."
                : null;

    return NextResponse.json({
      ok: true,
      readiness: {
        stage: op.etapa,
        reviewApproved,
        pending,
        canSend: blockReason === null,
        blockReason,
        isResend: op.etapa === "contrato_enviado" || Boolean(document?.pending),
      },
      currentDocument: document,
      firmSigners: listFirmSignerOptions(),
      clientSuggestions: buildClientSignerSuggestions({
        previousSigners: op.d4sign_signers,
        focal,
        contacts: (contacts ?? []) as { nome: string | null; email: string | null }[],
        cliente: cliente
          ? { nome: (cliente as { razao_social: string | null }).razao_social, email: (cliente as { email_principal: string | null }).email_principal }
          : null,
        isFirmEmail: isFirmSignerEmail,
      }),
    });
  } catch (error) {
    return internalErrorResponse("send-d4sign/get", error, "Não foi possível preparar o envio.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let claimedInstance: { id: string; previousStatus: string } | null = null;
  const supabase = createSupabaseAdminClient();
  try {
    const auth = await requireLeadActionApi({ action: "contract.send" });
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);

    const ctx = await loadSendContext(supabase, oportunidadeId, parsed.data.templateId);
    if (!ctx) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    const { op, reviewTask, template, currentDocument } = ctx;

    if (!SEND_STAGES.has(op.etapa)) {
      return NextResponse.json(
        {
          ok: false,
          error: "O contrato é enviado em Contrato Elaborado (ou reenviado em Contrato Enviado).",
          code: "STAGE_NOT_SENDABLE",
        },
        { status: 422 },
      );
    }
    if (parsed.data.expectedStage && parsed.data.expectedStage !== op.etapa) {
      return NextResponse.json(
        { ok: false, error: "A etapa do lead mudou. Atualize a tela e tente de novo.", code: "STAGE_CONFLICT" },
        { status: 409 },
      );
    }

    if (!isContractReviewApproved(reviewTask)) {
      const reason = getContractSendBlockReason(reviewTask);
      return NextResponse.json(
        {
          ok: false,
          error: reason ?? "Revisão do contrato pendente.",
          code: "REVIEW_NOT_APPROVED",
          reviewStatus: reviewTask?.status ?? null,
        },
        { status: 422 },
      );
    }

    // ── Signatários ───────────────────────────────────────────────────────
    const clientEmails = parsed.data.signers.map((s) => s.email.trim().toLowerCase());
    const firmInClient = parsed.data.signers.find((s) => isFirmSignerEmail(s.email));
    if (firmInClient) {
      return NextResponse.json(
        { ok: false, error: `${firmInClient.email} é de um sócio: ele entra na lista de sócios, não do cliente.` },
        { status: 422 },
      );
    }
    if (new Set(clientEmails).size !== clientEmails.length) {
      return NextResponse.json({ ok: false, error: "Há e-mails repetidos entre os signatários do cliente." }, { status: 422 });
    }

    let firmSigners: ChosenFirmSigner[];
    if (parsed.data.firmSigners) {
      const resolved = resolveChosenFirmSigners(parsed.data.firmSigners);
      if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.message }, { status: 422 });
      firmSigners = resolved.signers;
    } else {
      firmSigners = listFirmSignerOptions().map((o) => ({
        key: o.key,
        email: o.defaultEmail,
        name: o.name,
        foreign: o.foreign,
      }));
    }

    type SignerRow = { email: string; foreign: "0" | "1"; role: "CONTRATADA" | "CONTRATANTE"; name?: string };
    const finalSigners: SignerRow[] = [
      ...firmSigners.map((s) => ({ email: s.email, foreign: s.foreign, role: "CONTRATADA" as const, name: s.name })),
      ...parsed.data.signers.map((s) => ({
        email: s.email.trim().toLowerCase(),
        foreign: s.foreign,
        role: "CONTRATANTE" as const,
        name: s.name?.trim() || undefined,
      })),
    ];

    // ── Documento atual (reenvio) ────────────────────────────────────────
    const document = describeDocument(op, currentDocument);
    if (document?.finalized) {
      return NextResponse.json(
        { ok: false, error: "O contrato atual já foi assinado por todos.", code: "ALREADY_SIGNED" },
        { status: 409 },
      );
    }
    if (document?.pending && !parsed.data.resend?.confirmCancelPrevious) {
      return NextResponse.json(
        {
          ok: false,
          error: `Já existe um envio em andamento (${document.signed} de ${document.total} assinaram). Confirme para cancelar e reenviar.`,
          code: "RESEND_CONFIRMATION_REQUIRED",
          currentDocument: document,
        },
        { status: 409 },
      );
    }

    if (!template) {
      return NextResponse.json({ ok: false, error: "Modelo de contrato não encontrado." }, { status: 404 });
    }

    // Snapshot dos campos
    const generatedAt = new Date();
    const { fieldByCode, empresasIntake } = await buildContratoDocumentSnapshot({
      supabase,
      oportunidadeId,
      template,
      generatedAt,
    });
    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });
    const { data: instanceRow } = await supabase
      .from("document_instances")
      .select("id, data_json, current_version, status")
      .eq("oportunidade_id", oportunidadeId)
      .eq("template_id", template.id)
      .maybeSingle();
    if (!instanceRow) {
      return NextResponse.json(
        { ok: false, error: "Inicialize e salve o contrato no builder antes de enviá-lo para assinatura." },
        { status: 422 },
      );
    }
    const instanceDataJson =
      instanceRow.data_json && typeof instanceRow.data_json === "object" && !Array.isArray(instanceRow.data_json)
        ? (instanceRow.data_json as Record<string, unknown>)
        : {};
    const storedEngine = readStoredEngine(instanceDataJson);
    const pending = listContratoPendingFields(fieldByCode, empresa.razaoSocial ?? "", storedEngine.build?.data ?? null);
    if (pending.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Preencha os campos pendentes antes de enviar: ${pending.map((p) => p.label).join(", ")}.`,
          pending: pending.map((p) => p.label),
        },
        { status: 422 },
      );
    }

    // ── Trava de envio (evita dois envios simultâneos do mesmo contrato) ──
    const staleBefore = new Date(Date.now() - SEND_CLAIM_STALE_MS).toISOString();
    const { data: claimRows, error: claimError } = await supabase
      .from("document_instances")
      .update({ status: "sending", updated_at: generatedAt.toISOString() })
      .eq("id", instanceRow.id)
      .or(`status.neq.sending,updated_at.lt.${staleBefore}`)
      .select("id");
    if (claimError) throw claimError;
    if (!claimRows || claimRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Este contrato já está sendo enviado. Aguarde alguns instantes.", code: "SEND_IN_PROGRESS" },
        { status: 409 },
      );
    }
    claimedInstance = { id: instanceRow.id, previousStatus: instanceRow.status === "sending" ? "draft" : instanceRow.status };

    // ── Cancela o pendente anterior (reenvio) ────────────────────────────
    const previousDocumentUuid = op.d4sign_document_uuid;
    if (document?.pending && previousDocumentUuid) {
      const canceled = await cancelD4SignDocument({
        uuid: previousDocumentUuid,
        reason: "Substituído por novo envio do contrato.",
        canceledBy: auth.user.email ?? null,
        source: "crm-resend",
      });
      if (!canceled.ok && canceled.reason !== "not_pending") {
        await releaseClaim(supabase, claimedInstance);
        claimedInstance = null;
        return NextResponse.json(
          { ok: false, error: canceled.message, code: "PREVIOUS_CANCEL_FAILED", resetAt: canceled.resetAt ?? null },
          { status: canceled.reason === "quota_exhausted" ? 429 : 502 },
        );
      }
    }

    // Cláusulas adicionais e pins salvos (se não vieram no body)
    let clausulasAdicionais = parsed.data.clausulasAdicionais ?? [];
    let pinsToApply = parsed.data.pins ?? [];
    if (clausulasAdicionais.length === 0 && Array.isArray(instanceDataJson.clausulas_selecionadas)) {
      clausulasAdicionais = (
        instanceDataJson.clausulas_selecionadas as Array<{ title: string; content: string }>
      ).map((c) => ({ title: c.title, content: c.content }));
    }
    if (pinsToApply.length === 0 && Array.isArray(instanceDataJson.pins_signatarios)) {
      pinsToApply = normalizeLegacySignaturePins(instanceDataJson.pins_signatarios as Array<z.infer<typeof pinSchema>>);
    }

    // Gerar DOCX pela mesma fonte do preview e do "Gerar DOCX" (motor canônico).
    const templateData = buildContratoDocxTemplateData({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
      fieldByCode,
      generatedAt,
    });
    const page = storedEngine.build
      ? buildCanonicalContratoPage({ canonicalData: storedEngine.build.data, userExtras: clausulasAdicionais })
      : buildContratoDocumentPagePreview(templateData, clausulasAdicionais);
    const docxBuffer = await renderContratoDocx(page);

    const d4Env = assertD4SignSendEnv();
    const connector = D4SignConnector.fromEnv(d4Env);
    const blob = new Blob([new Uint8Array(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const solicitanteNome = String(op.solicitante_nome ?? "contrato");
    const nextVersion = Number(instanceRow.current_version ?? 0) + 1;
    const filename = `Contrato-${sanitizeFilenamePart(solicitanteNome)}-v${nextVersion}-${formatPropostaFileStamp(generatedAt)}.docx`;
    const filePath = buildGeneratedContratoDocxFilePath({
      oportunidadeId,
      versionNumber: nextVersion,
      generatedAt,
      baseName: solicitanteNome,
    });

    // Pins: "__client__" → 1º signatário do cliente; pin de sócio segue o e-mail escolhido.
    const firstClient = finalSigners.find((s) => s.role === "CONTRATANTE");
    const chosenEmailByPartner = new Map(firmSigners.map((s) => [s.key, s.email]));
    const resolvedPins = normalizeLegacySignaturePins(pinsToApply).map((p) => {
      if (p.email === "__client__") return firstClient ? { ...p, email: firstClient.email } : p;
      const partner = firmSignerForEmail(p.email);
      const chosen = partner ? chosenEmailByPartner.get(partner.email.trim().toLowerCase()) : undefined;
      return chosen ? { ...p, email: chosen } : p;
    });
    const finalEmails = new Set(finalSigners.map((s) => s.email.toLowerCase()));
    const filteredPins = resolvedPins.filter((p) => finalEmails.has(p.email.toLowerCase()));

    // Pasta do cliente no cofre — não crítico.
    let clientFolder: { uuid: string; name: string } | null = null;
    try {
      clientFolder = await resolveClientFolder({
        supabase,
        connector,
        safeUuid: d4Env.safeUuid,
        clientName: empresa.razaoSocial ?? solicitanteNome,
      });
    } catch (e) {
      console.warn("[send-d4sign] resolveClientFolder falhou (não crítico):", e instanceof Error ? e.message : e);
    }

    const generatedSnapshot: Json = {
      templateId: template.id,
      templateName: template.name,
      fields: fieldByCode as unknown as Json,
      sentToD4Sign: false,
      signers: finalSigners as unknown as Json,
    };
    const storedVersion = await persistGeneratedDocumentVersion({
      supabase,
      instanceId: instanceRow.id,
      versionNumber: nextVersion,
      dataSnapshot: generatedSnapshot,
      filePath,
      bytes: new Uint8Array(docxBuffer),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      generatedBy: auth.profile.id,
    });

    const result = await connector.sendDocumentForSignature({
      safeUuid: d4Env.safeUuid,
      file: blob,
      fileName: filename,
      uuidFolder: clientFolder?.uuid,
      signers: finalSigners.map((s) => ({ email: s.email, foreign: s.foreign })),
      message: parsed.data.message || undefined,
      skipEmail: parsed.data.embedMode ? "1" : "0",
      signingWorkflow: "0",
      uploadWorkflow: "2",
      pins: filteredPins.length > 0 ? filteredPins : undefined,
    });

    const linkContrato = result.primarySignatureLink ?? result.signatureLinks[0]?.link ?? null;
    const nowIso = generatedAt.toISOString();
    const initialSigners = buildInitialD4SignSigners(result.signerKeys, finalSigners);

    // Catálogo D4Sign antes do RPC: o rascunho do contrato acha o documento pelo lead.
    const { error: catalogError } = await supabase.from("d4sign_documents").upsert(
      {
        uuid_doc: result.documentUuid,
        name_document: filename,
        safe_uuid: d4Env.safeUuid,
        d4sign_status: "sent",
        status_name: "Enviado",
        oportunidade_id: oportunidadeId,
        link_contrato: linkContrato,
        created_at_d4sign: nowIso,
        updated_at: nowIso,
        signers: initialSigners as never,
        sent_by_app_user_id: auth.profile.id,
        sent_at: nowIso,
        folder_uuid: clientFolder?.uuid ?? null,
        folder_name: clientFolder?.name ?? null,
        folder_path: clientFolder?.name ?? null,
      },
      { onConflict: "uuid_doc", ignoreDuplicates: false },
    );
    if (catalogError) logServerError("send-d4sign/catalog", catalogError, { uuid: result.documentUuid });

    // ── Etapa + documento atual, numa transação ──────────────────────────
    const registered = await registerContractSent(supabase, {
      opportunityId: oportunidadeId,
      expectedStage: op.etapa,
      documentUuid: result.documentUuid,
      linkContrato,
      signers: initialSigners as unknown as Json,
      previousDocumentUuid,
      actor: auth.profile.id,
      now: nowIso,
    });
    if (!registered.ok) {
      // O lead mudou durante o envio: o documento novo não fica valendo.
      await cancelD4SignDocument({
        uuid: result.documentUuid,
        reason: "Envio descartado: a etapa do lead mudou durante o envio.",
        canceledBy: auth.user.email ?? null,
        source: "crm-send-conflict",
      }).catch(() => undefined);
      await releaseClaim(supabase, claimedInstance);
      claimedInstance = null;
      return NextResponse.json(
        { ok: false, error: "A etapa do lead mudou durante o envio. Atualize a tela e tente de novo.", code: "STAGE_CONFLICT" },
        { status: 409 },
      );
    }

    await recordLeadActivityEvent(supabase, {
      oportunidadeId,
      kind: "contrato_enviado",
      title: previousDocumentUuid ? "Contrato reenviado para assinatura" : "Contrato enviado para assinatura",
      detail: `Documento encaminhado via D4Sign para ${finalSigners.length} signatário(s).`,
      etapa: "contrato_enviado",
      actorAppUserId: auth.profile.id,
      sourceId: `d4sign-send:${result.documentUuid}`,
      metadata: {
        document_uuid: result.documentUuid,
        previous_document_uuid: previousDocumentUuid,
        signers: finalSigners.map((s) => ({ email: s.email, role: s.role })),
      },
    });
    if (registered.transitionId) {
      await recordLeadActivityEvent(supabase, {
        oportunidadeId,
        kind: "etapa_alterada",
        title: "Etapa alterada",
        detail: "contrato_elaborado → contrato_enviado",
        etapa: "contrato_enviado",
        actorAppUserId: auth.profile.id,
        sourceId: `trans:${registered.transitionId}`,
        metadata: { from: "contrato_elaborado", to: "contrato_enviado" },
      });
    }

    const { error: sentVersionError } = await supabase
      .from("document_versions")
      .update({ data_snapshot: { ...(generatedSnapshot as object), sentToD4Sign: true, d4signDocumentUuid: result.documentUuid } as Json })
      .eq("id", storedVersion.versionId);
    if (sentVersionError) logServerError("send-d4sign/version", sentVersionError);

    const { error: sentInstanceError } = await supabase
      .from("document_instances")
      .update({ status: "sent" })
      .eq("id", instanceRow.id);
    if (sentInstanceError) logServerError("send-d4sign/instance", sentInstanceError);
    claimedInstance = null;

    // Sincroniza status/assinaturas reais da D4Sign (1 req) — não bloqueia envio
    try {
      const rows = await pickDocumentsToEnrich({ limit: 1, uuidDoc: result.documentUuid });
      if (rows.length > 0) await enrichDocuments(d4Env, rows, { apiSource: "send" });
    } catch {
      // signatários iniciais já foram gravados via createlist
    }

    await ensureSafeWebhookV2({ origin: request.nextUrl.origin });

    return NextResponse.json({
      ok: true,
      documentUuid: result.documentUuid,
      linkContrato,
      signatureLinks: result.signatureLinks,
      stage: "contrato_enviado",
    });
  } catch (error) {
    if (claimedInstance) await releaseClaim(supabase, claimedInstance).catch(() => undefined);
    return internalErrorResponse("send-d4sign", error, "Falha ao enviar contrato para assinatura.");
  }
}

async function releaseClaim(
  supabase: SupabaseAdmin,
  claim: { id: string; previousStatus: string } | null,
): Promise<void> {
  if (!claim) return;
  await supabase.from("document_instances").update({ status: claim.previousStatus }).eq("id", claim.id);
}

function isMissingRpc(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

/** RPC `register_contract_sent_atomic`; sem a migration, update protegido pela etapa esperada. */
async function registerContractSent(
  supabase: SupabaseAdmin,
  input: {
    opportunityId: string;
    expectedStage: OpportunityStage;
    documentUuid: string;
    linkContrato: string | null;
    signers: Json;
    previousDocumentUuid: string | null;
    actor: string;
    now: string;
  },
): Promise<{ ok: true; transitionId: string | null } | { ok: false }> {
  const { data, error } = await supabase
    .rpc("register_contract_sent_atomic", {
      p_opportunity_id: input.opportunityId,
      p_expected_stage: input.expectedStage,
      p_document_uuid: input.documentUuid,
      p_link_contrato: input.linkContrato,
      p_signers: input.signers,
      p_previous_document_uuid: input.previousDocumentUuid,
      p_actor: input.actor,
      p_now: input.now,
    })
    .maybeSingle();

  if (!error) return { ok: true, transitionId: (data as { transition_id?: string | null } | null)?.transition_id ?? null };
  if (!isMissingRpc(error)) {
    logServerError("send-d4sign/register", error, { opportunityId: input.opportunityId });
    return { ok: false };
  }

  // Fallback (migration 20261015125000 ainda não aplicada).
  const { data: updated, error: updateError } = await supabase
    .from("oportunidades")
    .update({
      d4sign_document_uuid: input.documentUuid,
      d4sign_status: "sent",
      d4sign_updated_at: input.now,
      d4sign_signers: input.signers,
      updated_at: input.now,
      etapa: "contrato_enviado",
      ...(input.linkContrato ? { link_contrato: input.linkContrato } : {}),
    })
    .eq("id", input.opportunityId)
    .eq("etapa", input.expectedStage)
    .select("id");
  if (updateError) throw updateError;
  if (!updated || updated.length === 0) return { ok: false };
  if (input.expectedStage !== "contrato_elaborado") return { ok: true, transitionId: null };

  const { data: transition, error: transitionError } = await supabase
    .from("transicoes_etapa")
    .insert({
      oportunidade_id: input.opportunityId,
      etapa_origem: "contrato_elaborado",
      etapa_destino: "contrato_enviado",
      alterado_por: input.actor,
      observacao: "Contrato enviado para assinatura D4Sign.",
    })
    .select("id")
    .single();
  if (transitionError) logServerError("send-d4sign/transition", transitionError);
  return { ok: true, transitionId: transition?.id ?? null };
}
