"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { BR_TIMEZONE, formatDateYmdBr } from "@/lib/format-datetime";
import type { ContractPortfolioItem } from "@/modules/contracts/infrastructure/contract-queries";
import { expectedRevisionForPreparation } from "@/modules/contracts/application/services/prepare-monthly-closing";
import { ContractClosingReview, type ClosingPermissions } from "./contract-closing-review";

/** Data civil de hoje no horário de Brasília (evita virar o mês por causa do UTC). */
function todayYmdBr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BR_TIMEZONE }).format(new Date());
}

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

function monthFirstDay(ymd: string) {
  const head = ymd.slice(0, 7);
  return head.length === 7 ? `${head}-01` : ymd;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [competency, setCompetency] = useState(monthFirstDay(todayYmdBr()));
  const [error, setError] = useState<string | null>(null);
  const [serverPermissions, setServerPermissions] = useState<ClosingPermissions>(permissions);

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
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  if (!contractId) {
    return (
      <div className="space-y-2">
        {portfolio
          .filter((item) => item.lifecycle === "ativo" || item.closingCount)
          .map((item) => (
            <Link
              className="flex justify-between rounded-xl border bg-white p-4"
              href={`/crm/contratos/${item.id}?tab=closings`}
              key={item.id}
            >
              <strong>{item.clientName}</strong>
              <span>{item.pendingClosingCount} pendente(s)</span>
            </Link>
          ))}
      </div>
    );
  }

  async function prepare() {
    const current = list.find((entry) => entry.competencia === competency) ?? null;
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
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {serverPermissions.canPrepare ? (
        <div className="flex flex-wrap gap-2">
          <DateInputBr
            value={competency}
            className="!h-10 max-w-xs border-[#dfe5ee] bg-white shadow-sm"
            onChange={(ymd) => setCompetency(monthFirstDay(ymd || competency))}
          />
          <Button type="button" onClick={prepare}>
            Preparar / recalcular
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
            {formatDateYmdBr(entry.competencia) || entry.competencia} · revisão{" "}
            {entry.currentRevision} · {entry.status}
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
        <p className="text-sm text-zinc-500">Nenhum fechamento.</p>
      )}
    </div>
  );
}
