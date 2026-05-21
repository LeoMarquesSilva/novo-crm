"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function formatKanbanRefreshLabel(at: Date, now = new Date()): string {
  const diffMs = now.getTime() - at.getTime();
  if (diffMs < 45_000) return "Atualizado agora";
  return `Atualizado ${at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

type PipelineKanbanRefreshIndicatorProps = {
  lastRefreshedAt: Date | null;
  justRefreshed?: boolean;
  silentRefreshing?: boolean;
  className?: string;
};

export function PipelineKanbanRefreshIndicator({
  lastRefreshedAt,
  justRefreshed = false,
  silentRefreshing = false,
  className,
}: PipelineKanbanRefreshIndicatorProps) {
  if (!lastRefreshedAt) return null;

  const label = justRefreshed ? "Atualizado agora" : formatKanbanRefreshLabel(lastRefreshedAt);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-all duration-300",
        justRefreshed
          ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80"
          : "bg-[#f1f5f9] text-[#64748b] ring-1 ring-[#e2e8f0]",
        className,
      )}
      aria-live="polite"
    >
      {silentRefreshing ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-90" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}

type PipelineKanbanErrorStateProps = {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
};

export function PipelineKanbanErrorState({
  message,
  onRetry,
  retrying = false,
}: PipelineKanbanErrorStateProps) {
  return (
    <div className="flex h-full min-h-[min(50dvh,420px)] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50 text-rose-600 shadow-sm">
        <AlertCircle className="h-6 w-6" strokeWidth={2} aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-bold text-primary-dark">Não foi possível carregar o pipeline</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{message}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={retrying}
        onClick={onRetry}
        className="gap-1.5 border-primary-dark/15 bg-white"
      >
        {retrying ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        )}
        Tentar de novo
      </Button>
    </div>
  );
}
