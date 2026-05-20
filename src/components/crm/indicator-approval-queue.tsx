"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Indicador } from "@/modules/crm/domain/entities";

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
    <Card className="hover:shadow-xl hover:shadow-primary-dark/20">
      <CardHeader>
        <CardTitle>Fila de aprovação de indicadores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum indicador pendente.</p>
        ) : (
          queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-white/35 bg-white/60 p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5"
            >
              <div>
                <p className="font-medium">{item.nome}</p>
                <Badge variant="secondary">{statusLabel(item.status)}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  Solicitante: {item.solicitanteNome || "Não identificado"}
                </p>
                <p className="text-xs text-muted-foreground">Lead: {item.leadNome || "Não informado"}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitado em: {formatDateTime(item.solicitadoEm)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => void submitAction(item.id, "mesclar")}
                >
                  Mesclar
                </Button>
                <Button
                  size="sm"
                  variant="teal"
                  disabled={isBusy}
                  onClick={() => void submitAction(item.id, "aprovar")}
                >
                  Aprovar
                </Button>
              </div>
            </div>
          ))
        )}
        {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
      </CardContent>
    </Card>
  );
}
