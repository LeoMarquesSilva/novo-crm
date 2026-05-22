"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROPOSTA_AREA_OPTIONS } from "@/data/proposta-tipos-catalog";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { CatalogDeleteButton } from "@/components/crm/scope-catalog/catalog-delete-button";
import { cn } from "@/lib/utils";

type ScopeTypeRow = ProposalCatalogAdminData["adminRows"]["scopeTypes"][number];
type InvestmentTypeRow = ProposalCatalogAdminData["adminRows"]["investmentTypes"][number];

export type TypeEditorMode =
  | { kind: "scope"; row: ScopeTypeRow; breadcrumb: string[] }
  | { kind: "investment"; row: InvestmentTypeRow; breadcrumb: string[] };

type Props = {
  mode: TypeEditorMode;
  subtypeCount: number;
  onSaved: (catalog: ProposalCatalogAdminData) => void;
  onDeleted: (catalog: ProposalCatalogAdminData) => void;
};

type Draft = {
  label: string;
  areaKey: string;
  sortOrder: number;
  isActive: boolean;
};

export function CatalogTypeEditor({ mode, subtypeCount, onSaved, onDeleted }: Props) {
  const router = useRouter();

  const initialDraft = useMemo<Draft>(
    () => ({
      label: mode.row.label,
      areaKey: mode.kind === "scope" ? mode.row.areaKey : "",
      sortOrder: mode.row.sortOrder,
      isActive: mode.row.isActive,
    }),
    [mode],
  );

  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saved, setSaved] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialDraft);
    setSaved(initialDraft);
    setFeedback(null);
    setError(null);
  }, [initialDraft]);

  const isDirty = useMemo(() => !draftsEqual(draft, saved), [draft, saved]);

  const areaName = mode.kind === "scope" ? draft.areaKey : mode.breadcrumb[0] ?? "";
  const AreaIcon = getAreaLucideIcon(areaName);

  async function save() {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const body =
        mode.kind === "scope"
          ? {
              kind: "scope_type" as const,
              id: mode.row.id,
              label: draft.label,
              areaKey: draft.areaKey,
              sortOrder: draft.sortOrder,
              isActive: draft.isActive,
            }
          : {
              kind: "investment_type" as const,
              id: mode.row.id,
              label: draft.label,
              sortOrder: draft.sortOrder,
              isActive: draft.isActive,
            };
      const res = await fetch("/api/admin/proposal-catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ProposalCatalogAdminData;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao salvar.");
      }
      setSaved(draft);
      setFeedback(`"${draft.label}" salvo com sucesso.`);
      onSaved(json.data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-dark/10 bg-white/85 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-dark/8 text-primary-dark">
            <AreaIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {mode.kind === "scope" ? "Tipo de escopo" : "Tipo de investimento"}
              {mode.breadcrumb.length > 1
                ? ` · ${mode.breadcrumb.slice(0, -1).join(" › ")}`
                : null}
            </p>
            <h2 className="truncate text-base font-extrabold text-primary-dark">{draft.label}</h2>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CatalogDeleteButton
            kind={mode.kind === "scope" ? "scope_type" : "investment_type"}
            id={mode.row.id}
            itemLabel={draft.label}
            childSubtypeCount={subtypeCount}
            onDeleted={onDeleted}
            disabled={saving}
          />

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-primary-dark/10 bg-white px-3 py-1.5 text-[11px] font-semibold text-primary-dark transition-colors hover:bg-primary-dark/5">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))}
              className="size-3 accent-emerald-600"
            />
            {draft.isActive ? (
              <span className="text-emerald-700">Ativo</span>
            ) : (
              <span className="text-slate-500">Inativo</span>
            )}
          </label>

          {isDirty ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
              <Sparkles className="size-3" aria-hidden />
              Não salvo
            </span>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="teal"
            className="h-9 gap-1.5"
            disabled={saving || !isDirty}
            onClick={() => void save()}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="size-3.5" aria-hidden />
            )}
            Salvar
          </Button>
        </div>
      </header>

      {(feedback ?? error) ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
            error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
          )}
        >
          {error ? (
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          )}
          {error ?? feedback}
        </div>
      ) : null}

      <div className="rounded-2xl border border-primary-dark/10 bg-white/85 p-5 shadow-sm">
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          O <strong className="text-primary-dark">tipo</strong> agrupa os subtipos na árvore. Os
          textos de escopo ou investimento ficam em cada <strong className="text-primary-dark">subtipo</strong>{" "}
          — selecione um na lista à esquerda ou use o botão + ao lado do tipo.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary-dark">Nome do tipo</Label>
            <Input
              value={draft.label}
              onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
              disabled={saving}
              className="h-10 border-primary-dark/15 bg-white text-sm"
            />
          </div>

          {mode.kind === "scope" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Área de atuação</Label>
              <select
                value={draft.areaKey}
                onChange={(e) => setDraft((p) => ({ ...p, areaKey: e.target.value }))}
                disabled={saving}
                className="h-10 w-full max-w-sm rounded-xl border border-primary-dark/15 bg-white px-3 text-sm text-primary-dark shadow-sm"
              >
                {PROPOSTA_AREA_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs font-semibold text-primary-dark">Ordem</Label>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={saving}
              onClick={() => setDraft((p) => ({ ...p, sortOrder: Math.max(0, p.sortOrder - 10) }))}
              aria-label="Diminuir ordem"
            >
              <ArrowUp className="size-3" aria-hidden />
            </Button>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(e) => setDraft((p) => ({ ...p, sortOrder: Number(e.target.value) || 0 }))}
              disabled={saving}
              className="h-8 w-20 border-primary-dark/15 bg-white text-center text-sm tabular-nums"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-7 w-7"
              disabled={saving}
              onClick={() => setDraft((p) => ({ ...p, sortOrder: p.sortOrder + 10 }))}
              aria-label="Aumentar ordem"
            >
              <ArrowDown className="size-3" aria-hidden />
            </Button>
            <span className="text-[10px] text-muted-foreground">
              Tipos com ordem menor aparecem primeiro na árvore.
            </span>
          </div>

          <p className="rounded-xl border border-primary-dark/8 bg-slate-50/80 px-3 py-2 text-[11px] text-muted-foreground">
            Chave técnica:{" "}
            <code className="font-mono text-primary-dark/80">{mode.row.typeKey}</code>
          </p>
        </div>
      </div>
    </div>
  );
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return (
    a.label === b.label &&
    a.areaKey === b.areaKey &&
    a.sortOrder === b.sortOrder &&
    a.isActive === b.isActive
  );
}
