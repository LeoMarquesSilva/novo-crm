"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  AlertCircle,
  BookText,
  Check,
  ChevronDown,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import { cn } from "@/lib/utils";
import { buildClauseScopeTree, type ClauseScopeTree } from "@/lib/crm/contract-engine/clause-scope-tree";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";

export type ClauseRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stable_key?: string | null;
  version?: number | null;
  status?: string | null;
  role?: string | null;
  is_required?: boolean | null;
  placeholders?: string[] | null;
  legal_review_note?: string | null;
  area_key?: string | null;
  scope_subtype_key?: string | null;
};

type ScopeKind = "transversal" | "area" | "subtype";

type ClauseForm = {
  title: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  scopeKind: ScopeKind;
  areaKey: string;
  subtypeKey: string;
};

function blankForm(defaults: Partial<Pick<ClauseForm, "scopeKind" | "areaKey" | "subtypeKey">> = {}): ClauseForm {
  return {
    title: "",
    content: "",
    category: "Geral",
    sort_order: 0,
    is_active: true,
    scopeKind: defaults.scopeKind ?? "transversal",
    areaKey: defaults.areaKey ?? "",
    subtypeKey: defaults.subtypeKey ?? "",
  };
}

const STATUS_LABELS: Record<string, string> = {
  pending_legal_review: "Revisão jurídica",
  approved: "Aprovada",
  retired: "Descontinuada",
};

const ROLE_LABELS: Record<string, string> = {
  object: "Objeto",
  scope: "Escopo",
  limitation: "Limites",
  exclusion: "Exclusão",
  nature: "Natureza",
  contracted_obligation: "Obrigação da contratada",
  contracting_obligation: "Obrigação da contratante",
  payment: "Pagamento",
  default: "Inadimplemento",
  term: "Vigência",
  termination: "Extinção",
  expense: "Despesas",
  compliance: "Compliance",
  general: "Geral",
  special: "Especial",
};

function categoryLabel(category: string) {
  return category || "Geral";
}

