"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  competencyMonthToYmd,
  formatCompetencyLabel,
  maskCompetencyMonth,
  ymdToCompetencyMonth,
} from "@/lib/crm/competency-month";
import { sameContractLabel } from "@/lib/crm/contract-portfolio-identity";
import { CONTRACT_CLOSING_STATUS_LABELS, statusLabel } from "@/lib/crm/contract-status-labels";
import { competencyMonthStart } from "@/lib/format-datetime";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";
import { expectedRevisionForPreparation } from "@/modules/contracts/application/services/prepare-monthly-closing";
import { ContractClosingReview, type ClosingPermissions } from "./contract-closing-review";

type Closing = {
  id: string;
  competencia: string;
  status: string;
  revisao_atual_id: string | null;
  currentRevision: number;
};
const denied: ClosingPermissions = { canPrepare: false, canApprove: false, canRegisterVios: false };

async function fetchClosings(
  contractId: string,
): Promise<{ permissions?: ClosingPermissions; closings: Closing[] }> {
  const response = await fetch(`/api/crm/contracts/${contractId}/closings`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Falha ao listar fechamentos.");
  return payload;
}

export function ContractClosingsTab({
  contractId,
  portfolio = [],
  permissions = denied,
}: {
  contractId?: string;
  portfolio?: ContractPortfolioItem[];
  permissions?: ClosingPermissions;
}) {
  const [list, setList] = useState<Closing[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Competência é mês/ano (antes era uma data cheia, "01/10/2026"); grava `yyyy-mm-01`.
  const [competencyText, setCompetencyText] = useState(() => ymdToCompetencyMonth(competencyMonthStart()));
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverPermissions, setServerPermissions] = useState<ClosingPermissions>(permissions);
  const competency = competencyMonthToYmd(competencyText);

  async function load() {
    if (!contractId) return;
    try {
      const payload = await fetchClosings(contractId);
      setError(null);
      setServerPermissions(payload.permissions ?? denied);
      setList(payload.closings);
      setSelected((current) => current ?? payload.closings[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao listar fechamentos.");
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  if (!contractId) {
    const rows = portfolio.filter((item) => item.lifecycle === "ativo" || item.closingCount);
    if (rows.length === 0) {
      return (
        <div className="rounded-(--radius-v2-xl) border border-dashed border-border bg-background px-6 py-10 text-center text-sm text-muted-foreground">
          Nenhum contrato ativo para fechar.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Abra o contrato para preparar o fechamento do mês, conferir a memória de cálculo e registrar no VIOS.
        </p>
        {rows.map((item) => (
          <Link
            className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-v2-lg) border border-border bg-background p-4 hover:border-interactive-300"
            href={`/crm/contratos/${item.id}?tab=closings`}
            key={item.id}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground" title={item.title}>
                {item.title}
              </p>
              {sameContractLabel(item.title, item.clientName) ? null : (
                <p className="truncate text-xs text-muted-foreground" title={item.clientName}>
                  {item.clientName}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {item.latestClosing
                  ? `Último: ${formatCompetencyLabel(item.latestClosing.competency)} · ${statusLabel(CONTRACT_CLOSING_STATUS_LABELS, item.latestClosing.status)}`
                  : "Nenhum fechamento ainda"}
              </span>
              {item.pendingClosingCount > 0 ? (
                <Badge className="border-warning-border bg-warning-bg text-warning-text">
                  {item.pendingClosingCount} pendente{item.pendingClosingCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
              <span className="inline-flex items-center gap-1 font-medium text-interactive-700">
                Abrir fechamentos
                <ArrowUpRight className="size-4" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  async function prepare() {
    if (!competency) {
      setError("Informe a competência no formato mm/aaaa.");
      return;
    }
    const current = list.find((entry) => entry.competencia === competency) ?? null;
    setPreparing(true);
    try {
      const response = await fetch(`/api/crm/contracts/${contractId}/closings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competency,
          expectedRevision: expectedRevisionForPreparation(current),
        }),
      });
      const payload = await response.json();
      if (!response.ok) return setError(payload.error ?? "Falha ao preparar fechamento.");
      setError(null);
      await load();
      const prepared = (payload as { closingId?: string }).closingId;
      if (prepared) setSelected(prepared);
    } finally {
      setPreparing(false);
    }
  }

  if (!loaded) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Carregando fechamentos…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {serverPermissions.canPrepare ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span>Competência</span>
            <Input
              value={competencyText}
              inputMode="numeric"
              placeholder="mm/aaaa"
              maxLength={7}
              aria-invalid={competencyText.length === 7 && !competency ? true : undefined}
              className="!h-10 w-32 border-[#dfe5ee] bg-white shadow-sm"
              onChange={(event) => setCompetencyText(maskCompetencyMonth(event.target.value))}
            />
          </label>
          <Button type="button" onClick={prepare} disabled={!competency || preparing}>
            {preparing ? <Loader2 className="size-4 animate-spin" /> : null}
            {list.some((entry) => entry.competencia === competency) ? "Recalcular" : "Preparar fechamento"}
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {list.map((entry) => (
          <Button
            type="button"
            size="sm"
            variant={selected === entry.id ? "default" : "outline"}
            onClick={() => setSelected(entry.id)}
            key={entry.id}
          >
            {formatCompetencyLabel(entry.competencia) || entry.competencia} · revisão {entry.currentRevision} ·{" "}
            {statusLabel(CONTRACT_CLOSING_STATUS_LABELS, entry.status)}
          </Button>
        ))}
      </div>
      {selected ? (
        <ContractClosingReview
          contractId={contractId}
          closingId={selected}
          permissions={serverPermissions}
        />
      ) : (
        <p className="text-sm text-zinc-500">
          {serverPermissions.canPrepare
            ? "Nenhum fechamento ainda. Escolha a competência e prepare o fechamento do mês."
            : "Nenhum fechamento ainda."}
        </p>
      )}
    </div>
  );
}
