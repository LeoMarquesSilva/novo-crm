import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Hourglass, PenLine } from "lucide-react";
import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { PartnerSignaturesBoard } from "@/components/crm/partner-signatures/partner-signatures-board";
import { requireAuth } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import {
  canAccessPartnerSignatures,
  classifyPartnerDoc,
  countPartnerTabs,
  daysSince,
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
        "uuid_doc, name_document, d4sign_status, created_at_d4sign, finalized_at, folder_area, folder_name, signers, oportunidades(solicitante_nome)",
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

  const { rows, error } = await loadAllDocuments();

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
  const env = getD4SignEnv();
  const d4signPortalBase = env.apiBaseUrl.replace(/\/api\/.*$/, "");

  const pendingByPartner = partners.map((p) => ({
    partner: p,
    count: countPartnerTabs(docs, p.email).pendente,
  }));
  const waitingOthers = countPartnerTabs(docs, "all").aguardando_outros;
  const finalizedLast30 = docs.filter(
    (d) => d.lifecycle === "finalizado" && d.finalizedAt && daysSince(d.finalizedAt) <= 30,
  ).length;

  const stats: HeaderStat[] = [
    ...pendingByPartner.map(({ partner, count }) => ({
      label: `Pendentes · ${partner.firstName}`,
      value: count,
      detail: count === 1 ? "contrato aguardando assinatura" : "contratos aguardando assinatura",
      icon: PenLine,
      tone: count > 0 ? ("warning" as const) : ("default" as const),
    })),
    {
      label: "Aguardando outros",
      value: waitingOthers,
      detail: "sócios já assinaram, faltam outros signatários",
      icon: Hourglass,
    },
    {
      label: "Finalizados · 30 dias",
      value: finalizedLast30,
      detail: "contratos concluídos no período",
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Sócios"
        title="Assinar Contratos"
        description="Contratos D4Sign em que Gustavo ou Ricardo são signatários, de todos os cofres."
        icon={PenLine}
        stats={stats}
      />

      {error ? (
        <p className="rounded-(--radius-v2-lg) border border-danger-border bg-danger-bg px-4 py-2.5 text-sm font-semibold text-danger-text">
          Não foi possível carregar os documentos: {error}
        </p>
      ) : null}

      {withoutSignersPending > 0 ? (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {withoutSignersPending} documento{withoutSignersPending !== 1 ? "s" : ""} em andamento ainda sem
          dados de signatários não aparece{withoutSignersPending !== 1 ? "m" : ""} aqui.
          {isAdmin ? (
            <Link href="/crm/contratos?tab=d4sign" className="font-semibold text-interactive-700 hover:underline">
              Buscar na área técnica D4Sign
            </Link>
          ) : null}
        </p>
      ) : null}

      <PartnerSignaturesBoard
        docs={docs}
        partners={partners}
        currentPartnerEmail={currentPartnerEmail}
        d4signPortalBase={d4signPortalBase}
      />
    </div>
  );
}
