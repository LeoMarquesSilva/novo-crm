import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapExtractionToConfiguration } from "@/lib/contract-import/map-to-configuration";
import { importedContractTitle } from "@/lib/contract-import/match-carteira";
import { createImportedContractDraft } from "@/lib/contract-import/persist-draft";
import { parseContractImportExtraction } from "@/lib/contract-import/schemas";
import type { SioeRateioSnapshot } from "@/lib/contract-import/sioe-rateio";
import { fetchSioeHonorariosRateio } from "@/lib/sioe/rateios";
import { validateContractConfiguration } from "@/modules/contracts/domain/contract-validation";
import type { Json } from "@/lib/supabase/database.types";

const bodySchema = z.object({
  documentId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().optional(),
  clientId: z.string().uuid().nullable().optional(),
  grupoId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    const { batchId } = await params;
    const body = bodySchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const { data: doc, error } = await supabase
      .from("contract_import_documents")
      .select("*")
      .eq("id", body.documentId)
      .eq("batch_id", batchId)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
    if (doc.status !== "extraido") {
      return NextResponse.json({ ok: false, error: "Documento ainda não está em revisão." }, { status: 409 });
    }

    if (body.action === "reject") {
      await supabase
        .from("contract_import_documents")
        .update({
          status: "rejeitado",
          error_message: body.rejectionReason ?? "Rejeitado na revisão.",
          reviewed_by: auth.profile.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", body.documentId);
      return NextResponse.json({ ok: true });
    }

    const payload = doc.extraction_json;
    const payloadRecord =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const extraction = parseContractImportExtraction(payloadRecord.extraction);
    const clientId = body.clientId ?? doc.matched_cliente_id;
    const grupoId = body.grupoId ?? doc.matched_grupo_id;
    if (!clientId) {
      return NextResponse.json(
        { ok: false, error: "Selecione o cliente da carteira antes de aprovar." },
        { status: 422 },
      );
    }

    const matchPayload =
      payloadRecord.match && typeof payloadRecord.match === "object" && !Array.isArray(payloadRecord.match)
        ? (payloadRecord.match as { matchedDocuments?: unknown })
        : {};
    const matchedDocuments = Array.isArray(matchPayload.matchedDocuments)
      ? matchPayload.matchedDocuments.filter((value): value is string => typeof value === "string")
      : [];
    const { data: grupos } = await supabase.from("grupos_economicos").select("id, nome, chave_estavel");
    const grupoNome = (grupos ?? []).find((row) => row.id === grupoId)?.nome;
    let sioeRateio = (payloadRecord.sioeRateio as SioeRateioSnapshot | null) ?? null;
    sioeRateio =
      (await fetchSioeHonorariosRateio(
        [...matchedDocuments, ...extraction.parties.map((party) => party.documento)],
        { groupNames: grupoNome ? [grupoNome] : [] },
      )) ?? sioeRateio;

    const configuration = mapExtractionToConfiguration({
      extraction,
      clientId,
      versionId: randomUUID(),
      nextId: () => randomUUID(),
      sioeRateio,
    });
    const blocking = validateContractConfiguration(configuration, { imported: true }).filter(
      (issue) => issue.severity === "error",
    );
    if (blocking.length) {
      return NextResponse.json(
        { ok: false, error: "Extração incompleta para gravar o rascunho.", issues: blocking },
        { status: 422 },
      );
    }

    const created = await createImportedContractDraft({
      supabase,
      actorId: auth.profile.id,
      title: importedContractTitle({
        extraction,
        match: { grupoId, clienteId: clientId, matchedDocuments: [] },
        grupos: (grupos ?? []).map((row) => ({
          id: row.id,
          nome: row.nome,
          chaveEstavel: row.chave_estavel,
        })),
        filename: doc.original_filename,
      }),
      grupoId,
      clientId,
      configuration,
      extras: {
        ...(extraction.extras ?? {}),
        ...(sioeRateio ? { sioeRateio } : {}),
      } as Json,
    });

    await supabase
      .from("contract_import_documents")
      .update({
        status: "aprovado",
        contrato_id: created.contractId,
        matched_cliente_id: clientId,
        matched_grupo_id: grupoId,
        reviewed_by: auth.profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.documentId);

    return NextResponse.json({ ok: true, data: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao revisar importação.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
