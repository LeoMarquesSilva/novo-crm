"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { describeGrupoAreaSources } from "@/lib/crm/grupo-areas-atuacao";
import {
  GRUPO_INTAKE_INDICATION_TYPES,
  GRUPO_INTAKE_LEAD_TYPES,
} from "@/lib/crm/grupo-intake-indication";
import {
  listGrupoIntakeGridRows,
  type GrupoIntakeGridStatusFilter,
} from "@/lib/crm/grupo-intake-grid";
import type { GrupoIntakeGridData, GrupoIntakeGridRow } from "@/lib/crm/grupo-intake-service";
import {
  CARTEIRA_CLIENTE_STATUS_LABEL,
} from "@/lib/orqestrai/gestor-atividade";
import { cn } from "@/lib/utils";

const LEAD_TYPE_ITEMS = Object.fromEntries(GRUPO_INTAKE_LEAD_TYPES.map((item) => [item, item]));
const INDICATION_TYPE_ITEMS = Object.fromEntries(
  GRUPO_INTAKE_INDICATION_TYPES.map((item) => [item, item]),
);
const STATUS_FILTER_ITEMS: Record<GrupoIntakeGridStatusFilter, string> = {
  ativos: "Clientes ativos",
  inativos: "Clientes inativos",
  todos: "Todos os grupos",
};
const SAVE_DEBOUNCE_MS = 800;

type RowDraft = {
  tipoLead: string;
  tipoIndicacao: string;
  nomeIndicacao: string;
  selectedAreaKeys: string[];
  saveState: "idle" | "dirty" | "saving" | "saved" | "error";
  error: string | null;
};

function draftFromRow(row: GrupoIntakeGridRow): RowDraft {
  return {
    tipoLead: row.indication?.tipoLead ?? "",
    tipoIndicacao: row.indication?.tipoIndicacao ?? "",
    nomeIndicacao: row.indication?.nomeIndicacao ?? "",
    selectedAreaKeys: [...row.prefilledAreaKeys],
    saveState: "idle",
    error: null,
  };
}

function saveLabel(state: RowDraft["saveState"]) {
  if (state === "saving") return "Salvando…";
  if (state === "saved") return "Salvo";
  if (state === "error") return "Erro";
  if (state === "dirty") return "Salvar";
  return "Salvar";
}

