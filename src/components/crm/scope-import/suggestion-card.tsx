"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildExamplePlaceholders,
  EXAMPLE_NOME_EMPRESA,
} from "@/components/crm/scope-catalog/placeholder-examples";
import { TemplateTextareaField } from "@/components/crm/scope-catalog/template-textarea-field";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import {
  mergeEscopoTemplate,
  mergeInvestimentoTemplate,
} from "@/lib/crm/proposta-escopo-preview";
import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import type { ScopeImportSuggestion } from "./scope-import-shell";
import { cn } from "@/lib/utils";

type Props = {
  suggestion: ScopeImportSuggestion;
  catalog: ProposalCatalogAdminData;
  showBatchLabel?: boolean;
  onUpdated: () => void;
};

export function SuggestionCard({ suggestion, catalog, showBatchLabel = false, onUpdated }: Props) {
  const [draft, setDraft] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [targetMode, setTargetMode] = useState<"existing" | "new">("existing");
  const [targetTypeId, setTargetTypeId] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState(draft.type_label ?? "");

  const isScope = draft.kind === "escopo";
  const typeOptions = useMemo(() => {
    if (isScope) {
      return catalog.adminRows.scopeTypes.filter(
        (t) => !draft.area_key || t.areaKey === draft.area_key,
      );
    }
    return catalog.adminRows.investmentTypes;
  }, [catalog, draft.area_key, isScope]);

  const detected = useMemo(
    () => extractPlaceholderKeysFromText(draft.template ?? "", draft.conceito ?? ""),
    [draft.template, draft.conceito],
  );

  const preview = useMemo(() => {
    const examples = buildExamplePlaceholders(detected);
    if (isScope) {
      return mergeEscopoTemplate(draft.template ?? "", examples, {
        defaultNomeEmpresa: EXAMPLE_NOME_EMPRESA,
      });
    }
    return mergeInvestimentoTemplate(draft.template ?? "", examples, {
      defaultNomeEmpresa: EXAMPLE_NOME_EMPRESA,
    });
  }, [draft.template, detected, isScope]);

  async function saveDraft() {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/scope-import/suggestions/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template: draft.template,
          areaKey: draft.area_key,
          typeLabel: draft.type_label,
          subtypeLabel: draft.subtype_label,
          conceito: draft.conceito,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao salvar.");
      setFeedback("Alterações salvas.");
      onUpdated();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "aprovar" | "rejeitar") {
    setBusy(true);
    setFeedback(null);
    try {
      let body: Record<string, unknown>;
      if (action === "rejeitar") {
        body = { action: "rejeitar" };
      } else if (targetMode === "existing" && targetTypeId) {
        body = isScope
          ? { action: "aprovar", target: { scopeTypeId: targetTypeId } }
          : { action: "aprovar", target: { investmentTypeId: targetTypeId } };
      } else {
        body = {
          action: "aprovar",
          target: {
            newType: {
              label: newTypeLabel.trim() || draft.type_label,
              areaKey: isScope ? draft.area_key : undefined,
            },
          },
        };
      }

      const res = await fetch(`/api/admin/scope-import/suggestions/${encodeURIComponent(draft.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha na revisão.");
      setFeedback(action === "aprovar" ? "Aprovado e inserido no catálogo." : "Sugestão rejeitada.");
      onUpdated();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro na revisão.");
    } finally {
      setBusy(false);
    }
  }

  if (draft.status !== "pendente") {
    return (
      <div className="rounded-xl border border-primary-dark/10 bg-slate-50/80 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-semibold text-primary-dark">{draft.subtype_label}</span> — {draft.status}
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-primary-dark/10 bg-white/90 p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {isScope ? "Escopo" : "Investimento"}
            {draft.area_key ? ` · ${draft.area_key}` : ""}
            {showBatchLabel ? ` · lote ${draft.batch_id.slice(0, 8)}` : ""}
          </p>
          <h3 className="text-base font-bold text-primary-dark">{draft.subtype_label}</h3>
          <p className="text-xs text-muted-foreground">Tipo: {draft.type_label}</p>
        </div>
        {draft.confidence != null ? (
          <Badge variant="secondary">{Math.round(Number(draft.confidence) * 100)}% confiança</Badge>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {isScope ? (
            <div className="space-y-1">
              <Label className="text-xs">Área</Label>
              <Select
                value={draft.area_key ?? ""}
                onValueChange={(v) => v != null && setDraft((p) => ({ ...p, area_key: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione a área" />
                </SelectTrigger>
                <SelectContent>
                  {CRM_PRACTICE_AREAS.map((area) => (
                    <SelectItem key={area} value={area}>
                      {area}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs">Subtipo (label)</Label>
            <Input
              value={draft.subtype_label ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, subtype_label: e.target.value }))}
            />
          </div>

          {!isScope ? (
            <div className="space-y-1">
              <Label className="text-xs">Conceito</Label>
              <TemplateTextareaField
                kind="investment"
                value={draft.conceito ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, conceito: v }))}
                minHeightClass="min-h-[80px]"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs">Template</Label>
            <TemplateTextareaField
              kind={isScope ? "scope" : "investment"}
              value={draft.template ?? ""}
              onChange={(v) => setDraft((p) => ({ ...p, template: v }))}
              minHeightClass="min-h-[140px]"
            />
          </div>

          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveDraft()}>
            Salvar edições
          </Button>
        </div>

        <div className="space-y-3 rounded-xl bg-gradient-to-br from-[#f9f7f2] to-[#ede9dd] p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#24615b]/70">Preview</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-primary-dark">{preview}</p>
        </div>
      </div>

      {(draft.similar_existing ?? []).length ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold text-primary-dark">Semelhantes no catálogo</p>
          <div className="flex flex-wrap gap-2">
            {draft.similar_existing.map((item) => (
              <Badge key={item.id} variant="outline" className="text-[10px]">
                {item.label} ({Math.round(item.score * 100)}%)
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary-dark"
        onClick={() => setShowSources((v) => !v)}
      >
        <ChevronDown className={cn("size-4 transition", showSources && "rotate-180")} aria-hidden />
        Documentos de origem
      </button>
      {showSources ? (
        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
          {draft.sources.map((src) => (
            <li key={src.source.id} className="rounded-lg border border-primary-dark/10 bg-slate-50 p-2">
              <p className="font-semibold text-primary-dark">
                {src.document?.original_filename ?? "Documento"}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{src.extraction?.raw_excerpt ?? "—"}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-primary-dark/10 pt-4">
        <div className="space-y-1">
          <Label className="text-xs">Destino no catálogo</Label>
          <Select
            value={targetMode}
            onValueChange={(v) => v != null && setTargetMode(v as "existing" | "new")}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existing">Tipo existente</SelectItem>
              <SelectItem value="new">Novo tipo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {targetMode === "existing" ? (
          <Select value={targetTypeId} onValueChange={(v) => v != null && setTargetTypeId(v)}>
            <SelectTrigger className="h-9 min-w-[220px]">
              <SelectValue placeholder="Selecione o tipo" />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="h-9 min-w-[220px]"
            placeholder="Nome do novo tipo"
            value={newTypeLabel}
            onChange={(e) => setNewTypeLabel(e.target.value)}
          />
        )}

        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void decide("rejeitar")}>
            Rejeitar
          </Button>
          <Button type="button" variant="teal" disabled={busy} onClick={() => void decide("aprovar")}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Aprovar
          </Button>
        </div>
      </div>

      {feedback ? <p className="mt-2 text-sm font-semibold text-primary-dark">{feedback}</p> : null}
    </article>
  );
}
