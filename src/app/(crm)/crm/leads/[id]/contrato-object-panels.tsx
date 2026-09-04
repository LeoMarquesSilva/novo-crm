"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  ClipboardCheck,
  FileEdit,
  Handshake,
  PenLine,
  TriangleAlert,
} from "lucide-react";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { maskNumeroProcessoCNJ } from "@/lib/crm/proposta-escopo-preview";
import { cn } from "@/lib/utils";
import type {
  CanonicalContractBuildResult,
  ContractObjectFieldValue,
  ContractObjectOverride,
  ContractScope,
  ContractScopeAdjustment,
} from "@/lib/crm/contract-engine/types";

export function groupScopesByArea(scopes: ContractScope[]): Array<{ area: string; items: ContractScope[] }> {
  const map = new Map<string, ContractScope[]>();
  for (const scope of scopes) {
    const list = map.get(scope.areaLabel) ?? [];
    list.push(scope);
    map.set(scope.areaLabel, list);
  }
  return [...map.entries()].map(([area, items]) => ({ area, items }));
}

export function EscoposContratadosSection({
  num,
  scopes,
  proposalAligned,
  disabled,
  onRequestChange,
}: {
  num: number;
  scopes: ContractScope[];
  proposalAligned: boolean;
  disabled?: boolean;
  onRequestChange: () => void;
}) {
  const groups = groupScopesByArea(scopes);
  const complete = scopes.length > 0 && scopes.every((s) => !s.missingProfile);
  return (
    <div className="space-y-3">
      <SectionHeading num={num} title="Escopos Contratados" complete={complete} />
      <div className="ml-10 space-y-3">
        <p className="text-xs text-muted-foreground">Herdado da proposta ✓</p>
        {groups.length === 0 ? (
          <p className="text-xs text-amber-700">Nenhum escopo herdado da proposta.</p>
        ) : (
          groups.map((group) => (
            <div key={group.area} className="rounded-xl border border-teal-200/60 bg-teal-50/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent-teal/80">
                {group.area}
              </p>
              <ul className="mt-2 space-y-1.5">
                {group.items.map((scope) => (
                  <li key={scope.entryId} className="flex items-start gap-2 text-sm">
                    {scope.missingProfile ? (
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                    ) : (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden />
                    )}
                    <span className={scope.missingProfile ? "text-amber-800" : "text-primary-dark"}>
                      {scope.label}
                      {scope.missingProfile ? (
                        <span className="ml-2 text-[11px] font-semibold">Sem perfil contratual</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {!proposalAligned ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Contrato diverge da proposta
          </p>
        ) : (
          <p className="text-xs font-medium text-emerald-700">Proposta e contrato alinhados ✓</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={disabled}
          onClick={onRequestChange}
        >
          Alterar escopos do contrato
        </Button>
      </div>
    </div>
  );
}

export function ObjetoContratoSection({
  num,
  build,
  disabled,
  onFieldChange,
  onOverride,
}: {
  num: number;
  build: CanonicalContractBuildResult | null;
  disabled?: boolean;
  onFieldChange: (key: string, value: string) => void;
  onOverride: (blockStableKey: string, content: string, reason: string) => void;
}) {
  const object = build?.data.contractObject;
  const scopes = build?.data.scopes ?? [];
  const covered = object
    ? Math.max(0, scopes.length - object.missingScopeIds.length)
    : 0;
  const complete = Boolean(
    object && object.status !== "incomplete" && object.status !== "missing_profile" && object.missingScopeIds.length === 0,
  );
  const missingCount = object?.fieldValues.filter((f) => f.required && !f.value.trim()).length ?? 0;
  const scopeLabelByEntryId = new Map(
    scopes.map((s) => [s.entryId, `${s.areaLabel} — ${s.label}`]),
  );

  return (
    <div className="space-y-3">
      <SectionHeading num={num} title="Objeto do Contrato" complete={complete} />
      <div className="ml-10 space-y-4">
        {!object ? (
          <p className="text-xs text-muted-foreground">O objeto será resolvido a partir da proposta.</p>
        ) : (
          <>
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold",
                complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              {complete
                ? `✓ ${covered} de ${scopes.length} escopos representados`
                : `⚠ ${covered} de ${scopes.length} escopos representados`}
            </div>

            {object.missingScopeIds.length > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold">Sem perfil</p>
                <ul className="mt-1 space-y-1">
                  {object.missingScopeIds.map((id) => {
                    const scope = scopes.find((s) => s.entryId === id);
                    return (
                      <li key={id}>
                        {scope ? `${scope.areaLabel} > ${scope.label}` : id}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {object.fieldValues.length > 0 ? (
              <div className="space-y-2.5">
                {missingCount > 0 ? (
                  <p className="text-xs font-bold text-amber-800">
                    ⚠ Faltam {missingCount} {missingCount === 1 ? "informação" : "informações"} para gerar o
                    Objeto
                  </p>
                ) : null}
                {/* Agrupado por escopo (mesmo padrão de Cláusulas Adicionais), recolhível.
                    A chave de agrupamento (scopeEntryId) é estável — não muda ao digitar em
                    nenhum campo — então o grupo/posição de cada input nunca muda entre
                    renders; só o estilo do card individual muda (âmbar → neutro). Isso
                    preserva a correção do bug de foco: reagrupar por um valor que MUDA ao
                    digitar (ex.: preenchido/faltando) reintroduziria o mesmo problema. */}
                {groupObjectFieldsByScope(object.fieldValues, scopeLabelByEntryId).map((group) => (
                  <ObjectFieldGroupBlock
                    key={group.scopeLabel}
                    group={group}
                    disabled={disabled}
                    onChange={onFieldChange}
                  />
                ))}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Redação
              </p>
              <div className="mt-3 space-y-3">
                {object.numberedLines.map((line) => (
                  <ObjectBlockPreview
                    key={`${line.stableKey}-${line.number}`}
                    line={line}
                    override={object.overrides.find((o) => o.blockStableKey === line.stableKey)}
                    disabled={disabled}
                    onOverride={onOverride}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Agrupamento dos campos do Objeto por escopo ─────────────────────────────

type ObjectFieldGroup = {
  scopeLabel: string;
  fields: ContractObjectFieldValue[];
  missingCount: number;
};

function groupObjectFieldsByScope(
  fieldValues: ContractObjectFieldValue[],
  scopeLabelByEntryId: Map<string, string>,
): ObjectFieldGroup[] {
  const bySccope = new Map<string, ContractObjectFieldValue[]>();
  const order: string[] = [];
  for (const field of fieldValues) {
    const label = (field.scopeEntryId && scopeLabelByEntryId.get(field.scopeEntryId)) || "Geral";
    if (!bySccope.has(label)) {
      bySccope.set(label, []);
      order.push(label);
    }
    bySccope.get(label)!.push(field);
  }
  return order.map((scopeLabel) => {
    const fields = bySccope.get(scopeLabel)!;
    return {
      scopeLabel,
      fields,
      missingCount: fields.filter((f) => f.required && !f.value.trim()).length,
    };
  });
}

/** Bloco recolhível dos campos de um escopo (ex.: "Cível — Contencioso Cível
 * (+1 processo)") — mesmo padrão visual de `ClauseGroupBlock` no builder. */
function ObjectFieldGroupBlock({
  group,
  disabled,
  onChange,
}: {
  group: ObjectFieldGroup;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(group.missingCount > 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-slate-400 transition-transform duration-150", open && "rotate-90")}
          aria-hidden
        />
        <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
          {group.scopeLabel}
        </span>
        {group.missingCount > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            {group.missingCount} pendente{group.missingCount > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            Completo
          </span>
        )}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-200 px-3 pb-3 pt-2.5">
          {group.fields.map((field) => (
            <ObjectFieldInput
              key={`${field.scopeEntryId ?? "g"}:${field.key}`}
              field={field}
              disabled={disabled}
              onChange={onChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ObjectFieldInput({
  field,
  disabled,
  onChange,
}: {
  field: ContractObjectFieldValue;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}) {
  const isProcesso = field.key === "numero_processo" || field.key === "numero_processo_civel";
  const value = isProcesso ? maskNumeroProcessoCNJ(field.value) : field.value;
  const isMissing = field.required && !field.value.trim();
  const inputId = `object-field-${field.scopeEntryId ?? "g"}-${field.key}`;
  return (
    <div
      className={cn(
        "space-y-1 rounded-lg border p-2 transition-colors duration-200",
        isMissing ? "border-amber-200 bg-amber-50/40" : "border-transparent bg-transparent",
      )}
    >
      <Label htmlFor={inputId} className="text-xs font-semibold text-primary-dark">
        {field.label}
        {field.required ? <span className="text-rose-500"> *</span> : ""}
      </Label>
      <Input
        id={inputId}
        value={value}
        disabled={disabled}
        onChange={(e) =>
          onChange(field.key, isProcesso ? maskNumeroProcessoCNJ(e.target.value) : e.target.value)
        }
        placeholder={
          isProcesso
            ? "0000000-00.0000.0.00.0000"
            : field.required
              ? "Campo necessário para gerar o Objeto do Contrato."
              : ""
        }
        inputMode={isProcesso ? "numeric" : "text"}
        autoComplete="off"
        className={cn(
          "h-9 bg-white text-sm",
          isMissing ? "border-amber-300" : "border-slate-200",
        )}
      />
      <SourceBadge source={field.source} filled={Boolean(field.value.trim())} />
    </div>
  );
}

const SOURCE_BADGE_CFG: Record<
  ContractObjectFieldValue["source"],
  { label: string; icon: typeof Check; className: string }
> = {
  proposal:   { label: "Proposta",   icon: Handshake,     className: "bg-teal-50 text-teal-700 border-teal-200" },
  intake:     { label: "Cadastro",   icon: ClipboardCheck, className: "bg-sky-50 text-sky-700 border-sky-200" },
  opportunity:{ label: "Oportunidade", icon: ClipboardCheck, className: "bg-sky-50 text-sky-700 border-sky-200" },
  company:    { label: "Empresa",    icon: ClipboardCheck, className: "bg-sky-50 text-sky-700 border-sky-200" },
  process:    { label: "Processo",   icon: ClipboardCheck, className: "bg-sky-50 text-sky-700 border-sky-200" },
  manual:     { label: "Preenchido neste contrato", icon: FileEdit, className: "bg-amber-50 text-amber-700 border-amber-200" },
  unresolved: { label: "Pendente",   icon: TriangleAlert, className: "bg-slate-100 text-slate-500 border-slate-200" },
};

function SourceBadge({
  source,
  filled,
}: {
  source: ContractObjectFieldValue["source"];
  filled: boolean;
}) {
  const cfg = SOURCE_BADGE_CFG[source] ?? SOURCE_BADGE_CFG.unresolved;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        cfg.className,
      )}
    >
      <Icon className="size-2.5 shrink-0" aria-hidden />
      {cfg.label}
      {source !== "unresolved" && filled ? (
        <Check className="size-2.5 shrink-0" aria-hidden />
      ) : null}
    </span>
  );
}

function ObjectBlockPreview({
  line,
  override,
  disabled,
  onOverride,
}: {
  line: {
    number: string;
    title?: string;
    content: string;
    stableKey: string;
    sourceLabel: string;
    version: number;
  };
  override?: ContractObjectOverride;
  disabled?: boolean;
  onOverride: (blockStableKey: string, content: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(line.content);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-lg border border-white bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-bold text-primary-dark">
          {line.number}.{line.title ? ` ${line.title}.` : ""}
        </p>
        {override ? (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Ajustado
          </span>
        ) : null}
        {/* O texto completo já aparece ao vivo no preview do contrato (painel direito) —
            aqui fica escondido por padrão pra não duplicar; abre só quem quer conferir
            antes de decidir se vale ajustar. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-[11px] font-semibold text-accent-teal hover:underline"
        >
          {expanded ? "Ocultar texto" : "Ver texto"}
        </button>
      </div>
      {expanded ? (
        <>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-primary-dark/90">{line.content}</p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Origem: perfil contratual · {line.sourceLabel} · v{line.version}
          </p>
        </>
      ) : null}
      {override ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          <p className="font-semibold">Override específico deste contrato</p>
          <CrmUserLabel name={override.changedByName || override.changedBy} size="xs" prefix="Alterado por" />
        </div>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 h-7 gap-1 px-2 text-[11px]"
        disabled={disabled}
        onClick={() => {
          setText(line.content);
          setReason("");
          setOpen(true);
        }}
      >
        <PenLine className="size-3" aria-hidden />
        Ajustar redação
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle>Ajustar redação do objeto</AlertDialogTitle>
            <AlertDialogDescription>
              A alteração vale só para este contrato. O catálogo jurídico permanece intacto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} />
            <div className="space-y-1">
              <Label className="text-xs">Motivo da alteração</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reason.trim() || text.trim() === line.content}
              onClick={() => onOverride(line.stableKey, text.trim(), reason.trim())}
            >
              Confirmar ajuste
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function AlterarEscoposDialog({
  open,
  onOpenChange,
  scopes,
  current,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scopes: ContractScope[];
  current: ContractScopeAdjustment | null;
  onConfirm: (adjustment: ContractScopeAdjustment) => void;
}) {
  const alreadyRemoved = new Set(current?.removedEntryIds ?? []);
  const [removed, setRemoved] = useState<string[]>([...alreadyRemoved]);
  const [reason, setReason] = useState(current?.reason ?? "");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="z-[120]">
        <AlertDialogHeader>
          <AlertDialogTitle>Alterar escopos do contrato</AlertDialogTitle>
          <AlertDialogDescription>
            Este contrato ficará diferente da proposta aprovada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <ul className="space-y-2">
            {scopes.map((scope) => {
              const checked = !removed.includes(scope.entryId);
              return (
                <li key={scope.entryId}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setRemoved((prev) =>
                          e.target.checked
                            ? prev.filter((id) => id !== scope.entryId)
                            : [...prev, scope.entryId],
                        );
                      }}
                    />
                    {scope.areaLabel} — {scope.label}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="space-y-1">
            <Label className="text-xs">Motivo da alteração</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim()}
            onClick={() =>
              onConfirm({
                removedEntryIds: removed,
                addedScopes: current?.addedScopes ?? [],
                reason: reason.trim(),
                changedBy: current?.changedBy ?? "",
                changedByName: current?.changedByName,
                changedAt: new Date().toISOString(),
              })
            }
          >
            Confirmar alteração
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SectionHeading({
  num,
  title,
  complete,
}: {
  num: number;
  title: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black",
          complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
        )}
      >
        {complete ? <Check className="size-3.5" aria-hidden /> : num}
      </span>
      <h3 className="text-sm font-bold tracking-[-0.01em] text-primary-dark">{title}</h3>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-bold",
          complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
        )}
      >
        {complete ? "Completo" : "Pendente"}
      </span>
    </div>
  );
}
