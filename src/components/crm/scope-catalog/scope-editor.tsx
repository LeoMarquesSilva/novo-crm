"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  mergeEscopoTemplate,
  mergeInvestimentoTemplate,
} from "@/lib/crm/proposta-escopo-preview";
import {
  extractPlaceholderKeysFromText,
  mergePlaceholderKeys,
} from "@/data/proposta-tipos-catalog";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { CatalogDeleteButton } from "@/components/crm/scope-catalog/catalog-delete-button";
import {
  TemplateTextareaField,
} from "@/components/crm/scope-catalog/template-textarea-field";
import type { TemplatePlaceholderKind } from "@/components/crm/scope-catalog/template-placeholder-insert-bar";
import {
  buildExamplePlaceholders,
  EXAMPLE_NOME_EMPRESA,
} from "@/components/crm/scope-catalog/placeholder-examples";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { JustifiedDocumentText } from "@/components/crm/justified-document-text";
import { cn } from "@/lib/utils";

type ScopeSubtypeRow = ProposalCatalogAdminData["adminRows"]["scopeSubtypes"][number];
type InvestmentSubtypeRow = ProposalCatalogAdminData["adminRows"]["investmentSubtypes"][number];

export type SubtypeKind = "scope" | "investment";

type EditorMode =
  | { kind: "scope"; row: ScopeSubtypeRow; breadcrumb: string[] }
  | { kind: "investment"; row: InvestmentSubtypeRow; breadcrumb: string[] };

