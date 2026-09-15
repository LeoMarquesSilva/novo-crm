"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BriefcaseBusiness,
  Clock3,
  Loader2,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

const RECENT_LEADS_KEY = "crm.global-lead-search.recent.v1";

type LeadSearchResult = {
  id: string;
  title: string;
  requesterEmail: string | null;
  requesterName: string | null;
  requesterAvatarUrl?: string | null;
  stage: string;
  type: string;
  hasDueDiligence: boolean;
  closingStatus: "ganho" | "perdido" | null;
  updatedAt: string;
};

type GlobalLeadSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function readRecentLeads(): LeadSearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_LEADS_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item): item is LeadSearchResult =>
              Boolean(
                item &&
                  typeof item === "object" &&
                  "id" in item &&
                  "title" in item &&
                  typeof item.id === "string" &&
                  typeof item.title === "string",
              ),
          )
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function storeRecentLead(
  lead: LeadSearchResult,
  current: LeadSearchResult[],
): LeadSearchResult[] {
  const next = [lead, ...current.filter((item) => item.id !== lead.id)].slice(0, 6);
  window.localStorage.setItem(RECENT_LEADS_KEY, JSON.stringify(next));
  return next;
}

export function GlobalLeadSearch({
  open,
  onOpenChange,
}: GlobalLeadSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSearchResult[]>([]);
  const [recent, setRecent] = useState<LeadSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setRecent(readRecentLeads()), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const controller = new AbortController();
    const normalizedQuery = query.trim();
    const timer = window.setTimeout(
      async () => {
        if (normalizedQuery.length < 2) {
          setResults([]);
          setLoading(false);
          setError(null);
          return;
        }

        setLoading(true);
        setError(null);
        try {
          const response = await fetch(
            `/api/crm/leads/search?query=${encodeURIComponent(normalizedQuery)}`,
            { cache: "no-store", signal: controller.signal },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            data?: LeadSearchResult[];
            error?: string;
          };
          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error ?? "Não foi possível pesquisar os leads.");
          }
          setResults(payload.data ?? []);
        } catch (searchError) {
          if (controller.signal.aborted) return;
          setResults([]);
          setError(
            searchError instanceof Error
              ? searchError.message
              : "Não foi possível pesquisar os leads.",
          );
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      normalizedQuery.length < 2 ? 0 : 250,
    );

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function close() {
    setQuery("");
    setResults([]);
    setError(null);
    onOpenChange(false);
  }

  function selectLead(lead: LeadSearchResult) {
    setRecent((current) => storeRecentLead(lead, current));
    close();
  }

  const showRecent = query.trim().length < 2;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent
        hideCloseButton
        className="w-[calc(100vw-2rem)] max-w-2xl gap-0 overflow-hidden p-0"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="text-xl">Pesquisar leads</DialogTitle>
            <DialogDescription className="mt-1">
              Encontre uma oportunidade por empresa, solicitante, e-mail ou ID.
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={close}
            aria-label="Fechar pesquisa"
            className="-mr-2 -mt-1 text-muted-foreground"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>

        <div className="border-b border-border px-5 py-4 sm:px-6">
          <label className="flex h-11 items-center gap-3 rounded-(--radius-v2-lg) border border-input bg-white px-3.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/20">
            {loading ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className="sr-only">Pesquisar leads</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Digite empresa, solicitante, e-mail ou ID…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-text-placeholder-v2"
            />
            <kbd className="hidden rounded-(--radius-v2-sm) border border-border bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground sm:inline">
              ESC
            </kbd>
          </label>
        </div>

        <div className="crm-scrollbar max-h-[min(60dvh,520px)] min-h-52 overflow-y-auto">
          {showRecent ? (
            <SearchSection
              title="Acessados recentemente"
              icon={Clock3}
              items={recent}
              emptyText="Os leads que você abrir pela pesquisa aparecerão aqui."
              onSelect={selectLead}
            />
          ) : error ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-danger-bg text-danger-text">
                <TriangleAlert className="size-5" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-foreground">Falha na pesquisa</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{error}</p>
            </div>
          ) : loading && results.length === 0 ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Pesquisando leads…
            </div>
          ) : (
            <SearchSection
              title={`${results.length} ${results.length === 1 ? "resultado" : "resultados"}`}
              icon={Search}
              items={results}
              emptyText={`Nenhum lead encontrado para “${query.trim()}”.`}
              onSelect={selectLead}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-subtle px-5 py-3 text-[11px] text-muted-foreground sm:px-6">
          <span>Digite pelo menos 2 caracteres.</span>
          <span className="hidden sm:inline">Use Tab para navegar e Enter para abrir.</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchSection({
  title,
  icon: Icon,
  items,
  emptyText,
  onSelect,
}: {
  title: string;
  icon: typeof Search;
  items: LeadSearchResult[];
  emptyText: string;
  onSelect: (lead: LeadSearchResult) => void;
}) {
  return (
    <section className="px-3 py-3">
      <div className="flex items-center gap-2 px-2 py-2">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((lead) => (
            <li key={lead.id}>
              <LeadSearchResultLink lead={lead} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}

function LeadSearchResultLink({
  lead,
  onSelect,
}: {
  lead: LeadSearchResult;
  onSelect: (lead: LeadSearchResult) => void;
}) {
  const stageLabel =
    OPPORTUNITY_STAGE_LABELS[lead.stage as OpportunityStage] ??
    lead.stage.replace(/_/g, " ");
  const status =
    lead.closingStatus === "ganho"
      ? { label: "Ganho", className: "border-success-border bg-success-bg text-success-text" }
      : lead.closingStatus === "perdido"
        ? { label: "Perdido", className: "border-danger-border bg-danger-bg text-danger-text" }
        : null;

  return (
    <Link
      href={`/crm/leads/${lead.id}`}
      onClick={() => onSelect(lead)}
      className="group flex min-w-0 items-start gap-3 rounded-(--radius-v2-lg) border border-transparent px-3 py-3 transition-colors hover:border-border hover:bg-surface-hover focus-visible:border-primary focus-visible:bg-interactive-50 focus-visible:outline-none"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) bg-interactive-50 text-interactive-700">
        <BriefcaseBusiness className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {lead.title}
        </span>
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {lead.requesterName || lead.requesterEmail ? (
            <CrmUserLabel
              name={lead.requesterName ?? lead.requesterEmail ?? "—"}
              avatarUrl={lead.requesterAvatarUrl}
              size="xs"
              variant="stacked"
              prefix="Solicitante interno"
              sublabel={
                lead.requesterName && lead.requesterEmail
                  ? lead.requesterEmail
                  : undefined
              }
            />
          ) : (
            <span className="text-xs text-muted-foreground">
              Solicitante interno não informado
            </span>
          )}
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            Atualizado {formatDateTimeBr(lead.updatedAt)}
          </span>
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant="outline">{stageLabel}</Badge>
          <Badge variant="outline">{lead.type.replace(/_/g, " ")}</Badge>
          {lead.hasDueDiligence ? <Badge variant="outline">DUE</Badge> : null}
          {status ? (
            <Badge variant="outline" className={cn(status.className)}>
              {status.label}
            </Badge>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