function statusBadgeClass(status: string | null | undefined) {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "retired") {
    return "border-slate-200 bg-slate-50 text-slate-500";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function ClauseTemplatesAdminPanel({
  initialClauses,
  catalog,
}: {
  initialClauses: ClauseRow[];
  catalog: PropostaTiposCatalog;
}) {
  const [clauses, setClauses] = useState<ClauseRow[]>(initialClauses);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClauseForm>(blankForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Reagrupa a árvore Área → Tipo → Subtipo a cada mudança em `clauses`, para que
  // criar/editar/excluir uma cláusula reflita na hora, sem depender de reload.
  const liveTree = useMemo<ClauseScopeTree<ClauseRow>>(
    () => buildClauseScopeTree({ catalog, clauses }),
    [catalog, clauses],
  );

  const scopeOptions = useMemo(() => {
    return liveTree.areas.flatMap((area) =>
      area.types.flatMap((type) =>
        type.subtypes.map((subtype) => ({
          value: subtype.subtypeKey,
          areaKey: area.areaKey,
          label: `${area.areaKey} › ${type.typeLabel} › ${subtype.subtypeLabel}`,
        })),
      ),
    );
  }, [liveTree]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    return clauses.filter((clause) => {
      return (
        clause.title.toLowerCase().includes(needle) ||
        clause.content.toLowerCase().includes(needle) ||
        (clause.stable_key ?? "").toLowerCase().includes(needle) ||
        (clause.category || "").toLowerCase().includes(needle) ||
        (clause.area_key ?? "").toLowerCase().includes(needle)
      );
    });
  }, [clauses, query]);

  function openCreate(defaults: Partial<Pick<ClauseForm, "scopeKind" | "areaKey" | "subtypeKey">> = {}) {
    setEditingId(null);
    setForm(blankForm(defaults));
    setError(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function openEdit(clause: ClauseRow) {
    setEditingId(clause.id);
    setForm({
      title: clause.title,
      content: clause.content,
      category: clause.category,
      sort_order: clause.sort_order,
      is_active: clause.is_active,
      scopeKind: clause.scope_subtype_key ? "subtype" : clause.area_key ? "area" : "transversal",
      areaKey: clause.area_key ?? "",
      subtypeKey: clause.scope_subtype_key ?? "",
    });
    setError(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function resolveScopeFields(): { area_key: string | null; scope_subtype_key: string | null } {
    if (form.scopeKind === "transversal") return { area_key: null, scope_subtype_key: null };
    if (form.scopeKind === "area") return { area_key: form.areaKey || null, scope_subtype_key: null };
    const option = scopeOptions.find((o) => o.value === form.subtypeKey);
    return { area_key: option?.areaKey ?? null, scope_subtype_key: form.subtypeKey || null };
  }

  function handleSave() {
    if (!form.title.trim()) {
      setError("Título é obrigatório.");
      return;
    }
    if (!form.category.trim()) {
      setError("Categoria é obrigatória.");
      return;
    }
    if (form.scopeKind === "area" && !form.areaKey) {
      setError("Selecione a área.");
      return;
    }
    if (form.scopeKind === "subtype" && !form.subtypeKey) {
      setError("Selecione o subtipo.");
      return;
    }
    setError(null);

    const payload = {
      title: form.title,
      content: form.content,
      category: form.category,
      sort_order: form.sort_order,
      is_active: form.is_active,
      ...resolveScopeFields(),
    };

    startTransition(async () => {
      try {
        if (editingId) {
          const res = await fetch(`/api/crm/admin/contract-clauses/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = (await res.json()) as { ok?: boolean; data?: ClauseRow; error?: string };
          if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? `Erro ${res.status}`);
          setClauses((prev) => prev.map((c) => (c.id === editingId ? { ...c, ...json.data } : c)));
          setFeedback("Cláusula atualizada com sucesso.");
        } else {
          const res = await fetch("/api/crm/admin/contract-clauses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = (await res.json()) as { ok?: boolean; data?: ClauseRow; error?: string };
          if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? `Erro ${res.status}`);
          setClauses((prev) => [...prev, json.data as ClauseRow]);
          setFeedback("Cláusula criada com sucesso.");
        }
        setDialogOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar cláusula.");
      }
    });
  }

  function handleDelete() {
    if (!deleteId) return;
    const idToDelete = deleteId;
    setDeleteId(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/crm/admin/contract-clauses/${idToDelete}`, { method: "DELETE" });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? `Erro ${res.status}`);
        setClauses((prev) => prev.filter((c) => c.id !== idToDelete));
        setFeedback("Cláusula excluída.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao excluir cláusula.");
      }
    });
  }

  async function toggleActive(clause: ClauseRow) {
    try {
      const res = await fetch(`/api/crm/admin/contract-clauses/${clause.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !clause.is_active }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: ClauseRow; error?: string };
      if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? `Erro ${res.status}`);
      setClauses((prev) => prev.map((c) => (c.id === clause.id ? { ...c, ...json.data } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar cláusula.");
    }
  }

  return (
    <>
      {(feedback ?? error) ? (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
            error
              ? "border border-rose-200 bg-rose-50 text-rose-700"
              : "border border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <span>{error ?? feedback}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setFeedback(null);
            }}
            className="ml-4 rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[24px] border border-white/55 bg-white/72 shadow-sm shadow-primary-dark/10">
        <div className="flex flex-col gap-3 border-b border-primary-dark/10 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {clauses.length === 0
              ? "Nenhuma cláusula cadastrada ainda."
              : `${clauses.filter((c) => c.is_active).length} de ${clauses.length} ativa${clauses.length !== 1 ? "s" : ""}`}
          </p>
          <Button type="button" variant="teal" size="sm" className="h-9 gap-1.5" onClick={() => openCreate()}>
            <Plus className="size-3.5" aria-hidden />
            Nova cláusula
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-b border-primary-dark/8 px-4 py-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, chave, texto ou área…"
              className="h-9 border-primary-dark/15 bg-white pl-9 text-sm"
            />
          </div>
        </div>

        {searchResults ? (
          <SearchResultsList
            results={searchResults}
            onEdit={openEdit}
            onDelete={setDeleteId}
            onToggle={toggleActive}
          />
        ) : (
          <div className="divide-y divide-primary-dark/8">
            {liveTree.transversalClauses.length > 0 ? (
              <TransversalSection
                clauses={liveTree.transversalClauses}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onToggle={toggleActive}
                onAdd={() => openCreate({ scopeKind: "transversal" })}
              />
            ) : null}

            {liveTree.areas.map((area) => (
              <AreaSection
                key={area.areaKey}
                area={area}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onToggle={toggleActive}
                onAddToSubtype={(subtypeKey) =>
                  openCreate({ scopeKind: "subtype", areaKey: area.areaKey, subtypeKey })
                }
                onAddToArea={() => openCreate({ scopeKind: "area", areaKey: area.areaKey })}
              />
            ))}
          </div>
        )}
      </section>

      <Dialog modal={false} open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-lg gap-0 p-0"
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          <header className="border-b border-primary-dark/10 px-5 py-4">
            <DialogTitle className="text-base font-extrabold text-primary-dark">
              {editingId ? "Editar cláusula" : "Nova cláusula"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {editingId
                ? "Edite os campos abaixo. Cláusulas ligadas a um subtipo alimentam a geração automática do contrato."
                : "Preencha o título, a abrangência e o conteúdo modelo."}
            </DialogDescription>
          </header>

          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Foro de eleição"
                className="h-10 border-primary-dark/15 bg-white text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Abrangência</Label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["transversal", "Transversal (todas as áreas)"],
                    ["area", "Área inteira"],
                    ["subtype", "Subtipo específico"],
                  ] as Array<[ScopeKind, string]>
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, scopeKind: kind }))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                      form.scopeKind === kind
                        ? "border-primary-dark/70 bg-primary-dark text-white"
                        : "border-primary-dark/15 bg-white text-primary-dark/70 hover:bg-primary-dark/5",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.scopeKind === "area" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary-dark">Área</Label>
                <Select
                  items={Object.fromEntries(CRM_PRACTICE_AREAS.map((a) => [a, a]))}
                  value={form.areaKey || undefined}
                  onValueChange={(next) => setForm((f) => ({ ...f, areaKey: next ?? "" }))}
                >
                  <SelectTrigger className="h-10 w-full border-primary-dark/15 bg-white">
                    <CrmSelectValue
                      value={form.areaKey}
                      labels={Object.fromEntries(CRM_PRACTICE_AREAS.map((a) => [a, a]))}
                      placeholder="Selecione a área"
                    />
                  </SelectTrigger>
                  <CrmSelectContent>
                    {CRM_PRACTICE_AREAS.map((a) => (
                      <CrmSelectItem key={a} value={a}>
                        {a}
                      </CrmSelectItem>
                    ))}
                  </CrmSelectContent>
                </Select>
              </div>
            ) : null}

            {form.scopeKind === "subtype" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary-dark">Subtipo</Label>
                {scopeOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Nenhum subtipo com perfil de contrato disponível ainda.
                  </p>
                ) : (
                  <Select
                    items={Object.fromEntries(scopeOptions.map((o) => [o.value, o.label]))}
                    value={form.subtypeKey || undefined}
                    onValueChange={(next) => setForm((f) => ({ ...f, subtypeKey: next ?? "" }))}
                  >
                    <SelectTrigger className="h-10 w-full border-primary-dark/15 bg-white">
                      <CrmSelectValue
                        value={form.subtypeKey}
                        labels={Object.fromEntries(scopeOptions.map((o) => [o.value, o.label]))}
                        placeholder="Selecione o subtipo"
                      />
                    </SelectTrigger>
                    <CrmSelectContent>
                      {scopeOptions.map((o) => (
                        <CrmSelectItem key={o.value} value={o.value}>
                          {o.label}
                        </CrmSelectItem>
                      ))}
                    </CrmSelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Categoria</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ex: PADRÃO BP, Foro, Sigilo…"
                className="h-10 border-primary-dark/15 bg-white text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Sub-agrupamento livre dentro da abrangência escolhida acima.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">
                Conteúdo modelo{" "}
                <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="Texto da cláusula. Pode ser editado individualmente por contrato no builder."
                className="min-h-[140px] resize-y border-primary-dark/15 bg-white font-mono text-[12.5px] leading-relaxed"
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary-dark">Ordem</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                  className="h-10 w-24 border-primary-dark/15 bg-white text-center text-sm tabular-nums"
                />
                <p className="text-[10px] text-muted-foreground">Menor = primeiro</p>
              </div>

              <label className="mb-0.5 inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary-dark/10 bg-white px-3 py-2 text-[11px] font-semibold text-primary-dark transition-colors hover:bg-primary-dark/5">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="size-3 accent-emerald-600"
                />
                {form.is_active ? (
                  <span className="text-emerald-700">Ativa</span>
                ) : (
                  <span className="text-slate-500">Inativa</span>
                )}
              </label>
            </div>

            {error ? (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            ) : null}
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-primary-dark/10 bg-slate-50/60 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="teal"
              disabled={isPending}
              onClick={handleSave}
              className="gap-1.5"
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-3.5" aria-hidden />
              )}
              {editingId ? "Salvar alterações" : "Criar cláusula"}
            </Button>
          </footer>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cláusula?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Contratos já gerados não serão afetados, mas a cláusula não
              estará mais disponível no builder nem na geração automática.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Blocos de listagem ──────────────────────────────────────────────────────

type ClauseListHandlers = {
  onEdit: (clause: ClauseRow) => void;
  onDelete: (id: string) => void;
  onToggle: (clause: ClauseRow) => void;
};

function ClauseListItem({ clause, onEdit, onDelete, onToggle }: { clause: ClauseRow } & ClauseListHandlers) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/60",
        !clause.is_active && "opacity-50",
      )}
    >
      <button
        type="button"
        onClick={() => void onToggle(clause)}
        title={clause.is_active ? "Desativar" : "Ativar"}
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          clause.is_active
            ? "border-emerald-400 bg-emerald-50 text-emerald-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500"
            : "border-primary-dark/20 bg-white text-transparent hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600",
        )}
      >
        <Check className="size-3" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-primary-dark">{clause.title}</p>
          {!clause.is_active ? (
            <Badge
              variant="outline"
              className="h-5 rounded-full border-slate-200 px-1.5 text-[9px] font-bold uppercase text-slate-400"
            >
              Inativa
            </Badge>
          ) : null}
          {clause.status ? (
            <Badge
              variant="outline"
              className={cn("h-5 rounded-full px-1.5 text-[9px] font-bold uppercase", statusBadgeClass(clause.status))}
            >
              {STATUS_LABELS[clause.status] ?? clause.status}
            </Badge>
          ) : null}
          {clause.role ? (
            <Badge
              variant="outline"
              className="h-5 rounded-full border-primary-dark/10 px-1.5 text-[9px] font-bold uppercase text-primary-dark/55"
            >
              {ROLE_LABELS[clause.role] ?? clause.role}
            </Badge>
          ) : null}
          {clause.is_required ? (
            <Badge
              variant="outline"
              className="h-5 rounded-full border-sky-200 bg-sky-50 px-1.5 text-[9px] font-bold uppercase text-sky-700"
            >
              Obrigatória
            </Badge>
          ) : null}
          <Badge
            variant="outline"
            className="h-5 rounded-full border-primary-dark/10 px-1.5 text-[9px] font-bold uppercase text-primary-dark/40"
          >
            {categoryLabel(clause.category)}
          </Badge>
        </div>
        {clause.stable_key ? (
          <p className="mt-1 font-mono text-[11px] text-muted-foreground/80">{clause.stable_key}</p>
        ) : null}
        {clause.content ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{clause.content}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-primary-dark/50 hover:bg-primary-dark/8 hover:text-primary-dark"
          onClick={() => onEdit(clause)}
          title="Editar"
        >
          <Pencil className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-8 p-0 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
          onClick={() => onDelete(clause.id)}
          title="Excluir"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function SearchResultsList({
  results,
  onEdit,
  onDelete,
  onToggle,
}: { results: ClauseRow[] } & ClauseListHandlers) {
  if (results.length === 0) {
    return <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma cláusula corresponde à busca.</div>;
  }
  return (
    <div className="divide-y divide-primary-dark/5">
      {results.map((clause) => (
        <ClauseListItem key={clause.id} clause={clause} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />
      ))}
    </div>
  );
}

function TransversalSection({
  clauses,
  onAdd,
  ...handlers
}: { clauses: ClauseRow[]; onAdd: () => void } & ClauseListHandlers) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <SectionHeader
        icon={<Layers3 className="size-4" aria-hidden />}
        title="Cláusulas Padrão / Transversais"
        subtitle="Valem para qualquer contrato, independente da área (ex.: pagamento, inadimplemento, foro)."
        count={clauses.length}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        onAdd={onAdd}
        addLabel="Cláusula transversal"
      />
      {open ? (
        <div className="divide-y divide-primary-dark/5 border-t border-primary-dark/8">
          {clauses.map((clause) => (
            <ClauseListItem key={clause.id} clause={clause} {...handlers} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AreaSection({
  area,
  onAddToSubtype,
  onAddToArea,
  ...handlers
}: {
  area: ClauseScopeTree<ClauseRow>["areas"][number];
  onAddToSubtype: (subtypeKey: string) => void;
  onAddToArea: () => void;
} & ClauseListHandlers) {
  const [open, setOpen] = useState(true);
  const totalClauses =
    area.areaWideClauses.length +
    area.types.reduce((sum, t) => sum + t.subtypes.reduce((s2, st) => s2 + st.clauses.length, 0), 0);
  const isEmpty = area.types.length === 0 && area.areaWideClauses.length === 0;

  return (
    <div>
      <SectionHeader
        icon={<BookText className="size-4" aria-hidden />}
        title={area.areaKey}
        subtitle={
          isEmpty
            ? "Nenhum tipo/subtipo de escopo cadastrado no catálogo de propostas ainda."
            : `${area.types.length} tipo${area.types.length !== 1 ? "s" : ""} de escopo`
        }
        count={totalClauses}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        onAdd={area.types.length > 0 ? onAddToArea : undefined}
        addLabel="Cláusula da área"
      />
      {open && !isEmpty ? (
        <div className="space-y-3 border-t border-primary-dark/8 bg-primary-dark/[0.015] px-5 py-4">
          {area.types.map((type) => (
            <div key={type.typeKey} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-primary-dark/50">
                {type.typeLabel}
              </p>
              {type.subtypes.map((subtype) => (
                <SubtypeCard
                  key={subtype.subtypeKey}
                  subtype={subtype}
                  onAdd={() => onAddToSubtype(subtype.subtypeKey)}
                  {...handlers}
                />
              ))}
            </div>
          ))}
          {area.areaWideClauses.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white">
              <div className="flex items-center justify-between border-b border-primary-dark/8 bg-primary-dark/[0.03] px-4 py-2">
                <p className="text-[11px] font-bold text-primary-dark/70">
                  Cláusulas da área inteira (sem subtipo específico)
                </p>
                <span className="rounded-full bg-primary-dark/8 px-2 py-0.5 text-[9px] font-bold tabular-nums text-primary-dark/50">
                  {area.areaWideClauses.length}
                </span>
              </div>
              <div className="divide-y divide-primary-dark/5">
                {area.areaWideClauses.map((clause) => (
                  <ClauseListItem key={clause.id} clause={clause} {...handlers} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SubtypeCard({
  subtype,
  onAdd,
  ...handlers
}: {
  subtype: ClauseScopeTree<ClauseRow>["areas"][number]["types"][number]["subtypes"][number];
  onAdd: () => void;
} & ClauseListHandlers) {
  const [objectOpen, setObjectOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-dark/8 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary-dark">{subtype.subtypeLabel}</p>
          <p className="font-mono text-[10px] text-muted-foreground/80">{subtype.subtypeKey}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {subtype.profile ? (
            <>
              <Badge
                variant="outline"
                className={cn("h-5 rounded-full px-1.5 text-[9px] font-bold uppercase", statusBadgeClass(subtype.profile.status))}
              >
                {STATUS_LABELS[subtype.profile.status] ?? subtype.profile.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">{subtype.profile.instrumentType}</span>
            </>
          ) : (
            <Badge
              variant="outline"
              className="h-5 gap-1 rounded-full border-amber-200 bg-amber-50 px-1.5 text-[9px] font-bold uppercase text-amber-800"
            >
              <AlertCircle className="size-2.5" aria-hidden />
              Sem perfil de contrato
            </Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-[11px] font-semibold text-primary-dark/60 hover:bg-primary-dark/8 hover:text-primary-dark"
            onClick={onAdd}
          >
            <Plus className="size-3" aria-hidden />
            Cláusula
          </Button>
        </div>
      </div>

      {subtype.objectTemplates.length > 0 ? (
        <div className="border-b border-primary-dark/8">
          <button
            type="button"
            onClick={() => setObjectOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-[11px] font-semibold text-primary-dark/60 hover:bg-primary-dark/[0.03]"
          >
            <span>Modelos de Objeto ({subtype.objectTemplates.length}) — somente leitura</span>
            <ChevronDown className={cn("size-3.5 transition-transform", objectOpen && "rotate-180")} aria-hidden />
          </button>
          <p className="border-t border-dashed border-amber-200 bg-amber-50 px-4 py-2 text-[10px] leading-relaxed text-amber-800">
            Estes modelos têm prioridade sobre cláusulas de Objeto/Escopo/Limites/Natureza deste
            subtipo: editar uma cláusula desses papéis abaixo não muda o contrato gerado enquanto
            este motor de Objeto cobrir o subtipo. Só Exclusão, Pagamento e Cláusulas
            Padrão/Transversais são lidas do banco na geração.
          </p>
          {objectOpen ? (
            <div className="space-y-2 bg-primary-dark/[0.02] px-4 py-3">
              {subtype.objectTemplates.map((template) => (
                <div key={template.stableKey} className="rounded-lg border border-primary-dark/8 bg-white px-3 py-2">
                  <p className="text-xs font-semibold text-primary-dark">{template.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{template.content}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {subtype.clauses.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">Nenhuma cláusula cadastrada para este subtipo.</p>
      ) : (
        <div className="divide-y divide-primary-dark/5">
          {subtype.clauses.map((clause) => (
            <ClauseListItem key={clause.id} clause={clause} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  count,
  open,
  onToggle,
  onAdd,
  addLabel,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 bg-white/70 px-5 py-3.5">
      <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-3 text-left">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl border border-zinc-200/90 bg-white text-zinc-700 shadow-sm">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-primary-dark">{title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-full bg-primary-dark/8 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary-dark/60">
          {count}
        </span>
        <ChevronDown className={cn("size-4 text-primary-dark/40 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {onAdd ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-primary-dark/15 text-[11px] font-semibold"
          onClick={onAdd}
        >
          <Plus className="size-3" aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
