"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Settings2,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConditionBuilder } from "./condition-builder";
import type { FieldDefinition, FieldCondition } from "./dynamic-form";
import {
  nextAvailableFieldCode,
  normalizeLabelKey,
  slugifyFieldCodeFromLabel,
} from "@/lib/crm/field-code";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";

const STAGE_LABELS: Record<string, string> = {
  cadastro_lead: "Cadastro do Lead",
  levantamento_dados: "Levantamento de Dados",
  compilacao: "Compilação",
  revisao: "Revisão",
  due_diligence_finalizada: "Due Diligence Finalizada",
  reuniao: "Reunião",
  confeccao_proposta: "Elaboração da Proposta",
  proposta_enviada: "Proposta Enviada",
  confeccao_contrato: "Elaboração do Contrato",
  contrato_elaborado: "Contrato Elaborado",
  contrato_enviado: "Contrato Enviado",
  contrato_assinado: "Contrato Assinado",
  aguardando_cadastro: "Aguardando Cadastro",
  cadastro_novo_cliente: "Cadastro de Novo Cliente",
  inclusao_faturamento: "Inclusão no Fluxo de Faturamento",
  boas_vindas: "Boas-vindas",
  reuniao_kickoff: "Reunião Kick-off",
};

const NEW_FIELD_FORM_DEFAULTS = {
  label: "",
  field_type: "text",
  /** Alinhado a seeds e `field_values.entity_name` nas APIs de transição. */
  entity_name: "oportunidade",
  stage_code: "",
  is_required: false,
  field_options_raw: "",
  condition: null as FieldCondition,
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  url: "URL",
  number: "Número",
  percent: "Percentual",
  date: "Data",
  date_br: "Data (dd/mm/aaaa)",
  time: "Horário (HH:mm)",
  user: "Utilizador (CRM)",
  select: "Seleção única",
  multiselect: "Múltipla escolha",
  textarea: "Texto longo",
};

/** Labels for Select trigger (Base UI `items`); values stored are keys. */
const ENTITY_NAME_LABELS: Record<string, string> = {
  oportunidade: "Oportunidade",
  clientes: "Clientes",
  contratos: "Contratos",
};

const TYPE_BADGE_COLOR: Record<string, string> = {
  text: "bg-slate-100 text-slate-700",
  email: "bg-blue-100 text-blue-700",
  phone: "bg-green-100 text-green-700",
  url: "bg-cyan-100 text-cyan-700",
  number: "bg-orange-100 text-orange-700",
  percent: "bg-yellow-100 text-yellow-700",
  date: "bg-purple-100 text-purple-700",
  date_br: "bg-violet-100 text-violet-800",
  time: "bg-fuchsia-100 text-fuchsia-800",
  user: "bg-indigo-100 text-indigo-800",
  select: "bg-pink-100 text-pink-700",
  multiselect: "bg-rose-100 text-rose-700",
  textarea: "bg-teal-100 text-teal-700",
};

// ─── Field Row ────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldDefinition;
  allFields: FieldDefinition[];
  onToggle: (id: string, active: boolean) => void;
  onUpdateRequired: (id: string, required: boolean) => void;
  onDelete: (id: string) => void;
}

function FieldRow({
  field,
  allFields,
  onToggle,
  onUpdateRequired,
  onDelete,
}: FieldRowProps) {
  const [isPending, startTransition] = useTransition();
  const typeBadge = TYPE_BADGE_COLOR[field.field_type] ?? "bg-white text-slate-700";

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
        field.is_active
          ? "border-slate-200 bg-white shadow-sm"
          : "border-slate-200 bg-white/95 opacity-70"
      }`}
    >
      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-primary-dark">
            {field.label}
          </span>
          {field.is_required && (
            <span className="text-xs text-red-500" title="Obrigatório">
              *
            </span>
          )}
          {field.condition_json && (
            <Badge variant="secondary" className="text-[10px]">
              condicional
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <code className="text-[10px] text-muted-foreground">
            {field.field_code}
          </code>
          <span
            className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${typeBadge}`}
          >
            {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Switch
          checked={field.is_required}
          onCheckedChange={(v) =>
            startTransition(() => onUpdateRequired(field.id, v))
          }
          disabled={isPending}
          title="Obrigatório"
        />

        <button
          type="button"
          onClick={() => startTransition(() => onToggle(field.id, !field.is_active))}
          disabled={isPending}
          title={field.is_active ? "Desativar" : "Ativar"}
          className="text-muted-foreground hover:text-primary-dark"
        >
          {field.is_active ? (
            <ToggleRight className="h-5 w-5 text-green-500" />
          ) : (
            <ToggleLeft className="h-5 w-5" />
          )}
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              title="Excluir"
              className="text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir campo?</AlertDialogTitle>
              <AlertDialogDescription>
                O campo <strong className="text-foreground">{field.label}</strong> (
                <code className="text-xs">{field.field_code}</code>) será removido deste funil.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => startTransition(() => onDelete(field.id))}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ─── Stage Section ─────────────────────────────────────────────────────────────

