import Link from "next/link";
import { ClipboardList, FolderKanban } from "lucide-react";
import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { D4SignDashboard } from "@/components/crm/d4sign-dashboard";
import { ContractsHub } from "@/components/crm/contracts/contracts-hub";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { EnsureContractDraftBanner } from "@/components/crm/contracts/ensure-contract-draft-banner";
import { canEnsureContractDraft } from "@/lib/auth/crm-access-policy";
import { getContractsPortfolio } from "@/modules/contracts/infrastructure/contract-queries";
import { centsToMaskedBrl } from "@/components/crm/contracts/contract-setup-form-helpers";
import { buttonVariants } from "@/components/ui/button";

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

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ setupOpportunityId?: string | string[] }>;
}) {
  const { profile } = await requireAuth("/crm/contratos");
  const query = await searchParams;
  const setupOpportunityId =
    typeof query.setupOpportunityId === "string" ? query.setupOpportunityId : null;

  const [{ linked, unlinked, missingNames, error }, appUsersByEmail, quota, portfolioResult] = await Promise.all([
    getD4SignData(),
    getAppUsersByEmail(),
    getD4SignQuotaStatus(),
    getContractsPortfolio(),
  ]);
  const env = getD4SignEnv();
  const d4signPortalBase = env.apiBaseUrl.replace(/\/api\/.*$/, "");
  const firmSigners = getFirmSigners().map((s) => ({
    email: s.email,
    firstName: s.name.split(" ")[0],
    aliases: s.aliases ?? [],
  }));

  const all = [...linked, ...unlinked];
  const portfolio = portfolioResult.items;
  const ativos = portfolio.filter((item) => item.lifecycle === "ativo").length;
  const implantacao = portfolio.filter(
    (item) => item.lifecycle === "rascunho" || item.lifecycle === "em_revisao",
  ).length;
  const renovacaoProxima = portfolio.filter((item) => item.renewalSoon).length;
  const referenciaAnualCents = portfolio.reduce(
    (sum, item) => sum + Number(item.annualReferenceCents ?? 0),
    0,
  );
  const assinaturasPendentes = all.filter(
    (r) => r.d4sign_status && !["1", "4"].includes(String(r.d4sign_status)),
  ).length;

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Gestão contratual"
        title="Contratos"
        description="Carteira, configuração de faturamento, fechamentos e renovações. Assinaturas D4Sign ficam na aba dedicada."
        icon={FolderKanban}
        actions={
          <Link
            href="/crm/contratos/simulacao"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <ClipboardList />
            Roteiro de simulação
          </Link>
        }
        stats={[
          { label: "Na carteira", value: portfolio.length, detail: "contratos cadastrados" },
          { label: "Ativos", value: ativos, detail: "em vigência" },
          { label: "Em implantação", value: implantacao, detail: "rascunho ou revisão" },
          {
            label: "Referência anual",
            value: centsToMaskedBrl(referenciaAnualCents) || "R$ 0,00",
            detail: "soma da carteira",
          },
          ...(renovacaoProxima > 0
            ? [{ label: "Reajuste próximo", value: renovacaoProxima, detail: "atenção operacional" }]
            : []),
          ...(assinaturasPendentes > 0
            ? [
                {
                  label: "Assinaturas pendentes",
                  value: assinaturasPendentes,
                  detail: "cofre D4Sign",
                },
              ]
            : []),
        ]}
      />

      {setupOpportunityId ? (
        <EnsureContractDraftBanner
          opportunityId={setupOpportunityId}
          canEnsureDraft={canEnsureContractDraft(profile.role)}
        />
      ) : null}

      <ContractsHub
        portfolio={portfolio}
        portfolioError={portfolioResult.error}
        d4signError={error}
        d4sign={{
          initialLinked: linked as Parameters<typeof D4SignDashboard>[0]["initialLinked"],
          initialUnlinked: unlinked as Parameters<typeof D4SignDashboard>[0]["initialUnlinked"],
          initialMissingNames: missingNames,
          initialQuota: quota,
          firmSigners,
          d4signPortalBase,
          appUsersByEmail,
        }}
      />
    </div>
  );
}
