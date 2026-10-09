"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Hourglass, PenLine } from "lucide-react";
import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { PartnerSignaturesBoard } from "@/components/crm/partner-signatures/partner-signatures-board";
import {
  overlayPartnerSignAssumptions,
  partnerSignAssumptionKey,
  reconcilePartnerSignAssumptions,
} from "@/lib/d4sign/partner-sign-assumption";
import {
  emptyPartnerSignAssumptions,
  emptyRevertedPartnerSignNames,
  readPartnerSignAssumptions,
  readRevertedPartnerSignNames,
  rememberRevertedPartnerSignNames,
  subscribePartnerSignAssumptions,
  writePartnerSignAssumptions,
} from "@/lib/d4sign/partner-sign-assumption-store";
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
  const stored = useSyncExternalStore(
    subscribePartnerSignAssumptions,
    readPartnerSignAssumptions,
    emptyPartnerSignAssumptions,
  );
  const revertedNames = useSyncExternalStore(
    subscribePartnerSignAssumptions,
    readRevertedPartnerSignNames,
    emptyRevertedPartnerSignNames,
  );
  const reconciled = useMemo(
    () => reconcilePartnerSignAssumptions(docs, stored),
    [docs, stored],
  );

  useEffect(() => {
    if (reconciled.kept.length !== stored.length) {
      writePartnerSignAssumptions(reconciled.kept);
    }
    if (reconciled.reverted.length > 0) {
      const names = reconciled.reverted.map((assumption) => {
        const doc = docs.find((item) => item.uuid === assumption.uuid);
        return doc?.name?.trim() || "um contrato";
      });
      rememberRevertedPartnerSignNames(names);
    }
  }, [docs, reconciled.kept, reconciled.reverted, stored.length]);

  const view = useMemo(() => {
    const nextDocs: ClassifiedPartnerDoc[] = [];
    const provisionalByUuid: Record<string, string[]> = {};
    for (const doc of docs) {
      const overlaid = overlayPartnerSignAssumptions(doc, reconciled.kept);
      nextDocs.push(overlaid.doc);
      if (overlaid.provisionalEmails.length > 0) {
        provisionalByUuid[doc.uuid] = overlaid.provisionalEmails;
      }
    }
    return { docs: nextDocs, provisionalByUuid };
  }, [docs, reconciled.kept]);

  const pendingByPartner = partners.map((partner) => ({
    partner,
    count: countPartnerTabs(view.docs, partner.email).pendente,
  }));
  const waitingOthers = countPartnerTabs(view.docs, "all").aguardando_outros;
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

  function onPartnerSigned(doc: ClassifiedPartnerDoc) {
    if (!currentPartnerEmail) return;
    const source = docs.find((item) => item.uuid === doc.uuid) ?? doc;
    const slot = source.partners[currentPartnerEmail];
    if (!slot || slot.signed) return;
    const next = {
      uuid: source.uuid,
      partnerEmail: currentPartnerEmail,
      clickedAt: new Date().toISOString(),
      fetchedAtAtClick: source.signersFetchedAt,
      signedInEmbed: true,
    };
    const key = partnerSignAssumptionKey(next);
    writePartnerSignAssumptions([
      ...stored.filter((assumption) => partnerSignAssumptionKey(assumption) !== key),
      next,
    ]);
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

      {revertedNames.length > 0 ? (
        <p className="rounded-(--radius-v2-lg) border border-warning-border bg-warning-bg px-4 py-2.5 text-sm font-semibold text-warning-text">
          A D4Sign ainda não confirmou a assinatura de {revertedNames.join(", ")}. O contrato voltou para
          Pendentes.
        </p>
      ) : null}

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
        docs={view.docs}
        partners={partners}
        currentPartnerEmail={currentPartnerEmail}
        canCancel={canCancel}
        provisionalByUuid={view.provisionalByUuid}
        onSignOpen={onSignOpen}
        onPartnerSigned={onPartnerSigned}
      />
    </div>
  );
}
