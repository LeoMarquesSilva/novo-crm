"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Handshake,
  Loader2,
  Merge,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import type { Indicador } from "@/modules/crm/domain/entities";

interface IndicatorApprovalQueueProps {
  items: Indicador[];
}

function statusLabel(status: Indicador["status"]) {
  switch (status) {
    case "pendente_aprovacao":
      return "Pendente aprovação";
    case "aprovado":
      return "Aprovado";
    case "mesclado":
      return "Mesclado";
    default:
      return status;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function IndicatorApprovalQueue({ items }: IndicatorApprovalQueueProps) {
  const router = useRouter();
  const [queue, setQueue] = useState(items);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isBusy = useMemo(() => pendingAction !== null, [pendingAction]);

  async function submitAction(indicatorId: string, action: "aprovar" | "mesclar") {
    setPendingAction(`${indicatorId}:${action}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/indicators/${encodeURIComponent(indicatorId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error ?? "Não foi possível concluir a ação.");
        return;
      }

      setQueue((current) => current.filter((item) => item.id !== indicatorId));
      setFeedback(action === "aprovar" ? "Indicador aprovado com sucesso." : "Indicadores mesclados com sucesso.");
      router.refresh();
    } catch {
      setFeedback("Falha de rede ao tentar atualizar indicador.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Card id="fila-indicadores" className="scroll-mt-5 gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) bg-interactive-50 text-interactive-700">
            <Handshake className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-v2-heading-md">Fila de aprovação de indicadores</CardTitle>
            <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
              Padronize novos nomes antes que entrem no catálogo comercial.
            </p>
          </div>
        </div>
        <Badge variant={queue.length > 0 ? "secondary" : "outline"} className="shrink-0 tabular-nums">
          {queue.length} {queue.length === 1 ? "pendente" : "pendentes"}
        </Badge>
      </CardHeader>
      <CardContent className="px-0 py-0">
        {queue.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-success-bg text-success-text">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">Fila de indicadores em dia</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-muted-foreground">
              Novos nomes informados no cadastro de leads aparecerão aqui para revisão.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {queue.map((item) => (
            <li
              key={item.id}
              className="grid gap-4 px-5 py-4 transition-colors hover:bg-surface-hover sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) border border-border bg-white text-muted-foreground">
                  <Handshake className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-sm font-semibold text-foreground">{item.nome}</p>
                    <Badge variant="secondary">{statusLabel(item.status)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {item.solicitanteNome ? (
                      <CrmUserLabel
                        name={item.solicitanteNome}
                        avatarUrl={item.solicitanteAvatarUrl}
                        size="xs"
                        variant="inline"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">Autor não identificado</span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                      <CalendarDays className="size-3.5" aria-hidden />
                      {formatDateTime(item.solicitadoEm)}
                    </span>
                  </div>
                  {item.leadNome ? (
                    item.oportunidadeId ? (
                      <Link
                        href={`/crm/leads/${encodeURIComponent(item.oportunidadeId)}`}
                        className="mt-2 inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-interactive-700 hover:underline"
                      >
                        <span className="truncate">{item.leadNome}</span>
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                      </Link>
                    ) : (
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        Lead: {item.leadNome}
                      </p>
                    )
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void submitAction(item.id, "mesclar")}
                >
                  {pendingAction === `${item.id}:mesclar` ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Merge className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  Marcar como duplicado
                </Button>
                <Button
                  size="sm"
                  variant="teal"
                  disabled={isBusy}
                  onClick={() => void submitAction(item.id, "aprovar")}
                >
                  {pendingAction === `${item.id}:aprovar` ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2 className="mr-1.5 size-3.5" aria-hidden />
                  )}
                  Aprovar
                </Button>
              </div>
            </li>
            ))}
          </ul>
        )}
        {feedback ? (
          <p className="border-t border-border bg-surface-subtle px-5 py-3 text-sm text-muted-foreground sm:px-6" role="status">
            {feedback}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
