import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/scope-import/text-extraction";
import { CONTRACT_IMPORT_MIN_CHARS_PER_PAGE } from "@/lib/contract-import/constants";
import { stripD4SignCertificate } from "@/lib/contract-import/document-text";
import { extractContractFromText } from "@/lib/contract-import/extract";
import { matchExtractionToCarteira } from "@/lib/contract-import/match-carteira";
import { mapExtractionToConfiguration } from "@/lib/contract-import/map-to-configuration";
import { validateContractConfiguration } from "@/modules/contracts/domain/contract-validation";
import { fetchSioeHonorariosRateio } from "@/lib/sioe/rateios";
import type { Json } from "@/lib/supabase/database.types";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const { batchId } = await params;
  const retryFailed = new URL(request.url).searchParams.get("retry") === "1";
  const supabase = createSupabaseAdminClient();
  const queued = (
    await supabase
      .from("contract_import_documents")
      .select("id, status")
      .eq("batch_id", batchId)
      .eq("status", retryFailed ? "erro" : "enviado")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
  ).data;

  const { data: claimed } = queued
    ? await supabase
        .from("contract_import_documents")
        .update({ status: "processando", error_message: null })
        .eq("id", queued.id)
        .eq("status", queued.status)
        .select("*")
        .maybeSingle()
    : { data: null };

  if (!claimed) {
    const { data: remaining } = await supabase
      .from("contract_import_documents")
      .select("status")
      .eq("batch_id", batchId);
    const pending = (remaining ?? []).filter((row) =>
      ["enviado", "processando", "aguardando_upload"].includes(row.status),
    ).length;
    if (pending === 0) {
      await supabase.from("contract_import_batches").update({ status: "revisao" }).eq("id", batchId);
    }
    return NextResponse.json({ ok: true, data: { done: pending === 0, document: null } });
  }

  try {
    const { data: blob, error: downloadError } = await supabase.storage
      .from(claimed.storage_bucket)
      .download(claimed.storage_path);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "Falha ao baixar PDF.");
    const extracted = await extractDocumentText(Buffer.from(await blob.arrayBuffer()), claimed.content_type ?? "application/pdf");
    if (!extracted.text.trim()) throw new Error("Nenhum texto extraído do PDF.");
    if (extracted.charsPerPage < CONTRACT_IMPORT_MIN_CHARS_PER_PAGE) {
      throw new Error("PDF provavelmente escaneado; extração de texto insuficiente.");
    }
    const stripped = stripD4SignCertificate(extracted.text);
    const ai = await extractContractFromText(claimed.original_filename, stripped.body);
    const extraction = {
      ...ai.data,
      d4signUuid: ai.data.d4signUuid ?? stripped.d4signUuid,
    };

    const [{ data: grupos }, { data: clientes }] = await Promise.all([
      supabase.from("grupos_economicos").select("id, nome, chave_estavel"),
      supabase.from("clientes").select("id, razao_social, documento, grupo_id"),
    ]);
    const match = matchExtractionToCarteira({
      extraction,
      grupos: (grupos ?? []).map((row) => ({
        id: row.id,
        nome: row.nome,
        chaveEstavel: row.chave_estavel,
      })),
      clientes: (clientes ?? []).map((row) => ({
        id: row.id,
        razaoSocial: row.razao_social,
        documento: row.documento,
        grupoId: row.grupo_id,
      })),
    });

    const grupoNome = (grupos ?? []).find((row) => row.id === match.grupoId)?.nome;
    const sioeRateio = await fetchSioeHonorariosRateio(
      [...match.matchedDocuments, ...extraction.parties.map((party) => party.documento)],
      { groupNames: grupoNome ? [grupoNome] : [] },
    );

    const versionId = randomUUID();
    const configuration = mapExtractionToConfiguration({
      extraction,
      clientId: match.clienteId,
      versionId,
      nextId: () => randomUUID(),
      sioeRateio,
    });
    const issues = validateContractConfiguration(configuration, { imported: true });

    await supabase
      .from("contract_import_documents")
      .update({
        status: "extraido",
        page_count: extracted.pageCount,
        extracted_chars: stripped.body.length,
        extraction_json: { extraction, match, sioeRateio, issues, model: ai.model } as Json,
        d4sign_uuid: extraction.d4signUuid ?? null,
        matched_grupo_id: match.grupoId,
        matched_cliente_id: match.clienteId,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", claimed.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao processar PDF.";
    await supabase
      .from("contract_import_documents")
      .update({ status: "erro", error_message: message, processed_at: new Date().toISOString() })
      .eq("id", claimed.id);
  }

  const { data: docs } = await supabase.from("contract_import_documents").select("status").eq("batch_id", batchId);
  const processed = (docs ?? []).filter((row) => ["extraido", "erro", "aprovado"].includes(row.status)).length;
  const errors = (docs ?? []).filter((row) => row.status === "erro").length;
  const pending = (docs ?? []).filter((row) => ["enviado", "processando"].includes(row.status)).length;
  await supabase
    .from("contract_import_batches")
    .update({
      processed_count: processed,
      error_count: errors,
      status: pending === 0 ? "revisao" : "extraindo",
    })
    .eq("id", batchId);

  return NextResponse.json({
    ok: true,
    data: { done: pending === 0, processed, errors, total: docs?.length ?? 0 },
  });
}
