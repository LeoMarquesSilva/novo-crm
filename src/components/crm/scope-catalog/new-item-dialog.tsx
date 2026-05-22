"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TemplateTextareaField } from "@/components/crm/scope-catalog/template-textarea-field";
import { PROPOSTA_AREA_OPTIONS } from "@/data/proposta-tipos-catalog";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { cn } from "@/lib/utils";

export type NewItemKind =
  | { type: "scope_type" }
  | { type: "scope_subtype"; scopeTypeId: string; parentLabel: string }
  | { type: "investment_type" }
  | { type: "investment_subtype"; investmentTypeId: string; parentLabel: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: NewItemKind;
  onCreated: (catalog: ProposalCatalogAdminData) => void;
};

export function NewItemDialog({ open, onOpenChange, kind, onCreated }: Props) {
  const [label, setLabel] = useState("");
  const [areaKey, setAreaKey] = useState<string>(PROPOSTA_AREA_OPTIONS[0] ?? "Cível");
  const [escopoTemplate, setEscopoTemplate] = useState("");
  const [conceito, setConceito] = useState("");
  const [template, setTemplate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setLabel("");
    setAreaKey(PROPOSTA_AREA_OPTIONS[0] ?? "Cível");
    setEscopoTemplate("");
    setConceito("");
    setTemplate("");
    setError(null);
  }, [open]);

  const title = titleForKind(kind);

  async function create() {
    if (!label.trim()) {
      setError("Informe um nome.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      switch (kind.type) {
        case "scope_type":
          body = { kind: "scope_type", areaKey, label: label.trim() };
          break;
        case "scope_subtype":
          body = {
            kind: "scope_subtype",
            scopeTypeId: kind.scopeTypeId,
            label: label.trim(),
            escopoTemplate,
          };
          break;
        case "investment_type":
          body = { kind: "investment_type", label: label.trim() };
          break;
        case "investment_subtype":
          body = {
            kind: "investment_subtype",
            investmentTypeId: kind.investmentTypeId,
            label: label.trim(),
            conceito,
            template,
          };
          break;
      }
      const res = await fetch("/api/admin/proposal-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ProposalCatalogAdminData;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao criar.");
      }
      onCreated(json.data);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[130] max-w-lg gap-0 p-0" overlayClassName="z-[120]">
        <header className="border-b border-primary-dark/10 px-5 py-4">
          <DialogTitle className="text-base font-extrabold text-primary-dark">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {descriptionForKind(kind)}
          </DialogDescription>
        </header>

        <div className="space-y-4 px-5 py-5">
          {/* Área (só scope_type) */}
          {kind.type === "scope_type" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">Área de atuação</Label>
              <select
                value={areaKey}
                onChange={(e) => setAreaKey(e.target.value)}
                disabled={saving}
                className="h-10 w-full rounded-xl border border-primary-dark/15 bg-white px-3 text-sm text-primary-dark shadow-sm"
              >
                {PROPOSTA_AREA_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Parent breadcrumb (subtipos) */}
          {kind.type === "scope_subtype" || kind.type === "investment_subtype" ? (
            <div className="rounded-xl border border-primary-dark/10 bg-slate-50 px-3 py-2 text-[11px]">
              <p className="font-bold uppercase tracking-[0.12em] text-muted-foreground">Será criado em</p>
              <p className="mt-0.5 font-semibold text-primary-dark">{kind.parentLabel}</p>
            </div>
          ) : null}

          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-primary-dark">Nome</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={saving}
              placeholder={placeholderForKind(kind)}
              className="h-10 border-primary-dark/15 bg-white text-sm"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground">
              A chave técnica será gerada automaticamente a partir do nome.
            </p>
          </div>

          {/* Conteúdo inicial (subtipos) */}
          {kind.type === "scope_subtype" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary-dark">
                Texto do escopo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <TemplateTextareaField
                kind="scope"
                value={escopoTemplate}
                onChange={setEscopoTemplate}
                disabled={saving}
                placeholder="Prestação de serviços advocatícios em favor de [NOME EMPRESA]..."
              />
              <p className="text-[10px] text-muted-foreground">
                Pode editar depois com preview ao vivo.
              </p>
            </div>
          ) : null}

          {kind.type === "investment_subtype" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary-dark">
                  Conceito <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  value={conceito}
                  onChange={(e) => setConceito(e.target.value)}
                  disabled={saving}
                  placeholder="Breve explicação do tipo de cobrança."
                  className="min-h-[60px] resize-y border-primary-dark/15 bg-white text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary-dark">
                  Texto do investimento <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <TemplateTextareaField
                  kind="investment"
                  value={template}
                  onChange={setTemplate}
                  disabled={saving}
                  placeholder="O investimento será de R$ [VALORMENSAL] mensais..."
                />
              </div>
            </>
          ) : null}

          {error ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-primary-dark/10 bg-slate-50/60 px-5 py-3">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="teal" disabled={saving} onClick={() => void create()}>
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-3.5" aria-hidden />
            )}
            Criar
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function titleForKind(kind: NewItemKind): string {
  switch (kind.type) {
    case "scope_type":
      return "Novo tipo de escopo";
    case "scope_subtype":
      return "Novo subtipo de escopo";
    case "investment_type":
      return "Novo tipo de investimento";
    case "investment_subtype":
      return "Novo subtipo de investimento";
  }
}

function descriptionForKind(kind: NewItemKind): string {
  switch (kind.type) {
    case "scope_type":
      return "Agrupa subtipos de escopo dentro de uma área de atuação (ex.: Cobrança, Recuperação).";
    case "scope_subtype":
      return "Variação específica dentro do tipo selecionado — cada subtipo tem seu próprio texto.";
    case "investment_type":
      return "Categoria de cobrança (ex.: Fixo Mensal, Êxito, Consultivo).";
    case "investment_subtype":
      return "Variação específica dentro do tipo de investimento — cada subtipo tem seu próprio texto.";
  }
}

function placeholderForKind(kind: NewItemKind): string {
  switch (kind.type) {
    case "scope_type":
      return "Ex.: Cobrança";
    case "scope_subtype":
      return "Ex.: Cobrança Extrajudicial";
    case "investment_type":
      return "Ex.: Êxito";
    case "investment_subtype":
      return "Ex.: Êxito 20% sobre valor recuperado";
  }
}

/**
 * Botão compacto que dispara a criação. Usado dentro da tree (next to type rows).
 */
export function NewItemButton({
  label,
  onClick,
  size = "sm",
}: {
  label: string;
  onClick: () => void;
  size?: "sm" | "icon";
}) {
  if (size === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        title={label}
        className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent-teal hover:text-white"
        aria-label={label}
      >
        <Plus className="size-3" aria-hidden />
      </button>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className={cn(
        "h-9 gap-1.5 border-accent-teal/35 bg-white text-accent-teal hover:bg-accent-teal hover:text-white",
      )}
    >
      <Plus className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
