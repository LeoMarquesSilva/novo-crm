import { redirect } from "next/navigation";
import { PartnerSignaturesScreen } from "@/components/crm/partner-signatures/partner-signatures-screen";
import { requireAuth } from "@/lib/auth/server";
import { resolveD4SignSenders } from "@/lib/d4sign/document-sender";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { openPartnerSignAssumptions, type PartnerSignAssumption } from "@/lib/d4sign/partner-sign-assumption";
import { isPartnerOnlyEmail } from "@/lib/d4sign/partner-only";
import { loadPartnerSignerRefreshRequests } from "@/lib/d4sign/partner-sign-refresh-queue";
import {
  canAccessPartnerSignatures,
  classifyPartnerDoc,
  lifecycleFromStatus,
  parseSigners,
  resolvePartnerEmail,
  toPartnerSigners,
  type ClassifiedPartnerDoc,
} from "@/lib/d4sign/partner-signatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

type DocRow = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  created_at_d4sign: string | null;
  finalized_at: string | null;
  folder_area: string | null;
  folder_name: string | null;
  signers: unknown;
  details_fetched_at: string | null;
  sent_by_app_user_id: string | null;
  sent_by_name: string | null;
  sent_by_email: string | null;
  sent_at: string | null;
  oportunidades: { solicitante_nome: string } | null;
};

/** Todos os documentos D4Sign, de todos os cofres (paginado — PostgREST limita a 1000 linhas). */
async function loadAllDocuments(): Promise<{ rows: DocRow[]; error: string | null }> {
  const supabase = createSupabaseAdminClient();
  const rows: DocRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("d4sign_documents")
      .select(
        "uuid_doc, name_document, d4sign_status, created_at_d4sign, finalized_at, folder_area, folder_name, signers, details_fetched_at, sent_by_app_user_id, sent_by_name, sent_by_email, sent_at, oportunidades(solicitante_nome)",
      )
      .order("created_at_d4sign", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as DocRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { rows, error: null };
}

export default async function AssinarContratosPage() {
  const { user, profile } = await requireAuth("/crm/assinar-contratos");
  const partners = toPartnerSigners(getFirmSigners());
  if (!canAccessPartnerSignatures({ role: profile.role, email: user.email, partners })) {
    redirect("/crm");
  }

  const loaded = await loadAllDocuments();
  const error = loaded.error;
  const rows = await resolveD4SignSenders(loaded.rows);

  const docs: ClassifiedPartnerDoc[] = [];
  let withoutSignersPending = 0;
  for (const row of rows) {
    if (parseSigners(row.signers).length === 0) {
      if (lifecycleFromStatus(row.d4sign_status) === "em_andamento") withoutSignersPending += 1;
      continue;
    }
    const doc = classifyPartnerDoc(
      { ...row, client_name: row.oportunidades?.solicitante_nome ?? null },
      partners,
    );
    if (doc) docs.push(doc);
  }

  const currentPartnerEmail = resolvePartnerEmail(user.email, partners);
  const isAdmin = profile.role === "admin";
  let sharedAssumptions: PartnerSignAssumption[] = [];
  try {
    sharedAssumptions = openPartnerSignAssumptions(docs, await loadPartnerSignerRefreshRequests());
  } catch (loadError) {
    console.warn(
      "[D4Sign] baixas provisórias",
      loadError instanceof Error ? loadError.message : loadError,
    );
  }

  return (
    <PartnerSignaturesScreen
      docs={docs}
      partners={partners}
      currentPartnerEmail={currentPartnerEmail}
      sharedAssumptions={sharedAssumptions}
      canCancel={isAdmin}
      error={error}
      withoutSignersPending={withoutSignersPending}
      showTechnicalLink={isAdmin && !isPartnerOnlyEmail(user.email)}
    />
  );
}
