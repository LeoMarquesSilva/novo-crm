"use client";

import { useState, useTransition } from "react";
import {
  BookText,
  Check,
  Loader2,
  Pencil,
  Plus,
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
import { cn } from "@/lib/utils";

type ClauseRow = {
  id: string;
  title: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ClauseForm = {
  title: string;
  content: string;
  category: string;
  sort_order: number;
  is_active: boolean;
};

const BLANK_FORM: ClauseForm = {
  title: "",
  content: "",
  category: "Geral",
  sort_order: 0,
  is_active: true,
};

const CATEGORY_SUGGESTIONS = [
  "Geral",
  "Responsabilidade",
  "Foro",
  "Sigilo",
  "Rescisão",
  "Garantias",
  "Propriedade Intelectual",
  "Compliance",
  "Tributário",
];

export function ClauseTemplatesAdminPanel({
  initialClauses,
}: {
  initialClauses: ClauseRow[];
}) {
  const [clauses, setClauses] = useState<ClauseRow[]>(initialClauses);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClauseForm>(BLANK_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Group by category
  const byCategory: Record<string, ClauseRow[]> = {};
  for (const c of clauses) {
    const cat = c.category || "Geral";
    (byCategory[cat] ??= []).push(c);
  }
  const categories = Object.keys(byCategory).sort();

  function openCreate() {
    setEditingId(null);
    setForm(BLANK_FORM);
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
    });
    setError(null);
    setFeedback(null);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.title.trim()) { setError("Título é obrigatório."); return; }
    if (!form.category.trim()) { setError("Categoria é obrigatória."); return; }
    setError(null);

    startTransition(async () => {
      try {
        if (editingId) {
          const res = await fetch(`/api/crm/admin/contract-clauses/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          const json = (await res.json()) as { ok?: boolean; data?: ClauseRow; error?: string };
          if (!res.ok || !json.ok || !json.data) throw new Error(json.error ?? `Erro ${res.status}`);
          setClauses((prev) => prev.map((c) => (c.id === editingId ? (json.data as ClauseRow) : c)));
          setFeedback("Cláusula atualizada com sucesso.");
        } else {
          const res = await fetch("/api/crm/admin/contract-clauses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
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
      setClauses((prev) => prev.map((c) => (c.id === clause.id ? (json.data as ClauseRow) : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar cláusula.");
    }
  }

  return (
    <>
      {/* Feedback / erro global */}
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
            onClick={() => { setError(null); setFeedback(null); }}
            className="ml-4 rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      {/* Card principal */}
      <section className="overflow-hidden rounded-[24px] border border-white/55 bg-white/72 shadow-sm shadow-primary-dark/10">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-primary-dark/10 bg-white/70 px-4 py-2.5">
          <p className="text-sm text-muted-foreground">
            {clauses.length === 0
              ? "Nenhuma cláusula cadastrada ainda."
              : `${clauses.filter((c) => c.is_active).length} de ${clauses.length} ativa${clauses.length !== 1 ? "s" : ""}`}
          </p>
          <Button type="button" variant="teal" size="sm" className="h-9 gap-1.5" onClick={openCreate}>
            <Plus className="size-3.5" aria-hidden />
            Nova cláusula
          </Button>
        </div>

        {/* Lista agrupada */}
        {clauses.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-b-[24px] p-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-dark/8 text-primary-dark">
              <BookText className="size-6" aria-hidden />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-bold text-primary-dark">Nenhuma cláusula cadastrada</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Crie modelos de cláusulas para reutilizar no builder de contratos.
              </p>
            </div>
            <Button type="button" variant="teal" size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="size-3.5" aria-hidden />
              Criar primeira cláusula
            </Button>
          </div>
        ) : (
          <div className="space-y-0 divide-y divide-primary-dark/8">
            {categories.map((cat) => (
              <div key={cat}>
                {/* Header da categoria */}
                <div className="flex items-center gap-2 bg-primary-dark/[0.03] px-5 py-2.5">
                  <h3 className="flex-1 text-[10px] font-black uppercase tracking-[0.15em] text-primary-dark/60">
                    {cat}
                  </h3>
                  <span className="rounded-full bg-primary-dark/8 px-2 py-0.5 text-[9px] font-bold tabular-nums text-primary-dark/50">
                    {(byCategory[cat] ?? []).length}
                  </span>
                </div>

                {/* Cláusulas da categoria */}
                <div className="divide-y divide-primary-dark/5">
                  {(byCategory[cat] ?? []).map((clause) => (
                    <div
                      key={clause.id}
                      className={cn(
                        "flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/60",
                        !clause.is_active && "opacity-50",
                      )}
                    >
                      {/* Toggle ativo */}
                      <button
                        type="button"
                        onClick={() => void toggleActive(clause)}
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

                      {/* Conteúdo */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-primary-dark">
                            {clause.title}
                          </p>
                          {!clause.is_active ? (
                            <Badge
                              variant="outline"
                              className="h-5 rounded-full border-slate-200 px-1.5 text-[9px] font-bold uppercase text-slate-400"
                            >
                              Inativa
                            </Badge>
                          ) : null}
                          <span className="text-[10px] text-muted-foreground/60">
                            ord. {clause.sort_order}
                          </span>
                        </div>
                        {clause.content ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {clause.content}
                          </p>
                        ) : null}
                      </div>

                      {/* Ações */}
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="size-8 p-0 text-primary-dark/50 hover:bg-primary-dark/8 hover:text-primary-dark"
                          onClick={() => openEdit(clause)}
                          title="Editar"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="size-8 p-0 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                          onClick={() => setDeleteId(clause.id)}
                          title="Excluir"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Dialog criar / editar ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <header className="border-b border-primary-dark/10 px-5 py-4">
            <DialogTitle className="text-base font-extrabold text-primary-dark">
              {editingId ? "Editar cláusula" : "Nova cláusula"}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {editingId
                ? "Edite os campos abaixo. O conteúdo pode ser personalizado por contrato no builder."
                : "Preencha o título, categoria e conteúdo modelo. O conteúdo pode ser editado por contrato no builder."}
            </DialogDescription>
          </header>

          <div className="space-y-4 px-5 py-5">
            {/* Título */}
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

            {/* Categoria */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Categoria</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Ex: Geral, Foro, Sigilo…"
                className="h-10 border-primary-dark/15 bg-white text-sm"
                list="category-suggestions"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="text-[10px] text-muted-foreground">
                Agrupa cláusulas relacionadas na biblioteca do builder.
              </p>
            </div>

            {/* Conteúdo */}
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

            {/* Ordem + ativa — linha horizontal */}
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

      {/* ── Confirm delete ── */}
      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cláusula?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Contratos já gerados não serão afetados, mas a cláusula não
              estará mais disponível no builder.
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
