"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  FileSignature,
  PenLine,
  Search,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { D4SignSignButton } from "@/components/crm/d4sign-sign-button";
import { Input } from "@/components/ui/input";
import { D4SignViewDialog } from "@/components/crm/d4sign-view-dialog";
import { useD4SignDocumentsRealtime } from "@/lib/crm/use-d4sign-realtime";
import {
  countPartnerTabs,
  daysSince,
  partnerDocTab,
  resolvePartnerEmail,
  signerIsPending,
  type ClassifiedPartnerDoc,
  type PartnerFilter,
  type PartnerSigner,
  type PartnerTab,
} from "@/lib/d4sign/partner-signatures";
import { d4signDocumentOpenPath } from "@/lib/d4sign/portal-url";
import { cn } from "@/lib/utils";

const TAB_LABEL: Record<PartnerTab, string> = {
  pendente: "Pendentes de assinatura",
  aguardando_outros: "Aguardando outros",
  finalizado: "Finalizados",
  cancelado: "Cancelados",
};

const TAB_EMPTY: Record<PartnerTab, string> = {
  pendente: "Nenhum contrato aguardando assinatura 🎉",
  aguardando_outros: "Nenhum contrato aguardando outros signatários.",
  finalizado: "Nenhum contrato finalizado.",
  cancelado: "Nenhum contrato cancelado.",
};

/** Pendência acima disso ganha destaque de atraso. */
const STALE_DAYS = 7;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type Props = {
  docs: ClassifiedPartnerDoc[];
  partners: PartnerSigner[];
  /** E-mail canônico do sócio logado; `null` para admin que não é sócio. */
  currentPartnerEmail: string | null;
};

