"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Link2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { centsToMaskedBrl } from "@/components/crm/contracts/contract-setup-form-helpers";
import {
  CarteiraGrupoDetailDialog,
  type CarteiraGrupoDetail,
} from "@/components/crm/carteira-grupo-detail-dialog";
import { AreaIconLabel } from "@/lib/crm/area-lucide-icon";
import {
  CARTEIRA_GRUPOS_DEFAULT_SORT,
  sortCarteiraGrupos,
  toggleCarteiraGruposSort,
  type CarteiraGruposSort,
  type CarteiraGruposSortKey,
} from "@/lib/crm/carteira-clientes-sort";
import type { CarteiraGrupoMembro } from "@/lib/crm/carteira-grupo-membros";
import { mergeGrupoPracticeAreas } from "@/lib/crm/grupo-areas-atuacao";
import {
  CARTEIRA_CATEGORIA_BADGE_CLASS,
  CARTEIRA_CATEGORIA_LABEL,
  type CarteiraOrigemLinha,
} from "@/lib/crm/grupo-categoria";
import { formatGrupoIntakeIndication, parseGrupoIntakeIndication } from "@/lib/crm/grupo-intake-indication";
import {
  CARTEIRA_CLIENTE_STATUS_LABEL,
  type CarteiraClienteStatus,
} from "@/lib/orqestrai/gestor-atividade";
import { cn } from "@/lib/utils";

export type CarteiraGrupoRow = {
  id: string;
  nome: string;
  clienteStatus: CarteiraClienteStatus | null;
  origemLinha: CarteiraOrigemLinha;
  responsibleArea: string | null;
  pessoas: number;
  titulosAbertos: number;
  titulosPagos: number;
  valorAberto: number | null;
  tipoLead: string | null;
  tipoIndicacao: string | null;
  nomeIndicacao: string | null;
  areasAtuacao: unknown;
  membros: CarteiraGrupoMembro[];
};

type IssuedLink = { url: string; expiresAt: string };

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: CarteiraGruposSortKey;
  sort: CarteiraGruposSort;
  onSort: (key: CarteiraGruposSortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-(--radius-v2-md) text-left font-medium text-foreground hover:text-interactive-700",
        className,
      )}
    >
      {label}
      <Icon className={cn("size-3.5", active ? "text-interactive-600" : "text-muted-foreground")} />
    </button>
  );
}

export function CarteiraGruposTable({
  groups,
  canIssueLinks,
  canEdit,
}: {
  groups: CarteiraGrupoRow[];
  canIssueLinks: boolean;
  canEdit: boolean;
}) {
  const [sort, setSort] = useState<CarteiraGruposSort>(CARTEIRA_GRUPOS_DEFAULT_SORT);
  const [link, setLink] = useState<IssuedLink | null>(null);
  const [detail, setDetail] = useState<CarteiraGrupoDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => sortCarteiraGrupos(groups, sort), [groups, sort]);

  async function copyIntakeLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/carteira/intake-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as
        | { ok: true; data: IssuedLink }
        | { ok?: false; error?: string };
      if (!res.ok || json.ok !== true) {
        throw new Error(("error" in json && json.error) || "Falha ao obter o link de preenchimento.");
      }
      setLink(json.data);
      await navigator.clipboard.writeText(json.data.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao obter o link de preenchimento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {canIssueLinks ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void copyIntakeLink()}
          >
            {busy ? <Loader2 className="animate-spin" /> : copied ? <Copy /> : <Link2 />}
            Copiar link de preenchimento
          </Button>
          {copied ? <span className="text-v2-caption text-success-text">Link copiado</span> : null}
          {link ? (
            <span className="text-v2-caption text-muted-foreground">
              Válido até {new Date(link.expiresAt).toLocaleDateString("pt-BR")}
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort={sort.key === "nome" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortHeader label="Grupo" sortKey="nome" sort={sort} onSort={(key) => setSort(toggleCarteiraGruposSort(sort, key))} />
            </TableHead>
            <TableHead aria-sort={sort.key === "status" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
              <SortHeader
                label="Status"
                sortKey="status"
                sort={sort}
                onSort={(key) => setSort(toggleCarteiraGruposSort(sort, key))}
              />
            </TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Indicação</TableHead>
            <TableHead>Áreas</TableHead>
            <TableHead className="text-right">Pessoas</TableHead>
            <TableHead className="text-right">Abertos</TableHead>
            <TableHead className="text-right">Pagos</TableHead>
            <TableHead className="text-right">Valor aberto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((grupo) => {
            const indication = parseGrupoIntakeIndication({
              tipoLead: grupo.tipoLead,
              tipoIndicacao: grupo.tipoIndicacao,
              nomeIndicacao: grupo.nomeIndicacao,
            });
            const areas = mergeGrupoPracticeAreas({
              responsibleArea: grupo.responsibleArea,
              areasAtuacao: grupo.areasAtuacao,
            });
            return (
              <TableRow
                key={grupo.id}
                className="cursor-pointer"
                onClick={() => setDetail(grupo)}
              >
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="rounded-(--radius-v2-md) text-left font-medium text-interactive-700 hover:underline"
                    aria-label={`Ver detalhes de ${grupo.nome}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDetail(grupo);
                    }}
                  >
                    {grupo.nome}
                  </button>
                </TableCell>
                <TableCell>
                  {grupo.clienteStatus ? (
                    <Badge
                      variant="outline"
                      className={
                        grupo.clienteStatus === "ativo"
                          ? "border-success-border bg-success-bg text-success-text"
                          : "border-neutral-200 bg-neutral-50 text-neutral-600"
                      }
                    >
                      {CARTEIRA_CLIENTE_STATUS_LABEL[grupo.clienteStatus]}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={CARTEIRA_CATEGORIA_BADGE_CLASS[grupo.origemLinha]}>
                    {CARTEIRA_CATEGORIA_LABEL[grupo.origemLinha]}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[220px] whitespace-normal text-v2-body-sm">
                  {indication.ok ? formatGrupoIntakeIndication(indication.value) : "—"}
                </TableCell>
                <TableCell className="max-w-[280px] whitespace-normal">
                  {areas.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {areas.map((area) => (
                        <AreaIconLabel key={area} area={area} size="xs" />
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{grupo.pessoas}</TableCell>
                <TableCell className="text-right tabular-nums">{grupo.titulosAbertos}</TableCell>
                <TableCell className="text-right tabular-nums">{grupo.titulosPagos}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {grupo.valorAberto != null ? centsToMaskedBrl(Math.round(grupo.valorAberto * 100)) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <CarteiraGrupoDetailDialog
        grupo={detail}
        canEdit={canEdit}
        onOpenChange={(open) => !open && setDetail(null)}
        onSaved={(patch) => {
          setDetail((current) => (current && current.id === patch.id ? { ...current, ...patch } : current));
        }}
      />
    </div>
  );
}
