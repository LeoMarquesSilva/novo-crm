import Link from "next/link";
import { ClipboardList, FileUp, FolderKanban } from "lucide-react";
import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { D4SignDashboard } from "@/components/crm/d4sign-dashboard";
import { ContractsHub } from "@/components/crm/contracts/contracts-hub";
import { ContractHubOrphanGroupsTrigger } from "@/components/crm/contracts/contract-hub-orphan-groups";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { getD4SignQuotaStatus } from "@/lib/d4sign/api-usage";
import { EnsureContractDraftBanner } from "@/components/crm/contracts/ensure-contract-draft-banner";
import { canAccessContractCapability, canEnsureContractDraft } from "@/lib/auth/crm-access-policy";
import { getContractsPortfolio } from "@/modules/contracts/infrastructure/contract-queries";
import { centsToMaskedBrl } from "@/components/crm/contracts/contract-setup-form-helpers";
import { buttonVariants } from "@/components/ui/button";
import { overlayOfficialAvatars } from "@/lib/official-photos/overlay";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import { loadActiveGroupCoverage } from "@/lib/crm/contract-hub-coverage";
import { countContractsByArea, type AreaContractCount } from "@/lib/crm/contract-hub-summary";

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
      supabase.from("app_users").select("id, auth_user_id, full_name, avatar_url"),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));
    const usersWithOfficialPhotos = await overlayOfficialAvatars(
      (appUsers ?? []).map((u) => ({ id: u.id, avatarUrl: u.avatar_url })),
    );
    const officialAvatarById = new Map(usersWithOfficialPhotos.map((u) => [u.id, u.avatarUrl]));
    const map: Record<string, { avatarUrl: string | null; fullName: string }> = {};
    for (const u of appUsers ?? []) {
      const email = emailById.get(u.auth_user_id)?.toLowerCase();
      if (email) {
        map[email] = { avatarUrl: officialAvatarById.get(u.id) ?? u.avatar_url ?? null, fullName: u.full_name };
      }
    }
    return map;
  } catch {
    return {};
  }
}

function AreaCountExtra({ counts }: { counts: AreaContractCount[] }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {counts.map((row) => (
        <li key={row.area} className="flex min-w-0 items-center justify-between gap-2">
          <AreaIconLabel
            area={row.area}
            size="xs"
            className="min-w-0"
            nameClassName="text-xs font-medium text-foreground"
          />
          <span className="tabular-nums text-xs font-semibold text-foreground">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ setupOpportunityId?: string | string[]; tab?: string | string[] }>;
}) {
  const { profile } = await requireAuth("/crm/contratos");
  const query = await searchParams;
  const setupOpportunityId =
    typeof query.setupOpportunityId === "string" ? query.setupOpportunityId : null;
  const defaultTab = typeof query.tab === "string" ? query.tab : undefined;

  const [{ linked, unlinked, missingNames, error }, appUsersByEmail, quota, portfolioResult, coverage] = await Promise.all([
    getD4SignData(),
    getAppUsersByEmail(),
    getD4SignQuotaStatus(),
    getContractsPortfolio(),
    loadActiveGroupCoverage(),
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
  const suspensos = portfolio.filter((item) => item.lifecycle === "suspenso").length;
  const renovacaoProxima = portfolio.filter((item) => item.renewalSoon).length;
  const referenciaAnualCents = portfolio.reduce(
    (sum, item) => sum + Number(item.annualReferenceCents ?? 0),
    0,
  );
  const mensalProjetadoCents = portfolio.reduce(
    (sum, item) => sum + Number(item.monthlyProjectionCents ?? 0),
    0,
  );
  const fechamentosPendentes = portfolio.reduce((sum, item) => sum + item.pendingClosingCount, 0);
  const importadosPdf = portfolio.filter((item) => item.originImport === "pdf").length;
  const areaCounts = countContractsByArea(portfolio);
  const areasComContrato = areaCounts.filter((row) => row.count > 0).length;
  const assinaturasPendentes = all.filter(
    (r) => r.d4sign_status && !["1", "4"].includes(String(r.d4sign_status)),
  ).length;

  const extraStats: HeaderStat[] = [
    {
      label: "Contratos por área",
      value: areasComContrato,
      detail: "áreas canônicas com cadastro",
      span: 2,
      extra: <AreaCountExtra counts={areaCounts} />,
    },
    {
      label: "Grupos ativos × contratos",
      value: coverage.error ? "—" : `${coverage.coveredCount}/${coverage.activeCount}`,
      detail: coverage.error ?? "com contrato / Cliente ativo",
    },
    {
      label: "Ativos sem contrato",
      value: coverage.error ? "—" : coverage.orphans.length,
      detail: coverage.error ?? "Cliente ativo sem cadastro",
      tone: !coverage.error && coverage.orphans.length > 0 ? "danger" : "default",
      extra: <ContractHubOrphanGroupsTrigger groups={coverage.orphans} />,
    },
    {
      label: "Mensal projetado",
      value: centsToMaskedBrl(String(mensalProjetadoCents)) || "R$ 0,00",
      detail: "soma da carteira",
    },
    ...(fechamentosPendentes > 0
      ? [
          {
            label: "Fechamentos pendentes",
            value: fechamentosPendentes,
            detail: "a calcular ou em revisão",
            tone: "warning" as const,
            href: "/crm/contratos?tab=closing-review",
          },
        ]
      : []),
    ...(importadosPdf > 0
      ? [{ label: "Importados PDF", value: importadosPdf, detail: "origem importação" }]
      : []),
    ...(suspensos > 0 ? [{ label: "Suspensos", value: suspensos, detail: "ciclo interrompido" }] : []),
  ];

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Gestão contratual"
        title="Contratos"
        icon={FolderKanban}
        actions={
          <div className="flex flex-wrap gap-2">
            {canAccessContractCapability({ role: profile.role, capability: "configure" }) ? (
              <Link
                href="/crm/contratos/importacao"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <FileUp />
                Importar PDF
              </Link>
            ) : null}
            <Link
              href="/crm/contratos/simulacao"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ClipboardList />
              Roteiro de simulação
            </Link>
          </div>
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
          ...extraStats,
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
        orphanGroups={coverage.orphans}
        defaultTab={defaultTab}
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
