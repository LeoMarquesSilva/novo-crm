"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";
import { getAreaLucideIcon } from "@/lib/crm/area-lucide-icon";
import { CatalogDeleteButton } from "@/components/crm/scope-catalog/catalog-delete-button";
import {
  TemplateTextareaField,
} from "@/components/crm/scope-catalog/template-textarea-field";
import type { TemplatePlaceholderKind } from "@/components/crm/scope-catalog/template-placeholder-insert-bar";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
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
};

const EXAMPLE_NOME_EMPRESA = "ACME Logística Ltda.";

/** Placeholders de exemplo para o preview ao vivo. Cobre os mais comuns. */
const EXAMPLE_PLACEHOLDER_VALUES: Record<string, string> = {
  "NOME EMPRESA": EXAMPLE_NOME_EMPRESA,
  EMPRESA: EXAMPLE_NOME_EMPRESA,
  CNPJ: "12.345.678/0001-90",
  DOCUMENTO: "12.345.678/0001-90",
  CIDADE: "Campinas",
  UF: "SP",
  CEP: "13025-002",
  NUMERO: "nº 1.266",
  "TIPO DA AÇÃO": "AÇÃO DE COBRANÇA",
  PARTE_CONTRÁRIA: "DEVEDOR EXEMPLO LTDA",
  VALOR_CAUSA: "R$ 150.000,00",
  RESUMO_DO_PROCESSO:
    "Trata-se de demanda monitória decorrente de inadimplemento contratual referente à prestação de serviços logísticos durante 2024.",
  NUMERO_PROCESSO: "1000123-45.2024.8.26.0100",
  VALORMENSAL: "8500",
  VALORHORA: "450",
  VALORMENSALBASE: "5000",
  VALORMENSALVARIAVEL: "3500",
  VALORMENSALESCALONADO: "12000",
  VALORMENSALESTIMADO: "10000",
  VALORSPOT: "25000",
  VALORPARCELA: "2500",
  VALORMANUTENCAO: "1500",
  VALOREXITO: "20",
  QTD_PROCESSOS: "30",
  HORAS_MES: "20",
};

function exampleFor(key: string): string {
  return EXAMPLE_PLACEHOLDER_VALUES[key] ?? `[exemplo: ${key.toLowerCase().replace(/_/g, " ")}]`;
}

function buildExamplePlaceholders(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = exampleFor(k);
  return out;
}

