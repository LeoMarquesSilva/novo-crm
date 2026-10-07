"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Hourglass, PenLine } from "lucide-react";
import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { PartnerSignaturesBoard } from "@/components/crm/partner-signatures/partner-signatures-board";
import {
  overlayPartnerSignAssumptions,
  reconcilePartnerSignAssumptions,
  type PartnerSignAssumption,
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

function listNames(names: string[]): string {
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}`;
}

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
  const reconciled = useMemo(() => reconcilePartnerSignAssumptions(docs, stored), [docs, stored]);
  const revertedNames = useSyncExternalStore(
    subscribePartnerSignAssumptions,
    readRevertedPartnerSignNames,
    emptyRevertedPartnerSignNames,
  );

  useEffect(() => {
    if (JSON.stringify(reconciled.kept) !== JSON.stringify(stored)) {
      writePartnerSignAssumptions(reconciled.kept);
    }
    if (reconciled.reverted.length === 0) return;
    rememberRevertedPartnerSignNames(
      reconciled.reverted.map(
        (assumption) => docs.find((doc) => doc.uuid === assumption.uuid)?.name ?? "Contrato",
      ),
    );
  }, [docs, reconciled, stored]);

  const views = useMemo(
    () => docs.map((doc) => overlayPartnerSignAssumptions(doc, reconciled.kept)),
    [docs, reconciled.kept],
  );
  const viewDocs = useMemo(() => views.map((view) => view.doc), [views]);
  const provisionalByUuid = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const view of views) {
      if (view.provisionalEmails.length > 0) out[view.doc.uuid] = view.provisionalEmails;
    }
    return out;
  }, [views]);

  const provisionalNames = views
    .filter((view) => view.provisionalEmails.length > 0)
    .map((view) => view.doc.name ?? "Contrato");

  const pendingByPartner = partners.map((partner) => ({
    partner,
    count: countPartnerTabs(viewDocs, partner.email).pendente,
  }));
  const waitingOthers = countPartnerTabs(viewDocs, "all").aguardando_outros;
  const finalizedLast30 = viewDocs.filter((doc) => {
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
    if (!currentPartnerEmail) return;
    const source = docs.find((item) => item.uuid === doc.uuid) ?? doc;
    const slot = source.partners[currentPartnerEmail];
    if (!slot || slot.signed) return;
    const next = stored.filter(
      (assumption) => !(assumption.uuid === source.uuid && assumption.partnerEmail === currentPartnerEmail),
    );
    const assumption: PartnerSignAssumption = {
      uuid: source.uuid,
      partnerEmail: currentPartnerEmail,
      clickedAt: new Date().toISOString(),
      fetchedAtAtClick: source.signersFetchedAt,
    };
    writePartnerSignAssumptions([...next, assumption]);
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

      {revertedNames.length > 0 ? (
        <p className="rounded-(--radius-v2-lg) border border-warning-border bg-warning-bg px-4 py-2.5 text-sm text-warning-text">
          A D4Sign atualizou {revertedNames.length === 1 ? "este contrato" : "estes contratos"} e a assinatura
          ainda não consta. {revertedNames.length === 1 ? "Ele voltou" : "Eles voltaram"} para Pendentes:{" "}
          {listNames(revertedNames)}.
        </p>
      ) : null}

      {provisionalNames.length > 0 ? (
        <p className="rounded-(--radius-v2-lg) border border-info-border bg-info-bg px-4 py-2.5 text-sm text-info-text">
          {provisionalNames.length === 1 ? "Este contrato saiu" : "Estes contratos saíram"} do contador de
          pendentes porque a assinatura foi aberta na D4Sign: {listNames(provisionalNames)}. A confirmação chega
          quando a D4Sign atualizar {provisionalNames.length === 1 ? "esse contrato" : "cada contrato"}. Se a
          atualização chegar e a assinatura ainda não constar, o contrato volta para Pendentes.
        </p>
      ) : null}

      <PartnerSignaturesBoard
        docs={viewDocs}
        partners={partners}
        currentPartnerEmail={currentPartnerEmail}
        canCancel={canCancel}
        provisionalByUuid={provisionalByUuid}
        onSignOpen={onSignOpen}
      />
    </div>
  );
}