export function PartnerSignaturesBoard({ docs, partners, currentPartnerEmail }: Props) {
  const router = useRouter();
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>(currentPartnerEmail ?? "all");
  const [tab, setTab] = useState<PartnerTab>("pendente");
  const [query, setQuery] = useState("");

  const [view, setView] = useState<
    | { open: true; documentUuid: string; documentName: string | null }
    | { open: false }
  >({ open: false });

  // Webhook D4Sign atualiza `d4sign_documents` → recarrega a lista.
  useD4SignDocumentsRealtime(() => router.refresh());

  const partnerByEmail = useMemo(() => new Map(partners.map((p) => [p.email, p])), [partners]);

  const pendingByPartner = useMemo(() => {
    const out: Record<string, number> = { all: countPartnerTabs(docs, "all").pendente };
    for (const p of partners) out[p.email] = countPartnerTabs(docs, p.email).pendente;
    return out;
  }, [docs, partners]);

  const tabCounts = useMemo(() => countPartnerTabs(docs, partnerFilter), [docs, partnerFilter]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = docs.filter((d) => {
      if (partnerDocTab(d, partnerFilter) !== tab) return false;
      if (!q) return true;
      return [d.name, d.clientName, d.area].some((v) => v?.toLowerCase().includes(q));
    });
    // Pendentes: mais antigos primeiro (o que está parado há mais tempo). Demais: mais recentes primeiro.
    const key = (d: ClassifiedPartnerDoc) =>
      new Date((tab === "pendente" ? d.waitingSince : d.finalizedAt ?? d.waitingSince) ?? 0).getTime();
    return list.sort((a, b) => (tab === "pendente" ? key(a) - key(b) : key(b) - key(a)));
  }, [docs, partnerFilter, tab, query]);

  function portalUrl(uuid: string) {
    return d4signDocumentOpenPath(uuid);
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-(--radius-v2-full) border px-3 py-1 text-xs font-semibold transition-colors",
      active
        ? "border-interactive-600 bg-interactive-600 text-white"
        : "border-neutral-200 bg-white text-muted-foreground hover:border-neutral-300",
    );
  const chipCount = (active: boolean) =>
    cn(
      "rounded-(--radius-v2-full) px-1.5 py-0.5 text-[10px] font-bold",
      active ? "bg-white/25" : "bg-warning-bg text-warning-text",
    );

  return (
    <div className="space-y-4">
      {currentPartnerEmail === null ? (
        <p className="rounded-(--radius-v2-lg) border border-info-border bg-info-bg px-4 py-2.5 text-xs text-info-text">
          Você está vendo como administrador. O botão <strong>Assinar</strong> aparece só quando o próprio
          sócio (Gustavo ou Ricardo) acessa com o login dele.
        </p>
      ) : null}

      {/* Filtro por sócio */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sócio</span>
        <button type="button" className={chip(partnerFilter === "all")} onClick={() => setPartnerFilter("all")}>
          Todos
          {pendingByPartner.all > 0 ? (
            <span className={chipCount(partnerFilter === "all")}>{pendingByPartner.all}</span>
          ) : null}
        </button>
        {partners.map((p) => (
          <button
            key={p.email}
            type="button"
            className={chip(partnerFilter === p.email)}
            onClick={() => setPartnerFilter(p.email)}
          >
            {p.firstName}
            {p.email === currentPartnerEmail ? <span className="font-normal opacity-80">(você)</span> : null}
            {pendingByPartner[p.email] > 0 ? (
              <span className={chipCount(partnerFilter === p.email)}>{pendingByPartner[p.email]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Abas de situação + busca */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200">
        <div role="tablist" aria-label="Situação" className="-mb-px flex flex-wrap gap-1">
          {(Object.keys(TAB_LABEL) as PartnerTab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
                tab === t
                  ? "border-interactive-600 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {TAB_LABEL[t]}
              <span
                className={cn(
                  "rounded-(--radius-v2-full) px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                  t === "pendente" && tabCounts[t] > 0
                    ? "bg-warning-bg text-warning-text"
                    : "bg-neutral-100 text-muted-foreground",
                )}
              >
                {tabCounts[t]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative mb-2 w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar contrato ou cliente"
            className="pl-9"
            aria-label="Buscar contrato ou cliente"
          />
        </div>
      </div>

      {/* Lista */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-(--radius-v2-xl) border-2 border-dashed border-neutral-200 bg-white py-16 text-center">
          <FileSignature className="mb-3 size-10 text-neutral-300" aria-hidden />
          <p className="text-sm font-semibold text-muted-foreground">
            {query.trim() ? "Nenhum contrato encontrado para esta busca." : TAB_EMPTY[tab]}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
          {visible.map((doc) => {
            const days = doc.waitingSince ? daysSince(doc.waitingSince) : null;
            const stale = tab === "pendente" && days !== null && days >= STALE_DAYS;
            const mySlot = currentPartnerEmail ? doc.partners[currentPartnerEmail] : undefined;
            const canSign = doc.lifecycle === "em_andamento" && mySlot !== undefined && !mySlot.signed;
            const pendingPartnerNames = Object.entries(doc.partners)
              .filter(([, s]) => !s.signed)
              .map(([email]) => partnerByEmail.get(email)?.firstName ?? email);

            return (
              <li key={doc.uuid} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:gap-6">
                {/* Documento */}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm font-semibold text-foreground" title={doc.name ?? undefined}>
                    {doc.name ?? "Documento sem nome"}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {doc.clientName ? <span className="font-medium text-foreground/80">{doc.clientName}</span> : null}
                    {doc.area ? <span>· {doc.area}</span> : null}
                    {doc.createdAt ? (
                      <span>· enviado em {fmtDate(doc.createdAt)}</span>
                    ) : doc.contractDate ? (
                      <span>· contrato de {fmtDate(doc.contractDate)}</span>
                    ) : null}
                    {doc.lastSignedAt && doc.lifecycle !== "finalizado" ? <span>· última assinatura em {fmtDate(doc.lastSignedAt)}</span> : null}
                    {doc.lifecycle === "finalizado" && (doc.finalizedAt ?? doc.lastSignedAt) ? (
                      <span>· finalizado em {fmtDate(doc.finalizedAt ?? doc.lastSignedAt)}</span>
                    ) : null}
                  </p>
                  {tab === "pendente" && days !== null ? (
                    <p
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold",
                        stale ? "text-danger-text" : "text-warning-text",
                      )}
                    >
                      <Clock className="size-3" aria-hidden />
                      {days === 0 ? "Movimentado hoje" : `Parado há ${days} dia${days !== 1 ? "s" : ""}`}
                      {partnerFilter === "all" && pendingPartnerNames.length > 0
                        ? ` · falta ${pendingPartnerNames.join(" e ")}`
                        : null}
                    </p>
                  ) : null}
                </div>

                {/* Signatários */}
                <ul className="flex flex-wrap gap-1.5 lg:max-w-[40%]">
                  {doc.signers.map((s, i) => {
                    const pending = signerIsPending(s);
                    const partnerEmail = resolvePartnerEmail(s.email, partners);
                    const label =
                      (partnerEmail && partnerByEmail.get(partnerEmail)?.firstName) ||
                      s.name?.trim() ||
                      s.user_name?.trim() ||
                      s.email ||
                      `Signatário ${i + 1}`;
                    return (
                      <li
                        key={`${s.email ?? ""}-${i}`}
                        title={s.email ?? undefined}
                        className={cn(
                          "inline-flex max-w-[180px] items-center gap-1 rounded-(--radius-v2-full) border px-2 py-0.5 text-[11px] font-medium",
                          !pending
                            ? "border-success-border bg-success-bg text-success-text"
                            : partnerEmail
                              ? "border-warning-border bg-warning-bg text-warning-text"
                              : "border-neutral-200 bg-neutral-50 text-muted-foreground",
                        )}
                      >
                        {pending ? (
                          <Clock className="size-3 shrink-0" aria-label="Pendente" />
                        ) : (
                          <CheckCircle2 className="size-3 shrink-0" aria-label="Assinou" />
                        )}
                        <span className="truncate">{label}</span>
                      </li>
                    );
                  })}
                </ul>

                {/* Ações */}
                <div className="flex shrink-0 flex-wrap gap-2">
                  {canSign && mySlot ? (
                    <D4SignSignButton
                      documentUuid={doc.uuid}
                      signerEmail={mySlot.signerEmail}
                      signerName={mySlot.signerName}
                      keySigner={mySlot.keySigner}
                      className={buttonVariants({ size: "sm" })}
                      onClosed={() => router.refresh()}
                    >
                      <PenLine />
                      Assinar
                    </D4SignSignButton>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setView({ open: true, documentUuid: doc.uuid, documentName: doc.name })}
                  >
                    <Eye />
                    Ver PDF
                  </Button>
                  <a
                    href={portalUrl(doc.uuid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-(--radius-v2-md) px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    D4Sign
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view.open ? (
        <D4SignViewDialog
          open
          onOpenChange={(v) => {
            if (!v) setView({ open: false });
          }}
          documentUuid={view.documentUuid}
          documentName={view.documentName}
          portalUrl={portalUrl(view.documentUuid)}
        />
      ) : null}
    </div>
  );
}
