"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Search, Snowflake, Undo2, Upload, Workflow } from "lucide-react";

import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { crmSurfaceSegmentedRootClass, crmSurfaceSegmentedTabClass } from "@/components/crm/crm-surface-header";
import {
  RdMigrationStatusBadge,
  rdMigrationDisplayStatus,
  type RdMigrationDisplayStatus,
} from "@/components/crm/rd-migration/rd-migration-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTimeBr } from "@/lib/format-datetime";
import type { RdMigrationQueue, RdMigrationQueueItem } from "@/lib/crm/rd-migration/service";
import { cn } from "@/lib/utils";

type StatusFilter = "todos" | "duplicados" | RdMigrationDisplayStatus;

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "a_preencher", label: "A preencher" },
  { value: "pronto", label: "Prontos" },
  { value: "duplicados", label: "Mesmo cliente" },
  { value: "pendente_crm", label: "No CRM com pendências" },
  { value: "concluida", label: "Concluídos" },
  { value: "fora", label: "Fora" },
];

function duplicateTitle(item: RdMigrationQueueItem): string {
  const d = item.duplicate;
  if (!d) return "";
  const others = d.others.map((o) => `${o.nome} (${o.stageLabel ?? "fora"})`).join("; ");
  return `Mesmo cliente ${d.reason === "documento" ? "(CPF/CNPJ)" : "(nome)"} em: ${others}. ${
    d.suggested ? "Sugestão: migrar este e tirar os outros." : "Sugestão: tirar este da migração."
  }`;
}

const NO_OWNER = "__sem__";

type CutoverAction = "final_import" | "freeze" | "unfreeze" | "convert_all" | "rollback";

function displayOf(item: RdMigrationQueueItem): RdMigrationDisplayStatus {
  return rdMigrationDisplayStatus({ status: item.status, readyForConversion: item.readyForConversion });
}

function pendingLabel(item: RdMigrationQueueItem): string {
  const status = displayOf(item);
  if (status === "fora" || status === "concluida") return "—";
  const count = item.status === "convertida" ? item.missingCount : item.missingBeforeConversion;
  if (count === 0) return item.missingCount > 0 ? "Só depois da virada" : "Nenhuma";
  return count === 1 ? "1 campo" : `${count} campos`;
}

function summaryText(summary: Record<string, unknown>): string | null {
  if (typeof summary.converted !== "number") return null;
  const parts = [
    `${summary.converted} convertidos`,
    `${String(summary.concluded ?? 0)} completos`,
    `${String(summary.pending ?? 0)} com pendências`,
  ];
  const failed = Array.isArray(summary.failed) ? summary.failed.length : 0;
  if (failed) parts.push(`${failed} com erro`);
  if (typeof summary.duplicates === "number" && summary.duplicates > 0) {
    parts.push(`${summary.duplicates} do mesmo cliente esperando o admin escolher`);
  }
  if (typeof summary.remaining === "number" && summary.remaining > 0) parts.push(`${summary.remaining} ainda a converter`);
  return parts.join(" · ");
}

