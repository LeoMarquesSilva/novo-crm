"use client";

import Link from "next/link";
import { CheckCircle2, Clock, Hourglass, PenLine } from "lucide-react";
import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { PartnerSignaturesBoard } from "@/components/crm/partner-signatures/partner-signatures-board";
import {
  countPartnerTabs,
  daysSince,
  type ClassifiedPartnerDoc,
  type PartnerSigner,
} from "@/lib/d4sign/partner-signatures";

type Props = {
  docs: ClassifiedPartnerDoc[];
  partners: PartnerSigner[];
  currentPartnerEmail: string | null;
  canCancel?: boolean;
  error: string | null;
  withoutSignersPending: number;
  showTechnicalLink: boolean;
};

export function PartnerSignaturesScreen({
  docs,
  partners,
  currentPartnerEmail,
  canCancel = false,
  error,
  withoutSignersPending,
  showTechnicalLink,
}: Props) {
  const pendingByPartner = partners.map((partner) => ({
    partner,
    count: countPartnerTabs(docs, partner.email).pendente,
  }));
  const waitingOthers = countPartnerTabs(docs, "all").aguardando_outros;
  const finalizedLast30 = docs.filter((doc) => {
    const at = doc.finalizedAt ?? doc.lastSignedAt;
    return doc.lifecycle === "finalizado" && at !== null && daysSince(at) <= 30;
  }).length;

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

  function onSignOpen(doc: ClassifiedPartnerDoc) {
    void fetch(`/api/crm/d4sign/documents/${doc.uuid}/sign-refresh`, {
      method: "POST",
      keepalive: true,
    });
  }

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
          {showTechnicalLink ? (
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
        canCancel={canCancel}
        onSignOpen={onSignOpen}
      />
    </div>
  );
}