interface StageSectionProps {
  stageCode: string;
  fields: FieldDefinition[];
  allFields: FieldDefinition[];
  onToggle: (id: string, active: boolean) => void;
  onUpdateRequired: (id: string, required: boolean) => void;
  onDelete: (id: string) => void;
}

function StageSection({
  stageCode,
  fields,
  allFields,
  onToggle,
  onUpdateRequired,
  onDelete,
}: StageSectionProps) {
  const [open, setOpen] = useState(true);
  const activeCount = fields.filter((f) => f.is_active).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-primary-dark">
            {STAGE_LABELS[stageCode] ?? stageCode}
          </span>
          <Badge variant="secondary" className="text-xs">
            {activeCount}/{fields.length}
          </Badge>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-4">
          {fields.map((f) => (
            <FieldRow
              key={f.id}
              field={f}
              allFields={allFields}
              onToggle={onToggle}
              onUpdateRequired={onUpdateRequired}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── New Field Dialog ─────────────────────────────────────────────────────────

interface NewFieldDialogProps {
  pipelineCode: string;
  allFields: FieldDefinition[];
  onCreated: (field: FieldDefinition) => void;
}

function NewFieldDialog({ pipelineCode, allFields, onCreated }: NewFieldDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => ({ ...NEW_FIELD_FORM_DEFAULTS }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    setForm({ ...NEW_FIELD_FORM_DEFAULTS });
    setError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) resetForm();
  }

  const previewFieldCode = useMemo(() => {
    const base = slugifyFieldCodeFromLabel(form.label);
    const codes = allFields
      .filter((f) => (f.entity_name ?? "") === form.entity_name)
      .map((f) => f.field_code);
    return nextAvailableFieldCode(base, codes);
  }, [form.label, form.entity_name, allFields]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedLabel = form.label.trim();
    if (!trimmedLabel) {
      setError("Informe o nome de exibição do campo.");
      setLoading(false);
      return;
    }

    if (
      allFields.some(
        (f) => normalizeLabelKey(f.label) === normalizeLabelKey(trimmedLabel),
      )
    ) {
      setError("Já existe um campo com este nome de exibição neste funil.");
      setLoading(false);
      return;
    }

    const field_options = form.field_options_raw
      ? form.field_options_raw.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    const res = await fetch("/api/admin/fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: trimmedLabel,
        field_type: form.field_type,
        entity_name: form.entity_name,
        pipeline_code: pipelineCode,
        stage_code: form.stage_code || null,
        is_required: form.is_required,
        field_options,
        condition_json: form.condition,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Erro ao criar campo");
      return;
    }

    const { data } = await res.json();
    onCreated(data);
    setOpen(false);
    resetForm();
  }

  const availableFields = allFields.map((f) => ({
    code: f.field_code,
    label: f.label,
  }));

  return (
    <Dialog modal={false} open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-crm-gradient-primary text-white shadow">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo Campo
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[min(90vh,720px)] max-w-lg gap-0 overflow-y-auto border-slate-200 bg-white p-0 sm:rounded-2xl"
        onPointerDownOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
      >
        <div className="border-b border-slate-100 px-6 py-4">
          <DialogHeader className="space-y-1 text-left sm:text-left">
            <DialogTitle>Novo Campo</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              O código técnico é gerado automaticamente a partir do nome de exibição. Não pode
              repetir o mesmo nome neste funil.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form
          id="new-field-form"
          onSubmit={handleSubmit}
          className="space-y-4 px-6 py-4"
        >
          <div className="space-y-3 rounded-xl border border-white/50 bg-white/65 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
              Identificação
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Nome de exibição *</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Ex.: Data da reunião comercial"
                className="bg-white/70 text-sm"
                required
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Código técnico (automático, único por entidade):{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-primary-dark">
                  {form.label.trim() ? previewFieldCode : "—"}
                </code>
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/50 bg-white/65 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
              Tipo e contexto
            </p>
            <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select
                  modal={false}
                  items={FIELD_TYPE_LABELS}
                  value={form.field_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, field_type: v ?? "" }))}
                >
                  <SelectTrigger className="h-9 w-full min-w-0 bg-white/70 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    side="bottom"
                    align="start"
                    sideOffset={4}
                  >
                    {Object.entries(FIELD_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Entidade</Label>
                <Select
                  modal={false}
                  items={ENTITY_NAME_LABELS}
                  value={form.entity_name}
                  onValueChange={(v) => setForm((p) => ({ ...p, entity_name: v ?? "" }))}
                >
                  <SelectTrigger className="h-9 w-full min-w-0 bg-white/70 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    side="bottom"
                    align="start"
                    sideOffset={4}
                  >
                    <SelectItem value="oportunidade">Oportunidade</SelectItem>
                    <SelectItem value="clientes">Clientes</SelectItem>
                    <SelectItem value="contratos">Contratos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label className="text-xs">Etapa</Label>
                <Select
                  modal={false}
                  items={STAGE_LABELS}
                  value={form.stage_code}
                  onValueChange={(v) => setForm((p) => ({ ...p, stage_code: v ?? "" }))}
                >
                  <SelectTrigger className="h-9 w-full min-w-0 bg-white/70 text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent
                    alignItemWithTrigger={false}
                    side="bottom"
                    align="start"
                    sideOffset={4}
                  >
                    {Object.entries(STAGE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {(form.field_type === "select" || form.field_type === "multiselect") && (
            <div className="space-y-3 rounded-xl border border-white/50 bg-white/65 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-dark">
                Opções da lista
              </p>
              <div className="space-y-1">
                <Label className="text-xs">Opções (separadas por vírgula)</Label>
                <Input
                  value={form.field_options_raw}
                  onChange={(e) => setForm((p) => ({ ...p, field_options_raw: e.target.value }))}
                  placeholder="Opção 1, Opção 2, Opção 3"
                  className="bg-white/70 text-sm"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/65 px-3 py-2.5">
            <Switch
              id="required"
              checked={form.is_required}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_required: v }))}
            />
            <Label htmlFor="required" className="text-xs">
              Campo obrigatório
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Condição de exibição</Label>
            <ConditionBuilder
              value={form.condition}
              onChange={(c) => setForm((p) => ({ ...p, condition: c }))}
              availableFields={availableFields}
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          ) : null}
        </form>

        <DialogFooter className="flex-col gap-2 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-field-form"
            disabled={loading}
            className="bg-crm-gradient-primary text-white shadow"
          >
            {loading ? "Criando..." : "Criar Campo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── FieldConfigPanel (main) ──────────────────────────────────────────────────

interface FieldConfigPanelProps {
  initialFields: FieldDefinition[];
  pipelineCode: string;
}

export function FieldConfigPanel({ initialFields, pipelineCode }: FieldConfigPanelProps) {
  const [fields, setFields] = useState<FieldDefinition[]>(initialFields);
  const [isPending, startTransition] = useTransition();

  async function patchField(id: string, patch: Partial<FieldDefinition>) {
    const res = await fetch(`/api/admin/fields/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { data } = await res.json();
      setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...data } : f)));
    }
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(() => { patchField(id, { is_active: active }); });
  }

  function handleUpdateRequired(id: string, required: boolean) {
    startTransition(() => { patchField(id, { is_required: required }); });
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/fields/${id}`, { method: "DELETE" });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== id));
    }
  }

  function handleCreated(field: FieldDefinition) {
    setFields((prev) => [...prev, field]);
  }

  // Agrupar por stage
  const byStage = fields.reduce<Record<string, FieldDefinition[]>>((acc, f) => {
    const key = f.stage_code ?? "__transversal";
    if (!acc[key]) acc[key] = [];
    acc[key].push(f);
    return acc;
  }, {});

  const stageOrder = Object.keys(STAGE_LABELS);
  const sortedStages = Object.keys(byStage).sort((a, b) => {
    const ai = stageOrder.indexOf(a);
    const bi = stageOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary-medium" />
          <span className="text-sm font-semibold text-primary-dark">
            {fields.length} campos configurados
            {isPending && (
              <span className="ml-2 text-xs text-muted-foreground">Salvando...</span>
            )}
          </span>
        </div>
        <NewFieldDialog
          pipelineCode={pipelineCode}
          allFields={fields}
          onCreated={handleCreated}
        />
      </div>

      <div className="space-y-3">
        {sortedStages.map((stage) => (
          <StageSection
            key={stage}
            stageCode={stage}
            fields={(byStage[stage] ?? []).sort((a, b) => a.sort_order - b.sort_order)}
            allFields={fields}
            onToggle={handleToggle}
            onUpdateRequired={handleUpdateRequired}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