type Props = {
  mode: EditorMode;
  /** Notifica quando salvar com sucesso (com payload novo para o shell sincronizar). */
  onSaved: (catalog: ProposalCatalogAdminData) => void;
  onDeleted: (catalog: ProposalCatalogAdminData) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function ScopeEditor({ mode, onSaved, onDeleted, onDirtyChange }: Props) {
  // ── Estado: draft vs saved ───────────────────────────────────────────────────
  type Draft =
    | {
        kind: "scope";
        label: string;
        escopoTemplate: string;
        placeholderKeys: string[];
        sortOrder: number;
        isActive: boolean;
      }
    | {
        kind: "investment";
        label: string;
        conceito: string;
        template: string;
        placeholderKeys: string[];
        sortOrder: number;
        isActive: boolean;
      };

  const itemKey = `${mode.kind}:${mode.row.id}`;
  const [draft, setDraft] = useState<Draft>(() => draftFromMode(mode));
  const [saved, setSaved] = useState<Draft>(() => draftFromMode(mode));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset só ao trocar de item. `mode` é um objeto novo a cada render do pai
  // (onDirtyChange → setState), e resetar por identidade apagava o que o usuário digitava.
  useEffect(() => {
    const next = draftFromMode(mode);
    setDraft(next);
    setSaved(next);
    setFeedback(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intencional: só itemKey
  }, [itemKey]);

  const isDirty = useMemo(() => !draftsEqual(draft, saved), [draft, saved]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  // ── Placeholders: detectados vs declarados ──────────────────────────────────
  const detected = useMemo(() => {
    if (draft.kind === "scope") {
      return extractPlaceholderKeysFromText(draft.escopoTemplate);
    }
    return extractPlaceholderKeysFromText(draft.template);
  }, [draft]);

  const detectedSet = useMemo(() => new Set(detected), [detected]);
  const declaredSet = useMemo(() => new Set(draft.placeholderKeys), [draft.placeholderKeys]);

  const orphanDeclared = useMemo(
    () => draft.placeholderKeys.filter((k) => !detectedSet.has(k)),
    [draft.placeholderKeys, detectedSet],
  );
  const newDetected = useMemo(
    () => detected.filter((k) => !declaredSet.has(k)),
    [detected, declaredSet],
  );

  function syncDeclaredFromDetected() {
    setDraft((prev) => ({ ...prev, placeholderKeys: [...detected] }));
  }

  // ── Live preview ────────────────────────────────────────────────────────────
  const livePreview = useMemo(() => {
    const examples = buildExamplePlaceholders(detected);
    if (draft.kind === "scope") {
      return {
        escopo: mergeEscopoTemplate(draft.escopoTemplate, examples, {
          defaultNomeEmpresa: EXAMPLE_NOME_EMPRESA,
        }),
      };
    }
    return {
      conceito: draft.conceito,
      template: mergeInvestimentoTemplate(draft.template, examples, {
        defaultNomeEmpresa: EXAMPLE_NOME_EMPRESA,
      }),
    };
  }, [draft, detected]);

  // ── Salvar ──────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      const placeholderKeys = mergePlaceholderKeys(
        draft.placeholderKeys,
        draft.kind === "scope" ? draft.escopoTemplate : draft.template,
      );
      const body =
        draft.kind === "scope"
          ? {
              kind: "scope_subtype" as const,
              id: mode.kind === "scope" ? mode.row.id : "",
              label: draft.label,
              escopoTemplate: draft.escopoTemplate,
              placeholderKeys,
              sortOrder: draft.sortOrder,
              isActive: draft.isActive,
            }
          : {
              kind: "investment_subtype" as const,
              id: mode.kind === "investment" ? mode.row.id : "",
              label: draft.label,
              conceito: draft.conceito,
              template: draft.template,
              placeholderKeys,
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  // Ícone da área (L1 do breadcrumb)
  const areaName = mode.breadcrumb[0] ?? "";
  const AreaIcon = getAreaLucideIcon(areaName);

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4">
      {/* Header com breadcrumb + ações */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-v2-xl) border border-neutral-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Ícone da área */}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-lg) bg-neutral-100 text-foreground">
            <AreaIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {mode.breadcrumb.slice(0, -1).join(" › ")}
            </p>
            <h2 className="truncate text-base font-extrabold text-foreground">{draft.label}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CatalogDeleteButton
            kind={mode.kind === "scope" ? "scope_subtype" : "investment_subtype"}
            id={mode.row.id}
            itemLabel={draft.label}
            onDeleted={onDeleted}
            disabled={saving}
          />

          {/* Toggle ativo/inativo */}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-(--radius-v2-full) border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-neutral-50">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))}
              className="size-3"
            />
            {draft.isActive ? (
              <span className="text-success-text">Ativo</span>
            ) : (
              <span className="text-muted-foreground">Inativo</span>
            )}
          </label>

          {isDirty ? (
            <span className="inline-flex items-center gap-1 rounded-(--radius-v2-full) bg-warning-bg px-2.5 py-1 text-[10px] font-bold text-warning-text">
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

      {/* Feedback */}
      {(feedback ?? error) ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-(--radius-v2-md) px-3 py-2 text-sm font-semibold",
            error ? "bg-danger-bg text-danger-text" : "bg-success-bg text-success-text",
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

      {/* Split: editor + preview */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* Editor */}
        <div className="crm-scrollbar min-h-0 overflow-y-auto rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
          {/* Cabeçalho do painel */}
          <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-2.5">
            <Pencil className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Editor
            </span>
          </div>
          <div className="space-y-4 p-4">
            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Nome (label)</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                disabled={saving}
                className="h-10 text-sm"
              />
            </div>

            {draft.kind === "scope" ? (
              <>
                <FieldTextarea
                  label="Texto do escopo"
                  hint="Posicione o cursor e use os botões de variável, ou digite [CHAVE]. Honorários na aba Investimentos. Preview à direita."
                  value={draft.escopoTemplate}
                  onChange={(v) => setDraft((p) => ({ ...(p as Extract<Draft, { kind: "scope" }>), escopoTemplate: v }))}
                  disabled={saving}
                  placeholderKind="scope"
                />
              </>
            ) : (
              <>
                <FieldTextarea
                  label="Conceito (descrição interna)"
                  hint="Texto explicativo do tipo de cobrança. Aparece como ajuda no formulário."
                  value={draft.conceito}
                  onChange={(v) =>
                    setDraft((p) => ({ ...(p as Extract<Draft, { kind: "investment" }>), conceito: v }))
                  }
                  disabled={saving}
                />
                <FieldTextarea
                  label="Texto do investimento (template)"
                  hint="Posicione o cursor e insira variáveis. Valores monetários ganham extenso automático."
                  value={draft.template}
                  onChange={(v) =>
                    setDraft((p) => ({ ...(p as Extract<Draft, { kind: "investment" }>), template: v }))
                  }
                  disabled={saving}
                  placeholderKind="investment"
                />
              </>
            )}

            {/* Placeholders */}
            <PlaceholdersSection
              detected={detected}
              declared={draft.placeholderKeys}
              orphanDeclared={orphanDeclared}
              newDetected={newDetected}
              onSync={syncDeclaredFromDetected}
              onChange={(keys) => setDraft((p) => ({ ...p, placeholderKeys: keys }))}
            />

            {/* Ordem */}
            <div className="flex items-center gap-2">
              <Label className="text-xs font-semibold text-foreground">Ordem</Label>
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
                className="h-8 w-20 text-center text-sm tabular-nums"
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
                Itens com ordem menor aparecem primeiro.
              </span>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="crm-scrollbar min-h-0 overflow-y-auto rounded-(--radius-v2-xl) border border-neutral-200 bg-neutral-50">
          {/* Cabeçalho do painel */}
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Eye className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Preview
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-(--radius-v2-full) bg-success-text" aria-hidden />
              <span className="text-[9px] text-muted-foreground">ao vivo</span>
            </div>
          </div>
          <div className="p-4">
            {draft.kind === "scope" ? (
              <ScopePreview escopo={(livePreview as { escopo: string }).escopo} />
            ) : (
              <InvestmentPreview
                conceito={(livePreview as { conceito: string; template: string }).conceito}
                template={(livePreview as { conceito: string; template: string }).template}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function FieldTextarea({
  label,
  hint,
  value,
  onChange,
  disabled,
  legacy,
  placeholderKind,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  legacy?: boolean;
  placeholderKind?: TemplatePlaceholderKind;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-foreground">{label}</Label>
        {legacy ? (
          <span className="shrink-0 rounded-(--radius-v2-full) bg-warning-bg px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning-text">
            Legado
          </span>
        ) : null}
      </div>
      {placeholderKind ? (
        <TemplateTextareaField
          kind={placeholderKind}
          value={value}
          onChange={onChange}
          disabled={disabled}
          minHeightClass="min-h-[120px]"
          className={cn(
            "text-[12.5px]",
            legacy && "bg-warning-bg/40",
          )}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "min-h-[120px] resize-y font-mono text-[12.5px] leading-relaxed",
            legacy && "bg-warning-bg/40",
          )}
        />
      )}
      {hint ? <p className="text-[10px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PlaceholdersSection({
  detected,
  declared,
  orphanDeclared,
  newDetected,
  onSync,
  onChange,
}: {
  detected: string[];
  declared: string[];
  orphanDeclared: string[];
  newDetected: string[];
  onSync: () => void;
  onChange: (keys: string[]) => void;
}) {
  const needsSync = orphanDeclared.length > 0 || newDetected.length > 0;
  function removeDeclared(key: string) {
    onChange(declared.filter((k) => k !== key));
  }
  return (
    <div className="space-y-2 rounded-(--radius-v2-md) border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-foreground">Placeholders</Label>
        {needsSync ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-interactive-300 px-2.5 text-[11px] font-semibold text-interactive-700 hover:bg-interactive-600 hover:text-white"
            onClick={onSync}
          >
            <Sparkles className="size-3" aria-hidden />
            Sincronizar com o texto
          </Button>
        ) : null}
      </div>
      {/* Lista combinada: detectados + declarados */}
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...detected, ...declared])].map((key) => {
          const isDetected = detected.includes(key);
          const isDeclared = declared.includes(key);
          let cls = "";
          let icon: React.ReactNode = null;
          let title = "";
          if (isDetected && isDeclared) {
            cls = "border-success-border bg-success-bg text-success-text";
            icon = <CheckCircle2 className="size-2.5" aria-hidden />;
            title = "Declarado e usado no texto";
          } else if (isDetected) {
            cls = "border-warning-border bg-warning-bg text-warning-text";
            icon = <Sparkles className="size-2.5" aria-hidden />;
            title = "Detectado no texto, mas não declarado";
          } else {
            cls = "border-danger-border bg-danger-bg text-danger-text line-through";
            icon = <AlertTriangle className="size-2.5" aria-hidden />;
            title = "Declarado mas não aparece no texto — pode remover";
          }
          return (
            <span
              key={key}
              title={title}
              className={cn(
                "inline-flex items-center gap-1 rounded-(--radius-v2-full) border px-2 py-0.5 text-[10px] font-bold",
                cls,
              )}
            >
              {icon}
              {key}
              {!isDetected ? (
                <button
                  type="button"
                  onClick={() => removeDeclared(key)}
                  className="ml-0.5 rounded-(--radius-v2-full) px-1 text-danger-text hover:bg-danger-bg"
                  aria-label={`Remover ${key}`}
                >
                  ×
                </button>
              ) : null}
            </span>
          );
        })}
        {detected.length === 0 && declared.length === 0 ? (
          <span className="text-[10px] text-muted-foreground">
            Nenhum placeholder ainda. Use a sintaxe <code>[CHAVE]</code> no texto.
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <Legend color="bg-success-text" label="Usado e declarado" />
        <Legend color="bg-warning-text" label="Detectado mas não declarado" />
        <Legend color="bg-danger-text" label="Declarado mas não usado" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-(--radius-v2-full)", color)} aria-hidden />
      {label}
    </span>
  );
}

function PreviewSection({
  label,
  labelColor,
  children,
}: {
  label: string;
  labelColor?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p
        className={cn(
          "mb-2 text-[9px] font-black uppercase tracking-[0.2em]",
          labelColor ?? "text-muted-foreground",
        )}
      >
        {label}
      </p>
      {children}
    </section>
  );
}

function ScopePreview({ escopo }: { escopo: string }) {
  return (
    <div className="space-y-4 rounded-(--radius-v2-lg) border border-neutral-200 bg-white p-4 text-[13px] leading-[1.65] text-foreground">
      <PreviewSection label="Texto do escopo">
        {escopo.trim() ? (
          <JustifiedDocumentText text={escopo} />
        ) : (
          <p className="italic text-muted-foreground">Nenhum texto definido ainda.</p>
        )}
      </PreviewSection>
    </div>
  );
}

function InvestmentPreview({ conceito, template }: { conceito: string; template: string }) {
  return (
    <div className="space-y-4 rounded-(--radius-v2-lg) border border-neutral-200 bg-white p-4 text-[13px] leading-[1.65] text-foreground">
      {conceito.trim() ? (
        <PreviewSection label="Conceito">
          <JustifiedDocumentText
            text={conceito}
            paragraphClassName="italic text-muted-foreground"
          />
        </PreviewSection>
      ) : null}
      <div className={cn(conceito.trim() ? "border-t border-neutral-200 pt-4" : "")}>
        <PreviewSection label="Texto renderizado">
          {template.trim() ? (
            <JustifiedDocumentText text={template} />
          ) : (
            <p className="italic text-muted-foreground">Nenhum texto definido ainda.</p>
          )}
        </PreviewSection>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function draftFromMode(mode: EditorMode): AnyDraft {
  return mode.kind === "scope" ? draftFromScope(mode.row) : draftFromInvestment(mode.row);
}

function draftFromScope(row: ScopeSubtypeRow): Extract<
  Parameters<typeof draftsEqual>[0],
  { kind: "scope" }
> {
  return {
    kind: "scope",
    label: row.label,
    escopoTemplate: row.escopoTemplate,
    placeholderKeys: [...row.placeholderKeys],
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

function draftFromInvestment(row: InvestmentSubtypeRow): Extract<
  Parameters<typeof draftsEqual>[0],
  { kind: "investment" }
> {
  return {
    kind: "investment",
    label: row.label,
    conceito: row.conceito,
    template: row.template,
    placeholderKeys: [...row.placeholderKeys],
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

type AnyDraft =
  | {
      kind: "scope";
      label: string;
      escopoTemplate: string;
      placeholderKeys: string[];
      sortOrder: number;
      isActive: boolean;
    }
  | {
      kind: "investment";
      label: string;
      conceito: string;
      template: string;
      placeholderKeys: string[];
      sortOrder: number;
      isActive: boolean;
    };

function draftsEqual(a: AnyDraft, b: AnyDraft): boolean {
  if (a.kind !== b.kind) return false;
  if (a.label !== b.label || a.sortOrder !== b.sortOrder || a.isActive !== b.isActive) return false;
  if (a.placeholderKeys.length !== b.placeholderKeys.length) return false;
  for (let i = 0; i < a.placeholderKeys.length; i++) {
    if (a.placeholderKeys[i] !== b.placeholderKeys[i]) return false;
  }
  if (a.kind === "scope" && b.kind === "scope") {
    return a.escopoTemplate === b.escopoTemplate;
  }
  if (a.kind === "investment" && b.kind === "investment") {
    return a.conceito === b.conceito && a.template === b.template;
  }
  return false;
}