export function RdMigrationQueueView({ queue, isAdmin }: { queue: RdMigrationQueue; isAdmin: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [ownerFilter, setOwnerFilter] = useState<string>("todos");
  const [busy, setBusy] = useState<CutoverAction | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<CutoverAction | null>(null);

  const counts = useMemo(() => {
    const out: Record<Exclude<StatusFilter, "todos">, number> = {
      a_preencher: 0,
      pronto: 0,
      duplicados: 0,
      pendente_crm: 0,
      concluida: 0,
      fora: 0,
    };
    for (const item of queue.items) {
      out[displayOf(item)] += 1;
      if (item.duplicate) out.duplicados += 1;
    }
    return out;
  }, [queue.items]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of queue.items) if (item.responsible) map.set(item.responsible.appUserId, item.responsible.fullName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [queue.items]);
  const ownerLabels = useMemo(
    () => ({ todos: "Todos os responsáveis", [NO_OWNER]: "Sem responsável", ...Object.fromEntries(owners) }),
    [owners],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return queue.items
      .filter((item) =>
        statusFilter === "todos"
          ? true
          : statusFilter === "duplicados"
            ? Boolean(item.duplicate)
            : displayOf(item) === statusFilter,
      )
      .filter((item) =>
        ownerFilter === "todos"
          ? true
          : ownerFilter === NO_OWNER
            ? !item.responsible
            : item.responsible?.appUserId === ownerFilter,
      )
      .filter((item) => !q || item.nome.toLowerCase().includes(q) || item.rdDealId.toLowerCase().includes(q))
      .sort((a, b) => {
        // Sem responsável primeiro (o admin precisa atribuir), depois por responsável e nome.
        const ra = a.responsible?.fullName ?? "";
        const rb = b.responsible?.fullName ?? "";
        if (!ra !== !rb) return ra ? 1 : -1;
        return ra.localeCompare(rb, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [queue.items, search, statusFilter, ownerFilter]);

  const frozen = Boolean(queue.virada.congeladoEm);
  const lastSummary = summaryText(queue.virada.ultimoResumo);

  async function runCutover(action: CutoverAction) {
    setBusy(action);
    setMessage(null);
    try {
      const res = await fetch("/api/crm/rd-migration/cutover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        import?: { importedDeals: number; failed: number };
        summary?: Record<string, unknown>;
        rollback?: { reverted: number };
      };
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Não foi possível concluir a ação.");
      const text =
        action === "final_import" && data.import
          ? `Importação concluída: ${data.import.importedDeals} negócios atualizados${data.import.failed ? `, ${data.import.failed} com falha` : ""}.`
          : action === "convert_all" && data.summary
            ? `Conversão: ${summaryText(data.summary) ?? "concluída"}.`
            : action === "rollback" && data.rollback
              ? `Virada desfeita: ${data.rollback.reverted} leads voltaram para o RD.`
              : action === "freeze"
                ? "RD congelado: o webhook e a importação agendada não gravam mais nada."
                : "Sync do RD reaberto.";
      setMessage({ tone: "ok", text });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Falha na ação." });
    } finally {
      setBusy(null);
    }
  }

  const confirmCopy: Partial<Record<CutoverAction, { title: string; body: string; cta: string; danger?: boolean }>> = {
    freeze: {
      title: "Congelar o RD no CRM?",
      body: "Depois disso o webhook e a importação diária do RD não gravam mais nada no CRM. Faça antes a última importação e confirme que o time parou de usar o RD.",
      cta: "Congelar o RD",
    },
    convert_all: {
      title: "Converter os negócios do RD?",
      body: `Os negócios em escopo viram leads do CRM e passam a andar aqui. ${counts.a_preencher} ainda têm campos a preencher: eles entram no CRM, mas não avançam até o responsável completar a migração.${
        counts.duplicados > 0
          ? ` Negócios do mesmo cliente que você ainda não resolveu (filtro "Mesmo cliente") ficam de fora até escolher qual migrar.`
          : ""
      }`,
      cta: "Converter agora",
    },
    rollback: {
      title: "Desfazer a virada?",
      body: "Os leads convertidos voltam a ser do RD (só leitura no CRM) e o sync do RD é reaberto. Use só dentro da janela de rollback do runbook: o que foi feito no CRM depois da conversão fica gravado, mas o RD volta a mandar na etapa.",
      cta: "Desfazer a virada",
      danger: true,
    },
  };

  return (
    <div className="space-y-5">
      {queue.schemaPending ? (
        <Alert className="border-warning-border bg-warning-bg">
          <AlertTitle className="text-warning-text">Migração ainda não habilitada no banco</AlertTitle>
          <AlertDescription>
            Falta aplicar a migration <code className="font-mono text-xs">20261019120000_rd_migracao.sql</code>. A fila
            mostra o que o RD tem, mas não grava rascunho nem converte.
          </AlertDescription>
        </Alert>
      ) : null}

      {isAdmin ? (
        <section className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">Dia da virada</h2>
            <p className="text-sm text-muted-foreground">
              {frozen
                ? `RD congelado em ${formatDateTimeBr(queue.virada.congeladoEm!)}`
                : "RD sincronizando (webhook e importação diária)"}
            </p>
          </div>
          <ol className="mt-4 grid gap-3 md:grid-cols-3">
            <li className="rounded-(--radius-v2-lg) border border-neutral-200 p-3">
              <p className="text-xs font-semibold text-muted-foreground">1. Última importação</p>
              <p className="mt-1 text-sm text-foreground">Com o time fora do RD, traga o estado final dos negócios.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={frozen || busy !== null || queue.schemaPending}
                onClick={() => void runCutover("final_import")}
              >
                {busy === "final_import" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Importar do RD
              </Button>
            </li>
            <li className="rounded-(--radius-v2-lg) border border-neutral-200 p-3">
              <p className="text-xs font-semibold text-muted-foreground">2. Congelar o RD</p>
              <p className="mt-1 text-sm text-foreground">Webhook e cron do RD param de gravar no CRM.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={busy !== null || queue.schemaPending}
                onClick={() => (frozen ? void runCutover("unfreeze") : setConfirm("freeze"))}
              >
                {busy === "freeze" || busy === "unfreeze" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Snowflake className="size-4" />
                )}
                {frozen ? "Reabrir o sync" : "Congelar o RD"}
              </Button>
            </li>
            <li className="rounded-(--radius-v2-lg) border border-neutral-200 p-3">
              <p className="text-xs font-semibold text-muted-foreground">3. Converter</p>
              <p className="mt-1 text-sm text-foreground">
                {counts.pronto} prontos e {counts.a_preencher} a preencher viram leads do CRM.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!frozen || busy !== null || queue.schemaPending}
                  onClick={() => setConfirm("convert_all")}
                >
                  {busy === "convert_all" ? <Loader2 className="size-4 animate-spin" /> : <Workflow className="size-4" />}
                  Converter negócios
                </Button>
                {queue.virada.convertidoEm ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-danger-text"
                    disabled={busy !== null}
                    onClick={() => setConfirm("rollback")}
                  >
                    {busy === "rollback" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
                    Desfazer
                  </Button>
                ) : null}
              </div>
            </li>
          </ol>
          {lastSummary ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Última conversão
              {queue.virada.convertidoEm ? ` (${formatDateTimeBr(queue.virada.convertidoEm)})` : ""}: {lastSummary}
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className={cn("mt-3 text-sm", message.tone === "ok" ? "text-success-text" : "text-danger-text")}
            >
              {message.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className={cn(crmSurfaceSegmentedRootClass, "flex-wrap")} role="tablist" aria-label="Situação">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.value}
                className={crmSurfaceSegmentedTabClass(statusFilter === f.value)}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
                {f.value !== "todos" ? (
                  <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[f.value]}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isAdmin ? (
              <Select value={ownerFilter} onValueChange={(v) => setOwnerFilter(v ?? "todos")}>
                <SelectTrigger size="sm" className="h-9 w-full sm:w-56" aria-label="Responsável">
                  <CrmSelectValue value={ownerFilter} labels={ownerLabels} />
                </SelectTrigger>
                <CrmSelectContent>
                  <CrmSelectItem value="todos">Todos os responsáveis</CrmSelectItem>
                  <CrmSelectItem value={NO_OWNER}>Sem responsável</CrmSelectItem>
                  {owners.map(([id, name]) => (
                    <CrmSelectItem key={id} value={id}>
                      {name}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
            ) : null}
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar lead ou ID do RD"
                className="h-9 pl-9"
                aria-label="Buscar lead"
              />
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            {queue.items.length === 0
              ? isAdmin
                ? "Nenhum negócio do RD em andamento para migrar."
                : "Nenhum negócio do RD está com você."
              : "Nenhum negócio com esses filtros."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead className="hidden md:table-cell">Etapa no RD → no CRM</TableHead>
                <TableHead className="hidden lg:table-cell">Responsável</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="hidden sm:table-cell">Pendências</TableHead>
                <TableHead className="hidden xl:table-cell">Atualizado no RD</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Abrir</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const href = `/crm/migracao-rd/${encodeURIComponent(item.opportunityId)}`;
                return (
                  <TableRow key={item.opportunityId} className="cursor-pointer" onClick={() => router.push(href)}>
                    <TableCell className="max-w-[18rem]">
                      <Link
                        href={href}
                        className="block truncate text-[13px] font-medium text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.nome}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground md:hidden">
                        {item.stageLabel ?? "Fora da migração"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-[13px] md:table-cell">
                      <span className="text-muted-foreground">{item.rdStageLabel ?? "—"}</span>
                      {item.stageLabel ? (
                        <>
                          <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" aria-hidden />
                          <span className="text-foreground">{item.stageLabel}</span>
                        </>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden text-[13px] lg:table-cell">
                      {item.responsible ? (
                        item.responsible.fullName
                      ) : (
                        <span className="text-warning-text">Sem responsável</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RdMigrationStatusBadge status={displayOf(item)} />
                        {item.duplicate ? (
                          <span
                            className={cn(
                              "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
                              item.duplicate.suggested
                                ? "border-info-border bg-info-bg text-info-text"
                                : "border-danger-border bg-danger-bg text-danger-text",
                            )}
                            title={duplicateTitle(item)}
                          >
                            {item.duplicate.suggested ? "Mesmo cliente · migrar este" : "Mesmo cliente"}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-[13px] tabular-nums sm:table-cell">{pendingLabel(item)}</TableCell>
                    <TableCell className="hidden text-[13px] tabular-nums text-muted-foreground xl:table-cell">
                      {item.rdUpdatedAt ? formatDateTimeBr(item.rdUpdatedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && confirmCopy[confirm] ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{confirmCopy[confirm]!.title}</AlertDialogTitle>
                <AlertDialogDescription>{confirmCopy[confirm]!.body}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className={confirmCopy[confirm]!.danger ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
                  onClick={() => {
                    const action = confirm;
                    setConfirm(null);
                    void runCutover(action);
                  }}
                >
                  {confirmCopy[confirm]!.cta}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
