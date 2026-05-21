import { format } from "date-fns";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildContratoDocumentSnapshot,
  loadDefaultContratoTemplate,
  loadDocumentTemplateById,
} from "@/lib/crm/proposta-document-data";
import {
  buildContratoDocxTemplateData,
  buildContratoDocumentPagePreview,
  listContratoPendingFields,
} from "@/lib/crm/contrato-docx-data";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { generateContratoDocxBuffer } from "@/lib/crm/generate-contrato-docx";
import { normalizeLegacySignaturePins } from "@/lib/crm/contrato-signature-pins";
import {
  getContractSendBlockReason,
  isContractReviewApproved,
  type ContractReviewTaskLike,
} from "@/lib/crm/contract-send-gate";
import { buildInitialD4SignSigners } from "@/lib/crm/sync-oportunidade-d4sign-signers";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import { assertD4SignSendEnv, getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const signerSchema = z.object({
  email: z.string().email("E-mail do signatário inválido."),
  /** foreign: 0 = CPF brasileiro, 1 = sem CPF / estrangeiro */
  foreign: z.enum(["0", "1"]).optional().default("0"),
  /** Marca o signatário como CONTRATADA (firma) ou CONTRATANTE (cliente) — apenas informativo no payload. */
  role: z.enum(["CONTRATADA", "CONTRATANTE"]).optional(),
  /** Nome para exibição apenas (não usado pela D4Sign). */
  name: z.string().optional(),
});

const pinSchema = z.object({
  /** E-mail ou placeholder `"__client__"` (resolvido para o CONTRATANTE no envio) */
  email:        z.string().min(1),
  page:         z.number().int().min(0),
  position_x:   z.number().min(0),
  position_y:   z.number().min(0),
  page_width:   z.number().positive(),
  page_height:  z.number().positive(),
  /** 0 = assinatura, 1 = rubrica, 2 = carimbo */
  type:         z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
});

const bodySchema = z.object({
  /** Lista nova: múltiplos signatários (CONTRATADA + CONTRATANTE). */
  signers: z.array(signerSchema).min(1).optional(),
  /** Legado (single-signer) — convertido em `signers` se `signers` não vier. */
  signerEmail: z.string().email("E-mail do signatário inválido.").optional(),
  signerForeign: z.enum(["0", "1"]).optional().default("0"),
  /** Inclui automaticamente sócios da firma (CONTRATADA). Default: true. */
  includeFirmSigners: z.boolean().optional().default(true),
  message: z.string().max(500).optional(),
  templateId: z.string().uuid().optional(),
  /** Cláusulas adicionais salvas no builder (se não informado, busca do data_json) */
  clausulasAdicionais: z
    .array(z.object({ title: z.string(), content: z.string() }))
    .optional(),
  /**
   * Pins de assinatura/rubrica posicionados via builder.
   * Se vazio, signatários assinam onde quiserem (comportamento atual D4Sign).
   */
  pins: z.array(pinSchema).optional(),
  /**
   * EMBED: se true, D4Sign NÃO envia e-mail aos signatários — o sistema vai
   * apresentar o iframe de assinatura inline. Requer ativação na conta D4Sign.
   * Default: false (envia e-mail tradicional).
   */
  embedMode: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode enviar contratos para assinatura." },
        { status: 403 },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id, solicitante_nome, etapa")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) {
      return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });
    }

    const reviewTask = (await supabase
      .from("contract_review_tasks")
      .select("status, prazo_revisao, concluido_em")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle()).data as ContractReviewTaskLike;

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

    // Carregar template
    const template = parsed.data.templateId
      ? await loadDocumentTemplateById(supabase, parsed.data.templateId)
      : await loadDefaultContratoTemplate(supabase);
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

    // Validar pendências
    const empresa = resolvePropostaEmpresaPrincipal({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
    });
    const pending = listContratoPendingFields(fieldByCode, empresa.razaoSocial ?? "");
    if (pending.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Preencha os campos pendentes antes de enviar: ${pending.join(", ")}.`,
          pending,
        },
        { status: 422 },
      );
    }

    // Buscar cláusulas adicionais E pins salvos (se não vieram no body)
    let clausulasAdicionais = parsed.data.clausulasAdicionais ?? [];
    let pinsToApply         = parsed.data.pins ?? [];
    if (clausulasAdicionais.length === 0 || pinsToApply.length === 0) {
      const { data: instance } = await supabase
        .from("document_instances")
        .select("data_json")
        .eq("oportunidade_id", oportunidadeId)
        .eq("template_id", template.id)
        .maybeSingle();
      const dataJson = instance?.data_json as Record<string, unknown> | null ?? {};
      if (clausulasAdicionais.length === 0 && Array.isArray(dataJson.clausulas_selecionadas)) {
        clausulasAdicionais = (
          dataJson.clausulas_selecionadas as Array<{ title: string; content: string }>
        ).map((c) => ({ title: c.title, content: c.content }));
      }
      if (pinsToApply.length === 0 && Array.isArray(dataJson.pins_signatarios)) {
        pinsToApply = normalizeLegacySignaturePins(
          dataJson.pins_signatarios as Array<z.infer<typeof pinSchema>>,
        );
      }
    }

    // Gerar DOCX
    const templateData = buildContratoDocxTemplateData({
      empresasIntake,
      cpPropostaEmpresasJson: fieldByCode.cp_proposta_empresas_json,
      fieldByCode,
      generatedAt,
    });
    const page = buildContratoDocumentPagePreview(templateData, clausulasAdicionais);
    const docxBuffer = await generateContratoDocxBuffer(page);

    // Enviar à D4Sign
    const d4Env = assertD4SignSendEnv();
    const connector = D4SignConnector.fromEnv(d4Env);
    const blob = new Blob([new Uint8Array(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const solicitanteNome = String(op.solicitante_nome ?? "contrato");
    const filename = `Contrato-${solicitanteNome.replace(/[^a-zA-Z0-9\-_]/g, "_")}-${format(generatedAt, "yyyy-MM-dd")}.docx`;

    // ── Monta a lista final de signatários ──────────────────────────────
    // 1) Sócios da firma (CONTRATADA) — sempre incluídos por padrão
    // 2) Cliente(s) (CONTRATANTE) — explícito no body (signers) ou legacy (signerEmail)
    type SignerRow = { email: string; foreign: "0" | "1"; role: "CONTRATADA" | "CONTRATANTE"; name?: string };
    const finalSigners: SignerRow[] = [];

    if (parsed.data.includeFirmSigners) {
      for (const fs of getFirmSigners()) {
        finalSigners.push({
          email: fs.email,
          foreign: fs.foreign,
          role: "CONTRATADA",
          name: fs.name,
        });
      }
    }

    if (parsed.data.signers && parsed.data.signers.length > 0) {
      for (const s of parsed.data.signers) {
        // Evita duplicar e-mails (case-insensitive)
        if (finalSigners.some((x) => x.email.toLowerCase() === s.email.toLowerCase())) continue;
        finalSigners.push({
          email: s.email,
          foreign: s.foreign,
          role: s.role ?? "CONTRATANTE",
          name: s.name,
        });
      }
    } else if (parsed.data.signerEmail) {
      // Compatibilidade com chamadas antigas (single-signer)
      if (!finalSigners.some((x) => x.email.toLowerCase() === parsed.data.signerEmail!.toLowerCase())) {
        finalSigners.push({
          email: parsed.data.signerEmail,
          foreign: parsed.data.signerForeign,
          role: "CONTRATANTE",
        });
      }
    }

    if (finalSigners.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe pelo menos um signatário (CONTRATANTE)." },
        { status: 400 },
      );
    }

    // Resolve placeholder "__client__" → email do CONTRATANTE primário
    const firstClient = finalSigners.find((s) => s.role === "CONTRATANTE");
    const resolvedPins = normalizeLegacySignaturePins(pinsToApply).map((p) =>
      p.email === "__client__" && firstClient
        ? { ...p, email: firstClient.email }
        : p
    );
    // Filtra pins para incluir apenas os de signatários efetivamente no envio
    const finalEmails = new Set(finalSigners.map((s) => s.email.toLowerCase()));
    const filteredPins = resolvedPins.filter((p) => finalEmails.has(p.email.toLowerCase()));

    const result = await connector.sendDocumentForSignature({
      safeUuid: d4Env.safeUuid,
      file: blob,
      fileName: filename,
      signers: finalSigners.map((s) => ({ email: s.email, foreign: s.foreign })),
      message: parsed.data.message || undefined,
      skipEmail: parsed.data.embedMode ? "1" : "0", // EMBED: não envia e-mail
      signingWorkflow: "0",
      uploadWorkflow: "2",
      pins: filteredPins.length > 0 ? filteredPins : undefined,
    });

    const linkContrato = result.primarySignatureLink ?? result.signatureLinks[0]?.link ?? null;
    const nowIso = generatedAt.toISOString();

    // Monta lista de signatários inicial (todos aguardando) — enriquecida com role/name
    const initialSigners = buildInitialD4SignSigners(result.signerKeys, finalSigners);

    // Atualizar oportunidade
    const updatePayload: Record<string, unknown> = {
      d4sign_document_uuid: result.documentUuid,
      d4sign_status: "sent",
      d4sign_updated_at: nowIso,
      updated_at: nowIso,
      d4sign_signers: initialSigners,
    };
    if (linkContrato) {
      updatePayload.link_contrato = linkContrato;
    }
    // Avança etapa para contrato_enviado após elaboração/revisão
    if (op.etapa === "confeccao_contrato" || op.etapa === "contrato_elaborado") {
      updatePayload.etapa = "contrato_enviado";
    }
    const { error: updateError } = await supabase
      .from("oportunidades")
      .update(updatePayload as never)
      .eq("id", oportunidadeId);
    if (updateError) throw updateError;

    // Registrar transição de etapa
    if (op.etapa === "confeccao_contrato" || op.etapa === "contrato_elaborado") {
      await supabase.from("transicoes_etapa").insert({
        oportunidade_id: oportunidadeId,
        etapa_origem: op.etapa,
        etapa_destino: "contrato_enviado",
        alterado_por: auth.profile.id,
        observacao: "Contrato enviado para assinatura D4Sign.",
      });

      await recordLeadActivityEvent(supabase, {
        oportunidadeId,
        kind: "contrato_enviado",
        title: "Contrato enviado para assinatura",
        detail: "Documento encaminhado via D4Sign.",
        etapa: "contrato_enviado",
        actorAppUserId: auth.profile.id,
        sourceId: `d4sign-send:${result.documentUuid}`,
        metadata: { document_uuid: result.documentUuid },
      });
      await recordLeadActivityEvent(supabase, {
        oportunidadeId,
        kind: "etapa_alterada",
        title: "Etapa alterada",
        detail: `${op.etapa} → contrato_enviado`,
        etapa: "contrato_enviado",
        actorAppUserId: auth.profile.id,
        sourceId: `d4sign-send-trans:${result.documentUuid}`,
        metadata: { from: op.etapa, to: "contrato_enviado" },
      });
    }

    // Salvar versão gerada
    const { data: instance } = await supabase
      .from("document_instances")
      .select("id, current_version")
      .eq("oportunidade_id", oportunidadeId)
      .eq("template_id", template.id)
      .maybeSingle();

    if (instance) {
      const nextVersion = Number(instance.current_version ?? 0) + 1;
      const dataSnapshot: Json = {
        templateId: template.id,
        templateName: template.name,
        fields: fieldByCode as unknown as Json,
        sentToD4Sign: true,
        d4signDocumentUuid: result.documentUuid,
        signerEmail: parsed.data.signerEmail,
      };
      await supabase.from("document_versions").insert({
        instance_id: instance.id,
        version_number: nextVersion,
        data_snapshot: dataSnapshot,
        generated_by: auth.profile.id,
      });
      await supabase
        .from("document_instances")
        .update({ current_version: nextVersion, status: "sent" })
        .eq("id", instance.id);
    }

    // Inserir/atualizar em d4sign_documents (fonte de verdade)
    await supabase.from("d4sign_documents").upsert(
      {
        uuid_doc:              result.documentUuid,
        name_document:         filename,
        safe_uuid:             d4Env.safeUuid,
        d4sign_status:         "sent",
        status_name:           "Enviado",
        oportunidade_id:       oportunidadeId,
        link_contrato:         linkContrato,
        created_at_d4sign:     nowIso,
        updated_at:            nowIso,
        signers:               initialSigners as never,
        sent_by_app_user_id:   auth.profile.id,
      },
      { onConflict: "uuid_doc", ignoreDuplicates: false },
    );

    // Sincroniza status/assinaturas reais da D4Sign (1 req) — não bloqueia envio
    try {
      const rows = await pickDocumentsToEnrich({ limit: 1, uuidDoc: result.documentUuid });
      if (rows.length > 0) {
        await enrichDocuments(d4Env, rows, { apiSource: "send" });
      }
    } catch {
      // signatários iniciais já foram gravados via createlist
    }

    // Registrar webhook (tenta; não falha o envio se falhar)
    const d4Env2 = getD4SignEnv();
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
      request.nextUrl.origin;
    const webhookUrl = `${appBase}/api/integrations/d4sign/webhook`;
    try {
      await connector.registerWebhook(result.documentUuid, webhookUrl);
    } catch {
      // não critico — webhook pode ser configurado manualmente
    }
    void d4Env2; // usado acima via d4Env

    return NextResponse.json({
      ok: true,
      documentUuid: result.documentUuid,
      linkContrato,
      signatureLinks: result.signatureLinks,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao enviar contrato para assinatura.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
