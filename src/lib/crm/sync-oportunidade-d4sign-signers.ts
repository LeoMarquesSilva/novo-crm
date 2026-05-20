import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PersistedD4SignSigner = {
  email: string;
  key_signer: string | null;
  signed: boolean;
  signed_at: string | null;
  role?: "CONTRATADA" | "CONTRATANTE" | null;
  name?: string | null;
  act?: string | null;
  foreign?: string | null;
  user_document?: string | null;
  sign_info?: Record<string, unknown> | null;
};

type SignerMeta = {
  role?: "CONTRATADA" | "CONTRATANTE" | null;
  name?: string | null;
};

/** Mescla signatários da D4Sign com role/name já gravados na oportunidade. */
export function mergeOportunidadeD4SignSigners(
  incoming: PersistedD4SignSigner[],
  existing: PersistedD4SignSigner[] | null | undefined,
): PersistedD4SignSigner[] {
  const metaByEmail = new Map<string, SignerMeta>();
  for (const row of existing ?? []) {
    if (!row.email) continue;
    metaByEmail.set(row.email.trim().toLowerCase(), {
      role: row.role ?? null,
      name: row.name ?? null,
    });
  }
  return incoming.map((s) => {
    const meta = metaByEmail.get(s.email.trim().toLowerCase());
    return {
      ...s,
      role: meta?.role ?? s.role ?? "CONTRATANTE",
      name: meta?.name ?? s.name ?? null,
    };
  });
}

/** Copia signatários enriquecidos para `oportunidades` (kanban lê daqui). */
export async function syncOportunidadeFromD4SignSigners(
  supabase: SupabaseClient,
  oportunidadeId: string,
  signers: PersistedD4SignSigner[],
  options?: {
    d4signStatus?: string | null;
    nowIso?: string;
    advanceStageIfAllSigned?: boolean;
  },
): Promise<void> {
  const nowIso = options?.nowIso ?? new Date().toISOString();
  const { data: opp } = await supabase
    .from("oportunidades")
    .select("d4sign_signers, etapa")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (!opp) return;

  const merged = mergeOportunidadeD4SignSigners(
    signers,
    (opp.d4sign_signers ?? []) as PersistedD4SignSigner[],
  );
  const allSigned = merged.length > 0 && merged.every((s) => s.signed);

  const updatePayload: Record<string, unknown> = {
    d4sign_signers: merged,
    d4sign_updated_at: nowIso,
    updated_at: nowIso,
  };
  if (options?.d4signStatus) {
    updatePayload.d4sign_status = options.d4signStatus;
  }
  if (
    options?.advanceStageIfAllSigned &&
    allSigned &&
    opp.etapa === "contrato_enviado"
  ) {
    updatePayload.etapa = "contrato_assinado";
  }

  await supabase.from("oportunidades").update(updatePayload as never).eq("id", oportunidadeId);

  if (
    options?.advanceStageIfAllSigned &&
    allSigned &&
    opp.etapa === "contrato_enviado"
  ) {
    await supabase.from("transicoes_etapa").insert({
      oportunidade_id: oportunidadeId,
      etapa_origem: "contrato_enviado",
      etapa_destino: "contrato_assinado",
      alterado_por: null,
      observacao: "Automático após sincronização D4Sign (todos assinaram).",
    });
  }
}

/** Monta signatários iniciais a partir das keys do createlist (não depende de signaturelink). */
export function buildInitialD4SignSigners(
  signerKeys: Array<{ email: string; keySigner: string }>,
  metaRows: Array<{
    email: string;
    role?: "CONTRATADA" | "CONTRATANTE";
    name?: string | null;
  }>,
): PersistedD4SignSigner[] {
  const metaByEmail = new Map(
    metaRows.map((r) => [r.email.trim().toLowerCase(), r] as const),
  );
  return signerKeys.map((sk) => {
    const meta = metaByEmail.get(sk.email.trim().toLowerCase());
    return {
      email: sk.email,
      key_signer: sk.keySigner,
      signed: false,
      signed_at: null,
      role: meta?.role ?? "CONTRATANTE",
      name: meta?.name ?? null,
    };
  });
}

export async function getOportunidadeIdByDocumentUuid(
  uuidDoc: string,
): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
    .from("d4sign_documents")
    .select("oportunidade_id")
    .eq("uuid_doc", uuidDoc)
    .maybeSingle();
  if (data?.oportunidade_id) return String(data.oportunidade_id);
  const { data: opp } = await supabase
    .from("oportunidades")
    .select("id")
    .eq("d4sign_document_uuid", uuidDoc)
    .maybeSingle();
  return opp?.id ? String(opp.id) : null;
}
