import { FileSignature } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { D4SignDashboard } from "@/components/crm/d4sign-dashboard";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";

export const dynamic = "force-dynamic";

async function getD4SignData() {
  const supabase = createSupabaseAdminClient();

  const { data: linked, error: linkedErr } = await supabase
    .from("d4sign_documents")
    .select(`
      uuid_doc,
      name_document,
      d4sign_status,
      status_name,
      link_contrato,
      created_at_d4sign,
      finalized_at,
      safe_name,
      folder_uuid,
      folder_name,
      folder_path,
      folder_area,
      details_fetched_at,
      last_synced_at,
      signers,
      oportunidade_id,
      sent_by_app_user_id,
      oportunidades (
        id,
        solicitante_nome,
        etapa,
        d4sign_updated_at,
        created_at
      )
    `)
    .not("oportunidade_id", "is", null)
    .order("updated_at", { ascending: false });

  const { data: unlinked, error: unlinkedErr } = await supabase
    .from("d4sign_documents")
    .select(
      "uuid_doc, name_document, d4sign_status, status_name, created_at_d4sign, finalized_at, safe_name, folder_uuid, folder_name, folder_path, folder_area, details_fetched_at, last_synced_at, signers, sent_by_app_user_id",
    )
    .is("oportunidade_id", null)
    .order("updated_at", { ascending: false });

  const { count: missingNamesCount } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc", { count: "exact", head: true })
    .is("name_document", null);

  const senderIds = [
    ...new Set(
      [...(linked ?? []), ...(unlinked ?? [])]
        .map((r) => r.sent_by_app_user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const senderMap = new Map<string, { full_name: string; avatar_url: string | null }>();
  if (senderIds.length > 0) {
    const { data: senders } = await supabase
      .from("app_users")
      .select("id, full_name, avatar_url")
      .in("id", senderIds);
    for (const s of senders ?? []) {
      senderMap.set(s.id, { full_name: s.full_name, avatar_url: s.avatar_url ?? null });
    }
  }

  const withSender = <T extends { sent_by_app_user_id: string | null }>(rows: T[]) =>
    rows.map((r) => ({
      ...r,
      sent_by: r.sent_by_app_user_id ? (senderMap.get(r.sent_by_app_user_id) ?? null) : null,
    }));

  return {
    linked: withSender(linked ?? []),
    unlinked: withSender(unlinked ?? []),
    missingNames: missingNamesCount ?? 0,
    error: linkedErr?.message ?? unlinkedErr?.message ?? null,
  };
}

async function getAppUsersByEmail(): Promise<Record<string, { avatarUrl: string | null; fullName: string }>> {
  try {
    const supabase = createSupabaseAdminClient();
    const [{ data: appUsers }, { data: authData }] = await Promise.all([
      supabase.from("app_users").select("auth_user_id, full_name, avatar_url"),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const map: Record<string, { avatarUrl: string | null; fullName: string }> = {};
    for (const u of appUsers ?? []) {
      const email = emailById.get(u.auth_user_id)?.toLowerCase();
      if (email) map[email] = { avatarUrl: u.avatar_url ?? null, fullName: u.full_name };
    }
    return map;
  } catch {
    return {};
  }
}

export default async function ContratosPage() {
  await requireAuth("/crm/contratos");

  const [{ linked, unlinked, missingNames, error }, appUsersByEmail, quota] = await Promise.all([
    getD4SignData(),
    getAppUsersByEmail(),
    getD4SignQuotaStatus(),
  ]);
  const env = getD4SignEnv();
  const d4signPortalBase = env.apiBaseUrl.replace(/\/api\/.*$/, "");
  const firmSigners = getFirmSigners().map((s) => ({
    email: s.email,
    firstName: s.name.split(" ")[0],
    aliases: s.aliases ?? [],
  }));

  const all = [...linked, ...unlinked];
  const total = all.length;
  const pendentes = all.filter(
    (r) => r.d4sign_status && !["1", "4"].includes(String(r.d4sign_status)),
  ).length;
  const assinados = all.filter((r) => r.d4sign_status === "1").length;
  const cancelados = all.filter((r) => r.d4sign_status === "4").length;
  const semSigners = all.filter(
    (r) => !r.signers || (Array.isArray(r.signers) && r.signers.length === 0),
  ).length;

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="D4Sign — cofre histórico"
        title="Contratos — Assinatura Digital"
        description="Espelho do cofre D4Sign no CRM. Na pré-lançamento, estes documentos ainda não correspondem a leads — use Atualizar cofre para sincronizar status, pastas e signatários."
        icon={FileSignature}
        stats={[
          { label: "No cofre", value: total, detail: "documentos sincronizados" },
          { label: "Pendentes", value: pendentes, detail: "aguardando assinatura" },
          { label: "Assinados", value: assinados, detail: "finalizados" },
          { label: "Sem signatários", value: semSigners, detail: "precisam enrich" },
          ...(cancelados > 0
            ? [{ label: "Cancelados", value: cancelados, detail: "documentos" }]
            : []),
          ...(linked.length > 0
            ? [{ label: "Vinculados CRM", value: linked.length, detail: "com lead" }]
            : []),
        ]}
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Erro ao carregar contratos: {error}
        </div>
      ) : (
        <D4SignDashboard
          initialLinked={linked as Parameters<typeof D4SignDashboard>[0]["initialLinked"]}
          initialUnlinked={unlinked as Parameters<typeof D4SignDashboard>[0]["initialUnlinked"]}
          initialMissingNames={missingNames}
          initialQuota={quota}
          firmSigners={firmSigners}
          d4signPortalBase={d4signPortalBase}
          appUsersByEmail={appUsersByEmail}
        />
      )}
    </div>
  );
}