export function GrupoIntakePublicGrid({
  token,
  initial,
}: {
  token: string;
  initial: GrupoIntakeGridData;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GrupoIntakeGridStatusFilter>("ativos");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(initial.groups.map((row) => [row.id, draftFromRow(row)])),
  );
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const timers = useRef<Record<string, number>>({});
  const derivedByGrupo = useMemo(
    () => new Map(initial.groups.map((row) => [row.id, row])),
    [initial.groups],
  );

  const visible = useMemo(
    () => listGrupoIntakeGridRows(initial.groups, { query, status }),
    [initial.groups, query, status],
  );

  useEffect(() => {
    const current = timers.current;
    return () => {
      for (const timer of Object.values(current)) window.clearTimeout(timer);
    };
  }, []);

  function patchDraft(grupoId: string, patch: Partial<RowDraft>, scheduleSave = true) {
    setDrafts((current) => {
      const previous = current[grupoId] ?? draftFromRow(derivedByGrupo.get(grupoId)!);
      return {
        ...current,
        [grupoId]: { ...previous, ...patch, saveState: patch.saveState ?? "dirty", error: patch.error ?? null },
      };
    });
    if (!scheduleSave) return;
    window.clearTimeout(timers.current[grupoId]);
    timers.current[grupoId] = window.setTimeout(() => {
      void saveRow(grupoId);
    }, SAVE_DEBOUNCE_MS);
  }

  async function saveRow(grupoId: string) {
    window.clearTimeout(timers.current[grupoId]);
    const row = derivedByGrupo.get(grupoId);
    const draft = draftsRef.current[grupoId] ?? (row ? draftFromRow(row) : null);
    if (!row || !draft) return;

    const isIndicacao = draft.tipoLead === "Indicacao";
    if (!draft.tipoLead) {
      setDrafts((current) => ({
        ...current,
        [grupoId]: { ...draft, saveState: "error", error: "Selecione o tipo de origem." },
      }));
      return;
    }
    if (isIndicacao && (!draft.tipoIndicacao || !draft.nomeIndicacao.trim())) {
      setDrafts((current) => ({
        ...current,
        [grupoId]: {
          ...draft,
          saveState: "error",
          error: "Para Indicação, preencha o subtipo e quem indicou.",
        },
      }));
      return;
    }

    setDrafts((current) => ({
      ...current,
      [grupoId]: { ...(current[grupoId] ?? draft), saveState: "saving", error: null },
    }));

    try {
      const res = await fetch(`/api/public/carteira-intake/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grupoId,
          tipoLead: draft.tipoLead,
          tipoIndicacao: isIndicacao ? draft.tipoIndicacao : null,
          nomeIndicacao: isIndicacao ? draft.nomeIndicacao : null,
          selectedAreaKeys: draft.selectedAreaKeys,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok !== true) {
        throw new Error(json.error || "Não foi possível gravar esta linha.");
      }
      setDrafts((current) => ({
        ...current,
        [grupoId]: { ...(current[grupoId] ?? draft), saveState: "saved", error: null },
      }));
    } catch (cause) {
      setDrafts((current) => ({
        ...current,
        [grupoId]: {
          ...(current[grupoId] ?? draft),
          saveState: "error",
          error: cause instanceof Error ? cause.message : "Não foi possível gravar esta linha.",
        },
      }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 space-y-3 bg-background px-1 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar grupo na lista"
            aria-label="Buscar grupo"
            className="h-10 md:max-w-sm"
          />
          <Select
            items={STATUS_FILTER_ITEMS}
            value={status}
            onValueChange={(value) => setStatus((value as GrupoIntakeGridStatusFilter) || "ativos")}
          >
            <SelectTrigger className="h-10 w-full justify-between font-normal md:w-56">
              <CrmSelectValue value={status} labels={STATUS_FILTER_ITEMS} />
            </SelectTrigger>
            <CrmSelectContent>
              {(Object.keys(STATUS_FILTER_ITEMS) as GrupoIntakeGridStatusFilter[]).map((item) => (
                <CrmSelectItem key={item} value={item}>
                  {STATUS_FILTER_ITEMS[item]}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <p className="text-v2-caption text-muted-foreground">
          {visible.length} grupo{visible.length === 1 ? "" : "s"} na grade. Edite na própria linha;
          a gravação é automática.
        </p>
      </div>

      <div className="overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grupo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Subtipo/indicação</TableHead>
              <TableHead>Quem indicou</TableHead>
              <TableHead>Áreas</TableHead>
              <TableHead className="text-right">Salvar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="h-auto">
                <TableCell colSpan={7} className="py-8 text-center text-v2-body-sm text-muted-foreground">
                  {status === "ativos"
                    ? "Nenhum cliente ativo nesta busca. Troque o filtro para ver inativos."
                    : "Nenhum grupo encontrado."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((grupo) => {
                const draft = drafts[grupo.id] ?? draftFromRow(grupo);
                const isIndicacao = draft.tipoLead === "Indicacao";
                const derivedByArea = new Map(grupo.derivedAreas.map((area) => [area.areaKey, area]));
                return (
                  <TableRow key={grupo.id} className="h-auto align-top">
                    <TableCell className="min-w-[160px] py-3 font-medium text-foreground">
                      {grupo.nome}
                    </TableCell>
                    <TableCell className="py-3">
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
                    <TableCell className="min-w-[160px] py-3">
                      <Select
                        modal={false}
                        items={LEAD_TYPE_ITEMS}
                        value={draft.tipoLead}
                        onValueChange={(value) => {
                          const next = value ?? "";
                          patchDraft(grupo.id, {
                            tipoLead: next,
                            tipoIndicacao: next === "Indicacao" ? draft.tipoIndicacao : "",
                            nomeIndicacao: next === "Indicacao" ? draft.nomeIndicacao : "",
                          });
                        }}
                      >
                        <SelectTrigger size="sm" className="h-9 w-full justify-between font-normal">
                          <CrmSelectValue value={draft.tipoLead} labels={LEAD_TYPE_ITEMS} placeholder="Tipo" />
                        </SelectTrigger>
                        <CrmSelectContent>
                          {GRUPO_INTAKE_LEAD_TYPES.map((item) => (
                            <CrmSelectItem key={item} value={item}>
                              {item}
                            </CrmSelectItem>
                          ))}
                        </CrmSelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-[170px] py-3">
                      {isIndicacao ? (
                        <Select
                          modal={false}
                          items={INDICATION_TYPE_ITEMS}
                          value={draft.tipoIndicacao}
                          onValueChange={(value) =>
                            patchDraft(grupo.id, { tipoIndicacao: value ?? "" })
                          }
                        >
                          <SelectTrigger size="sm" className="h-9 w-full justify-between font-normal">
                            <CrmSelectValue
                              value={draft.tipoIndicacao}
                              labels={INDICATION_TYPE_ITEMS}
                              placeholder="Subtipo"
                            />
                          </SelectTrigger>
                          <CrmSelectContent>
                            {GRUPO_INTAKE_INDICATION_TYPES.map((item) => (
                              <CrmSelectItem key={item} value={item}>
                                {item}
                              </CrmSelectItem>
                            ))}
                          </CrmSelectContent>
                        </Select>
                      ) : (
                        <span className="text-v2-caption text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[160px] py-3">
                      {isIndicacao ? (
                        <Input
                          value={draft.nomeIndicacao}
                          onChange={(event) =>
                            patchDraft(grupo.id, { nomeIndicacao: event.target.value })
                          }
                          placeholder="Nome de quem indicou"
                          className="h-9"
                        />
                      ) : (
                        <span className="text-v2-caption text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-[280px] py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {initial.practiceAreas.map((area) => {
                          const checked = draft.selectedAreaKeys.includes(area);
                          const derived = derivedByArea.get(area);
                          const Icon = getAreaLucideIcon(area);
                          return (
                            <button
                              key={area}
                              type="button"
                              aria-pressed={checked}
                              title={derived ? describeGrupoAreaSources(derived.sources) : "Manual, se marcada"}
                              onClick={() => {
                                const current = draftsRef.current[grupo.id] ?? draft;
                                const already = current.selectedAreaKeys.includes(area);
                                patchDraft(grupo.id, {
                                  selectedAreaKeys: already
                                    ? current.selectedAreaKeys.filter((item) => item !== area)
                                    : [...current.selectedAreaKeys, area],
                                });
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-(--radius-v2-md) border px-1.5 py-1 text-v2-caption transition-colors",
                                checked
                                  ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                                  : "border-border bg-white text-muted-foreground hover:border-border-strong",
                              )}
                            >
                              <Icon className="size-3" />
                              {area}
                            </button>
                          );
                        })}
                      </div>
                      {draft.error ? (
                        <p className="mt-1.5 text-v2-caption text-danger-text">{draft.error}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={draft.saveState === "dirty" || draft.saveState === "error" ? "default" : "outline"}
                        disabled={draft.saveState === "saving"}
                        onClick={() => void saveRow(grupo.id)}
                      >
                        {saveLabel(draft.saveState)}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
