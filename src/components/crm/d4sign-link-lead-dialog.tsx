"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type LeadResult = {
  id: string;
  solicitante_nome: string;
  etapa: string;
  d4sign_document_uuid: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentUuid: string;
  documentName: string | null;
  currentLeadId: string | null;
  onLinked: () => void;
};

export function D4SignLinkLeadDialog({
  open,
  onOpenChange,
  documentUuid,
  documentName,
  currentLeadId,
  onLinked,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/crm/d4sign/link-lead?q=${encodeURIComponent(q.trim())}`);
      const json = (await res.json()) as { ok?: boolean; results?: LeadResult[] };
      setResults(json.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(query), 300);
    return () => clearTimeout(t);
  }, [query, open, search]);

  async function linkTo(leadId: string | null) {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/d4sign/link-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid_doc: documentUuid, oportunidade_id: leadId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Falha ao vincular.");
        return;
      }
      onLinked();
      onOpenChange(false);
    } catch {
      setError("Erro de rede.");
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a lead</DialogTitle>
          <DialogDescription>
            {documentName ?? documentUuid.slice(0, 18)} — para quando houver oportunidades reais no CRM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar lead por nome…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {searching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Buscando…
            </p>
          ) : results.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={linking}
                    onClick={() => void linkTo(r.id)}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-semibold">{r.solicitante_nome}</span>
                    <span className="text-[10px] text-muted-foreground">{r.etapa.replace(/_/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.length >= 2 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          ) : null}

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {currentLeadId ? (
            <Button type="button" variant="outline" size="sm" disabled={linking} onClick={() => void linkTo(null)}>
              <Unlink className="size-3.5" /> Desvincular
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function D4SignOriginBadge({
  sentByAppUserId,
  detailsFetchedAt,
  lastSyncedAt,
  d4signStatus,
}: {
  sentByAppUserId: string | null;
  detailsFetchedAt: string | null;
  lastSyncedAt: string | null;
  d4signStatus: string | null;
}) {
  const isCrm = Boolean(sentByAppUserId);
  const stale =
    lastSyncedAt &&
    Date.now() - new Date(lastSyncedAt).getTime() > 12 * 60 * 60 * 1000 &&
    d4signStatus &&
    ["2", "3", "sent", "processing"].includes(d4signStatus);

  return (
    <div className="flex flex-wrap gap-1">
      <span
        className={`rounded-sm px-1.5 py-px text-[8px] font-bold uppercase tracking-wide ${isCrm ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700"}`}
      >
        {isCrm ? "CRM" : "Cofre"}
      </span>
      {!detailsFetchedAt && !isCrm ? (
        <span className="rounded-sm bg-violet-100 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-violet-700">
          Sem signatários
        </span>
      ) : null}
      {stale ? (
        <span className="rounded-sm bg-slate-200 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-slate-600">
          Desatualizado
        </span>
      ) : null}
    </div>
  );
}