export function ScopeEditor({ mode, onSaved, onDeleted }: Props) {
  const router = useRouter();

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

  const initialDraft = useMemo<Draft>(
    () => (mode.kind === "scope" ? draftFromScope(mode.row) : draftFromInvestment(mode.row)),
    [mode],
  );
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [saved, setSaved] = useState<Draft>(initialDraft);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset quando trocar de subtipo
  useEffect(() => {
    setDraft(initialDraft);
    setSaved(initialDraft);
    setFeedback(null);
    setError(null);
  }, [initialDraft]);

  const isDirty = useMemo(() => !draftsEqual(draft, saved), [draft, saved]);

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
      const body =
        draft.kind === "scope"
          ? {
              kind: "scope_subtype" as const,
              id: mode.kind === "scope" ? mode.row.id : "",
              label: draft.label,
              escopoTemplate: draft.escopoTemplate,
              placeholderKeys: draft.placeholderKeys,
              sortOrder: draft.sortOrder,
              isActive: draft.isActive,
            }
          : {
              kind: "investment_subtype" as const,
              id: mode.kind === "investment" ? mode.row.id : "",
              label: draft.label,
              conceito: draft.conceito,
              template: draft.template,
              placeholderKeys: draft.placeholderKeys,
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

  // ── Render ──────────────────────────────────────────────────────────────────
  // Ícone da área (L1 do breadcrumb)
  const areaName = mode.breadcrumb[0] ?? "";
  const AreaIcon = getAreaLucideIcon(areaName);

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-4">
      {/* Header com breadcrumb + ações */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-dark/10 bg-white/85 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          {/* Ícone da área */}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-dark/8 text-primary-dark">
            <AreaIcon className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {mode.breadcrumb.slice(0, -1).join(" › ")}
            </p>
            <h2 className="truncate text-base font-extrabold text-primary-dark">{draft.label}</h2>
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

      {/* Feedback */}
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

      {/* Split: editor + preview */}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2">
        {/* Editor */}
        <div className="crm-scrollbar min-h-0 overflow-y-auto rounded-2xl border border-primary-dark/10 bg-white/85 shadow-sm">
          {/* Cabeçalho do painel */}
          <div className="flex items-center gap-2 border-b border-primary-dark/8 px-4 py-2.5">
            <Pencil className="size-3.5 shrink-0 text-primary-dark/50" aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark/50">
              Editor
            </span>
          </div>
          <div className="space-y-4 p-4">
            {/* Label */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Nome (label)</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))}
                disabled={saving}
                className="h-10 border-primary-dark/15 bg-white text-sm"
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
                Itens com ordem menor aparecem primeiro.
              </span>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="crm-scrollbar min-h-0 overflow-y-auto rounded-2xl border border-primary-dark/10 bg-gradient-to-br from-[#f9f7f2] to-[#ede9dd] shadow-inner">
          {/* Cabeçalho do painel */}
          <div className="flex items-center justify-between gap-2 border-b border-[#24615b]/15 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Eye className="size-3.5 shrink-0 text-[#24615b]/60" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#24615b]/70">
                Preview
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              <span className="text-[9px] text-[#24615b]/50">ao vivo</span>
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
        <Label className="text-xs font-semibold text-primary-dark">{label}</Label>
        {legacy ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
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
            legacy && "bg-amber-50/40",
          )}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={cn(
            "min-h-[120px] resize-y border-primary-dark/15 bg-white font-mono text-[12.5px] leading-relaxed",
            legacy && "bg-amber-50/40",
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
    <div className="space-y-2 rounded-xl border border-primary-dark/10 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-xs font-semibold text-primary-dark">Placeholders</Label>
        {needsSync ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-accent-teal/40 px-2.5 text-[11px] font-semibold text-accent-teal hover:bg-accent-teal hover:text-white"
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
            cls = "border-emerald-300 bg-emerald-50 text-emerald-800";
            icon = <CheckCircle2 className="size-2.5" aria-hidden />;
            title = "Declarado e usado no texto";
          } else if (isDetected) {
            cls = "border-amber-300 bg-amber-50 text-amber-800";
            icon = <Sparkles className="size-2.5" aria-hidden />;
            title = "Detectado no texto, mas não declarado";
          } else {
            cls = "border-rose-200 bg-rose-50 text-rose-700 line-through";
            icon = <AlertTriangle className="size-2.5" aria-hidden />;
            title = "Declarado mas não aparece no texto — pode remover";
          }
          return (
            <span
              key={key}
              title={title}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                cls,
              )}
            >
              {icon}
              {key}
              {!isDetected ? (
                <button
                  type="button"
                  onClick={() => removeDeclared(key)}
                  className="ml-0.5 rounded-full px-1 text-rose-600 hover:bg-rose-200"
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
        <Legend color="bg-emerald-500" label="Usado e declarado" />
        <Legend color="bg-amber-500" label="Detectado mas não declarado" />
        <Legend color="bg-rose-500" label="Declarado mas não usado" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-full", color)} aria-hidden />
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
          labelColor ?? "text-[#24615b]/60",
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
    <div className="space-y-4 rounded-xl bg-white/92 p-4 text-[13px] leading-[1.65] text-primary-dark shadow-sm ring-1 ring-primary-dark/8">
      <PreviewSection label="Texto do escopo">
        {escopo.trim() ? (
          <p className="whitespace-pre-wrap">{escopo}</p>
        ) : (
          <p className="italic text-slate-400">Nenhum texto definido ainda.</p>
        )}
      </PreviewSection>
    </div>
  );
}

function InvestmentPreview({ conceito, template }: { conceito: string; template: string }) {
  return (
    <div className="space-y-4 rounded-xl bg-white/92 p-4 text-[13px] leading-[1.65] text-primary-dark shadow-sm ring-1 ring-primary-dark/8">
      {conceito.trim() ? (
        <PreviewSection label="Conceito">
          <p className="whitespace-pre-wrap italic text-slate-600">{conceito}</p>
        </PreviewSection>
      ) : null}
      <div className={cn(conceito.trim() ? "border-t border-primary-dark/8 pt-4" : "")}>
        <PreviewSection label="Texto renderizado">
          {template.trim() ? (
            <p className="whitespace-pre-wrap">{template}</p>
          ) : (
            <p className="italic text-slate-400">Nenhum texto definido ainda.</p>
          )}
        </PreviewSection>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
