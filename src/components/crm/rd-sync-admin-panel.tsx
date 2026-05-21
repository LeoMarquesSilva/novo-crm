"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

type SyncSummary = {
  imported: number;
  importedDeals: number;
  importedLeads: number;
  skipped: number;
  failed: number;
  year: number;
};

export function RdSyncAdminPanel() {
  const [year, setYear] = useState<string>("2026");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<SyncSummary | null>(null);

  function runSync() {
    setError(null);
    setLastOk(null);
    const y = Number.parseInt(year, 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      setError("Ano inválido.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/admin/integrations/rd-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: y }),
        credentials: "include",
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        summary?: SyncSummary;
      };

      if (!response.ok || !payload.ok) {
        setError(payload.error ?? "Falha na sincronização.");
        return;
      }

      if (payload.summary) {
        setLastOk(payload.summary);
      }
    });
  }

  return (
    <Card className="glass-card glass-card-no-float">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">RD Station CRM — sincronização</CardTitle>
        <p className="text-xs text-muted-foreground">
          Importa negócios e contatos da API v1 do RD para o Supabase (reconciliação, etapas
          vendas/pós-venda). Uso restrito a administradores. Pode levar alguns minutos.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2 sm:min-w-[140px]">
          <Label htmlFor="rd-sync-year">Ano (filtro por created_at no RD)</Label>
          <Select value={year} onValueChange={(v) => v != null && setYear(v)}>
            <SelectTrigger id="rd-sync-year" className="w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <CrmSelectContent>
              {["2024", "2025", "2026", "2027"].map((y) => (
                <CrmSelectItem key={y} value={y}>
                  {y}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="cta"
          className="shrink-0 gap-2"
          disabled={isPending}
          onClick={runSync}
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} aria-hidden />
          {isPending ? "Sincronizando…" : "Atualizar sync do RD"}
        </Button>
      </CardContent>
      {error ? (
        <CardContent className="pt-0">
          <Alert variant="destructive">
            <AlertTitle>Erro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
      {lastOk ? (
        <CardContent className="pt-0">
          <Alert>
            <AlertTitle>Sincronização concluída</AlertTitle>
            <AlertDescription className="text-sm">
              Ano {lastOk.year}: {lastOk.importedDeals} negócio(s), {lastOk.importedLeads}{" "}
              contato(s) processados; {lastOk.skipped} ignorado(s); {lastOk.failed} falha(s).
              Total salvo/atualizado: {lastOk.imported}.
            </AlertDescription>
          </Alert>
        </CardContent>
      ) : null}
    </Card>
  );
}
