"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BookOpenText,
  Check,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PROPOSTA_AREA_OPTIONS } from "@/data/proposta-tipos-catalog";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";

type ScopeTypeRow = ProposalCatalogAdminData["adminRows"]["scopeTypes"][number];
type ScopeSubtypeRow = ProposalCatalogAdminData["adminRows"]["scopeSubtypes"][number];
type InvestmentTypeRow = ProposalCatalogAdminData["adminRows"]["investmentTypes"][number];
type InvestmentSubtypeRow = ProposalCatalogAdminData["adminRows"]["investmentSubtypes"][number];

type ApiResponse = {
  ok?: boolean;
  data?: ProposalCatalogAdminData;
  error?: string;
};

type ScopeTypeForm = { areaKey: string; label: string; typeKey: string };
type InvestmentTypeForm = { label: string; typeKey: string };

const blankScopeType: ScopeTypeForm = { areaKey: PROPOSTA_AREA_OPTIONS[0] ?? "Cível", label: "", typeKey: "" };
const blankInvestmentType: InvestmentTypeForm = { label: "", typeKey: "" };
const fieldLabelClassName = "text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const selectClassName = "h-10 w-full rounded-xl border border-input bg-white/85 px-3 text-sm text-primary-dark shadow-sm";

function placeholdersRaw(keys: string[]) {
  return keys.join(", ");
}

function parsePlaceholders(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countScopeSubtypes(types: ScopeTypeRow[], subtypes: ScopeSubtypeRow[]) {
  const typeIds = new Set(types.map((type) => type.id));
  return subtypes.filter((subtype) => typeIds.has(subtype.scopeTypeId)).length;
}

export function ProposalCatalogAdminPanel({ initialData }: { initialData: ProposalCatalogAdminData }) {
  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [scopeTypeForm, setScopeTypeForm] = useState(blankScopeType);
  const [investmentTypeForm, setInvestmentTypeForm] = useState(blankInvestmentType);
  const [newScopeSubtypeFor, setNewScopeSubtypeFor] = useState<string | null>(null);
  const [newInvestmentSubtypeFor, setNewInvestmentSubtypeFor] = useState<string | null>(null);

  const scopeByArea = useMemo(() => {
    return data.adminRows.scopeTypes.reduce<Record<string, ScopeTypeRow[]>>((acc, row) => {
      acc[row.areaKey] = [...(acc[row.areaKey] ?? []), row];
      return acc;
    }, {});
  }, [data.adminRows.scopeTypes]);

  const scopeAreaGroups = useMemo(() => {
    const configuredAreas = Object.keys(scopeByArea).filter(
      (area) => !(PROPOSTA_AREA_OPTIONS as readonly string[]).includes(area),
    );
    return [...PROPOSTA_AREA_OPTIONS, ...configuredAreas].map((area) => ({
      area,
      types: scopeByArea[area] ?? [],
    }));
  }, [scopeByArea]);

  async function mutate(body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/proposal-catalog", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as ApiResponse;
    if (!res.ok || !json.ok || !json.data) {
      throw new Error(json.error ?? "Não foi possível atualizar o catálogo.");
    }
    setData(json.data);
    setMessage("Catálogo atualizado.");
  }

  function runMutation(body: Record<string, unknown>, method: "POST" | "PATCH" = "POST", onOk?: () => void) {
    startTransition(async () => {
      try {
        await mutate(body, method);
        onOk?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao salvar.");
      }
    });
  }

  function handleCreateScopeType(event: React.FormEvent) {
    event.preventDefault();
    runMutation(
      { kind: "scope_type", ...scopeTypeForm },
      "POST",
      () => setScopeTypeForm(blankScopeType),
    );
  }

  function handleCreateInvestmentType(event: React.FormEvent) {
    event.preventDefault();
    runMutation(
      { kind: "investment_type", ...investmentTypeForm },
      "POST",
      () => setInvestmentTypeForm(blankInvestmentType),
    );
  }

  const emptyDatabase = data.adminRows.scopeTypes.length === 0 && data.adminRows.investmentTypes.length === 0;

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/55 bg-white/72 shadow-sm shadow-primary-dark/10">
      <div className="border-b border-primary-dark/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(236,248,247,0.72))] px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-accent-teal/20 bg-accent-teal/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-dark">
              Catálogo editável
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-primary-dark">Escopo e investimento</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Cada área tem seus próprios tipos e subtipos de escopo. Investimentos ficam em um catálogo separado,
              com modelos de honorários reaproveitáveis nas propostas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[34rem]">
            <CatalogMetric label="Áreas" value={scopeAreaGroups.length} />
            <CatalogMetric label="Tipos de escopo" value={data.scopeTypeCount} />
            <CatalogMetric label="Subtipos" value={data.scopeSubtypeCount} />
            <CatalogMetric label="Investimentos" value={data.investmentSubtypeCount} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="h-7 rounded-full border-primary-dark/10 bg-white px-3 text-primary-dark">
            {data.source === "database" ? "Banco de dados" : "Fallback do código"}
          </Badge>
          {emptyDatabase ? (
            <Button
              size="sm"
              variant="teal"
              className="gap-2"
              disabled={isPending}
              onClick={() => runMutation({ kind: "seed_defaults" })}
            >
              <RefreshCw className="h-4 w-4" />
              Inicializar padrão
            </Button>
          ) : null}
          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? (
            <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Check className="h-4 w-4" />
              {message}
            </p>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="escopo" className="p-5">
        <TabsList className="grid h-auto w-full grid-cols-2 border border-primary-dark/10 bg-white p-1 shadow-sm md:w-fit">
          <TabsTrigger value="escopo" className="gap-2 px-4 py-2">
            <BookOpenText className="h-4 w-4" />
            Escopos por área
          </TabsTrigger>
          <TabsTrigger value="investimento" className="gap-2 px-4 py-2">
            <WalletCards className="h-4 w-4" />
            Investimentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="escopo" className="mt-5 space-y-5">
          <FormShell
            eyebrow="Novo tipo"
            title="Criar tipo de escopo"
            description="Escolha a área, nomeie o tipo e depois cadastre os subtipos com seus textos modelo."
          >
            <form
              onSubmit={handleCreateScopeType}
              className="grid gap-3 md:grid-cols-[1fr_1.1fr_1fr_auto]"
            >
              <div className="space-y-1.5">
                <Label className={fieldLabelClassName}>Área</Label>
                <select
                  className={selectClassName}
                  value={scopeTypeForm.areaKey}
                  onChange={(event) => setScopeTypeForm((prev) => ({ ...prev, areaKey: event.target.value }))}
                >
                  {PROPOSTA_AREA_OPTIONS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClassName}>Nome do tipo</Label>
                <Input
                  value={scopeTypeForm.label}
                  onChange={(event) => setScopeTypeForm((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Ex.: Consultivo recorrente"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClassName}>Chave técnica opcional</Label>
                <Input
                  value={scopeTypeForm.typeKey}
                  onChange={(event) => setScopeTypeForm((prev) => ({ ...prev, typeKey: event.target.value }))}
                  placeholder="consultivo_recorrente"
                />
              </div>
              <Button className="self-end gap-2" disabled={isPending} type="submit">
                <Plus className="h-4 w-4" />
                Criar tipo
              </Button>
            </form>
          </FormShell>

          <div className="grid gap-4">
            {scopeAreaGroups.map(({ area, types }) => (
              <AreaSection
                key={area}
                area={area}
                typeCount={types.length}
                subtypeCount={countScopeSubtypes(types, data.adminRows.scopeSubtypes)}
              >
                {types.length ? (
                  <div className="grid gap-3">
                    {types.map((type) => (
                      <ScopeTypeCard
                        key={type.id}
                        type={type}
                        subtypes={data.adminRows.scopeSubtypes.filter((sub) => sub.scopeTypeId === type.id)}
                        isAdding={newScopeSubtypeFor === type.id}
                        onToggleAdd={() => setNewScopeSubtypeFor((prev) => (prev === type.id ? null : type.id))}
                        onMutate={runMutation}
                        isPending={isPending}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyCatalogState text="Nenhum tipo cadastrado nesta área. Use o formulário acima para criar o primeiro." />
                )}
              </AreaSection>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="investimento" className="mt-5 space-y-5">
          <FormShell
            eyebrow="Novo investimento"
            title="Criar tipo de investimento"
            description="Agrupe os modelos de honorários por família para facilitar a escolha dentro da proposta."
          >
            <form onSubmit={handleCreateInvestmentType} className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
              <div className="space-y-1.5">
                <Label className={fieldLabelClassName}>Nome do tipo</Label>
                <Input
                  value={investmentTypeForm.label}
                  onChange={(event) => setInvestmentTypeForm((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Ex.: Honorários por fase"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className={fieldLabelClassName}>Chave técnica opcional</Label>
                <Input
                  value={investmentTypeForm.typeKey}
                  onChange={(event) => setInvestmentTypeForm((prev) => ({ ...prev, typeKey: event.target.value }))}
                  placeholder="honorarios_por_fase"
                />
              </div>
              <Button className="self-end gap-2" disabled={isPending} type="submit">
                <Plus className="h-4 w-4" />
                Criar tipo
              </Button>
            </form>
          </FormShell>

          <div className="grid gap-3">
            {data.adminRows.investmentTypes.length ? (
              data.adminRows.investmentTypes.map((type) => (
                <InvestmentTypeCard
                  key={type.id}
                  type={type}
                  subtypes={data.adminRows.investmentSubtypes.filter((sub) => sub.investmentTypeId === type.id)}
                  isAdding={newInvestmentSubtypeFor === type.id}
                  onToggleAdd={() => setNewInvestmentSubtypeFor((prev) => (prev === type.id ? null : type.id))}
                  onMutate={runMutation}
                  isPending={isPending}
                />
              ))
            ) : (
              <EmptyCatalogState text="Nenhum tipo de investimento cadastrado. Inicialize o padrão ou crie um tipo acima." />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function CatalogMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-primary-dark/10 bg-white/75 p-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-[-0.04em] text-primary-dark">{value}</p>
    </div>
  );
}

function FormShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-primary-dark/10 bg-white/72 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent-teal">{eyebrow}</p>
        <h3 className="text-lg font-bold text-primary-dark">{title}</h3>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function AreaSection({
  area,
  typeCount,
  subtypeCount,
  children,
}: {
  area: string;
  typeCount: number;
  subtypeCount: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-primary-dark/10 bg-white/58 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-primary-dark/10 bg-white/70 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-teal/10 text-accent-teal">
            <Layers3 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="font-bold text-primary-dark">{area}</h3>
            <p className="text-xs text-muted-foreground">Escopos separados por tipo e subtipo</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="rounded-full bg-white">
            {typeCount} tipos
          </Badge>
          <Badge variant="outline" className="rounded-full bg-white">
            {subtypeCount} subtipos
          </Badge>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyCatalogState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-primary-dark/15 bg-slate-50/70 px-4 py-5 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "h-6 rounded-full border-emerald-200 bg-emerald-50 text-emerald-800"
          : "h-6 rounded-full border-slate-200 bg-slate-50 text-slate-600"
      }
    >
      {active ? "Ativo" : "Inativo"}
    </Badge>
  );
}

function ScopeTypeCard({
  type,
  subtypes,
  isAdding,
  onToggleAdd,
  onMutate,
  isPending,
}: {
  type: ScopeTypeRow;
  subtypes: ScopeSubtypeRow[];
  isAdding: boolean;
  onToggleAdd: () => void;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState({
    label: type.label,
    areaKey: type.areaKey,
    sortOrder: String(type.sortOrder),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white/78 shadow-sm">
      <div className="grid gap-4 border-b border-primary-dark/10 bg-white/70 px-4 py-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 md:grid-cols-[1.1fr_0.9fr_7rem]">
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Tipo de escopo</Label>
            <Input
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              className="bg-white font-semibold text-primary-dark"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Área</Label>
            <select
              className={selectClassName}
              value={draft.areaKey}
              onChange={(event) => setDraft((prev) => ({ ...prev, areaKey: event.target.value }))}
            >
              {PROPOSTA_AREA_OPTIONS.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Ordem</Label>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(event) => setDraft((prev) => ({ ...prev, sortOrder: event.target.value }))}
              className="bg-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 lg:justify-end">
          <StatusBadge active={type.isActive} />
          <Button
            size="sm"
            variant="teal"
            className="gap-2"
            disabled={isPending}
            type="button"
            onClick={() =>
              onMutate(
                {
                  kind: "scope_type",
                  id: type.id,
                  label: draft.label,
                  areaKey: draft.areaKey,
                  sortOrder: Number(draft.sortOrder) || 0,
                },
                "PATCH",
              )
            }
          >
            <Save className="h-4 w-4" />
            Salvar tipo
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleAdd} type="button">
            <Plus className="h-4 w-4" />
            Subtipo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            type="button"
            onClick={() => onMutate({ kind: "scope_type", id: type.id, isActive: !type.isActive }, "PATCH")}
          >
            {type.isActive ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-primary-dark/10 bg-slate-50/60 px-4 py-2 text-xs text-muted-foreground">
        <code className="rounded-full bg-white px-2 py-1 text-[11px] text-primary-dark">{type.typeKey}</code>
        <span>{subtypes.length} subtipos cadastrados</span>
      </div>

      {isAdding ? (
        <ScopeSubtypeForm scopeTypeId={type.id} onMutate={onMutate} isPending={isPending} />
      ) : null}

      <div className="divide-y divide-primary-dark/10">
        {subtypes.length ? (
          subtypes.map((subtype) => (
            <ScopeSubtypeEditor key={subtype.id} subtype={subtype} onMutate={onMutate} isPending={isPending} />
          ))
        ) : (
          <EmptyCatalogState text="Este tipo ainda não tem subtipos. Clique em Subtipo para criar o primeiro." />
        )}
      </div>
    </div>
  );
}

function ScopeSubtypeForm({
  scopeTypeId,
  onMutate,
  isPending,
}: {
  scopeTypeId: string;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    label: "",
    subtypeKey: "",
    escopoTemplate: "",
    placeholderKeys: "",
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onMutate(
      {
        kind: "scope_subtype",
        scopeTypeId,
        label: form.label,
        subtypeKey: form.subtypeKey,
        escopoTemplate: form.escopoTemplate,
        placeholderKeys: parsePlaceholders(form.placeholderKeys),
      },
      "POST",
      () => setForm({ label: "", subtypeKey: "", escopoTemplate: "", placeholderKeys: "" }),
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 border-b border-primary-dark/10 bg-accent-teal/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark">
        <Pencil className="h-4 w-4 text-accent-teal" />
        Novo subtipo de escopo
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={fieldLabelClassName}>Nome do subtipo</Label>
          <Input
            value={form.label}
            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="Ex.: 1 processo"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className={fieldLabelClassName}>Chave técnica opcional</Label>
          <Input
            value={form.subtypeKey}
            onChange={(event) => setForm((prev) => ({ ...prev, subtypeKey: event.target.value }))}
            placeholder="um_processo"
          />
        </div>
      </div>
      <TextAreaField
        label="Texto do escopo"
        help="Texto jurídico que descreve a atuação. Use placeholders entre colchetes."
        value={form.escopoTemplate}
        onChange={(value) => setForm((prev) => ({ ...prev, escopoTemplate: value }))}
        placeholder="Prestação de serviços advocatícios em favor de [NOME EMPRESA]..."
        minHeight="min-h-32"
      />
      <div className="space-y-1.5">
        <Label className={fieldLabelClassName}>Placeholders extras</Label>
        <Input
          value={form.placeholderKeys}
          onChange={(event) => setForm((prev) => ({ ...prev, placeholderKeys: event.target.value }))}
          placeholder="RESUMO_DO_PROCESSO, VALOR_CAUSA"
        />
        <p className="text-xs text-muted-foreground">Separe por vírgula. Os placeholders presentes nos textos também são detectados.</p>
      </div>
      <Button className="justify-self-start gap-2" disabled={isPending} type="submit">
        <Save className="h-4 w-4" />
        Criar subtipo
      </Button>
    </form>
  );
}

function ScopeSubtypeEditor({
  subtype,
  onMutate,
  isPending,
}: {
  subtype: ScopeSubtypeRow;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState({
    label: subtype.label,
    escopoTemplate: subtype.escopoTemplate,
    placeholderKeys: placeholdersRaw(subtype.placeholderKeys),
  });

  return (
    <div className="grid gap-4 px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="grid flex-1 gap-2 md:grid-cols-[minmax(0,28rem)_auto]">
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Subtipo</Label>
            <Input
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              className="bg-white/90 font-semibold text-primary-dark"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <StatusBadge active={subtype.isActive} />
            <code className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-muted-foreground">
              {subtype.subtypeKey}
            </code>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={isPending}
          onClick={() => onMutate({ kind: "scope_subtype", id: subtype.id, isActive: !subtype.isActive }, "PATCH")}
        >
          {subtype.isActive ? "Desativar" : "Ativar"}
        </Button>
      </div>
      <TextAreaField
        label="Texto do escopo"
        help="Esse conteúdo aparece no bloco de escopo da proposta."
        value={draft.escopoTemplate}
        onChange={(value) => setDraft((prev) => ({ ...prev, escopoTemplate: value }))}
        minHeight="min-h-32"
      />
      <div className="space-y-1.5">
        <Label className={fieldLabelClassName}>Placeholders</Label>
        <Input
          value={draft.placeholderKeys}
          onChange={(event) => setDraft((prev) => ({ ...prev, placeholderKeys: event.target.value }))}
          placeholder="Placeholders separados por vírgula"
        />
      </div>
      <Button
        size="sm"
        variant="teal"
        className="justify-self-start gap-2"
        disabled={isPending}
        type="button"
        onClick={() =>
          onMutate(
            {
              kind: "scope_subtype",
              id: subtype.id,
              label: draft.label,
              escopoTemplate: draft.escopoTemplate,
              placeholderKeys: parsePlaceholders(draft.placeholderKeys),
            },
            "PATCH",
          )
        }
      >
        <Save className="h-4 w-4" />
        Salvar subtipo
      </Button>
    </div>
  );
}

function InvestmentTypeCard({
  type,
  subtypes,
  isAdding,
  onToggleAdd,
  onMutate,
  isPending,
}: {
  type: InvestmentTypeRow;
  subtypes: InvestmentSubtypeRow[];
  isAdding: boolean;
  onToggleAdd: () => void;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState({
    label: type.label,
    sortOrder: String(type.sortOrder),
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white/78 shadow-sm">
      <div className="grid gap-4 border-b border-primary-dark/10 bg-white/70 px-4 py-4 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_8rem]">
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Tipo de investimento</Label>
            <Input
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              className="bg-white font-semibold text-primary-dark"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Ordem</Label>
            <Input
              type="number"
              value={draft.sortOrder}
              onChange={(event) => setDraft((prev) => ({ ...prev, sortOrder: event.target.value }))}
              className="bg-white"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2 lg:justify-end">
          <StatusBadge active={type.isActive} />
          <Button
            size="sm"
            variant="teal"
            className="gap-2"
            disabled={isPending}
            type="button"
            onClick={() =>
              onMutate(
                {
                  kind: "investment_type",
                  id: type.id,
                  label: draft.label,
                  sortOrder: Number(draft.sortOrder) || 0,
                },
                "PATCH",
              )
            }
          >
            <Save className="h-4 w-4" />
            Salvar tipo
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleAdd} type="button">
            <Plus className="h-4 w-4" />
            Subtipo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            type="button"
            onClick={() => onMutate({ kind: "investment_type", id: type.id, isActive: !type.isActive }, "PATCH")}
          >
            {type.isActive ? "Desativar" : "Ativar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-primary-dark/10 bg-slate-50/60 px-4 py-2 text-xs text-muted-foreground">
        <code className="rounded-full bg-white px-2 py-1 text-[11px] text-primary-dark">{type.typeKey}</code>
        <span>{subtypes.length} modelos de honorários</span>
      </div>

      {isAdding ? (
        <InvestmentSubtypeForm investmentTypeId={type.id} onMutate={onMutate} isPending={isPending} />
      ) : null}

      <div className="divide-y divide-primary-dark/10">
        {subtypes.length ? (
          subtypes.map((subtype) => (
            <InvestmentSubtypeEditor key={subtype.id} subtype={subtype} onMutate={onMutate} isPending={isPending} />
          ))
        ) : (
          <EmptyCatalogState text="Este tipo ainda não tem modelos. Clique em Subtipo para cadastrar um." />
        )}
      </div>
    </div>
  );
}

function InvestmentSubtypeForm({
  investmentTypeId,
  onMutate,
  isPending,
}: {
  investmentTypeId: string;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({ label: "", subtypeKey: "", conceito: "", template: "", placeholderKeys: "" });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onMutate(
      {
        kind: "investment_subtype",
        investmentTypeId,
        label: form.label,
        subtypeKey: form.subtypeKey,
        conceito: form.conceito,
        template: form.template,
        placeholderKeys: parsePlaceholders(form.placeholderKeys),
      },
      "POST",
      () => setForm({ label: "", subtypeKey: "", conceito: "", template: "", placeholderKeys: "" }),
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 border-b border-primary-dark/10 bg-accent-teal/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary-dark">
        <SlidersHorizontal className="h-4 w-4 text-accent-teal" />
        Novo subtipo de investimento
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={fieldLabelClassName}>Nome do modelo</Label>
          <Input
            value={form.label}
            onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
            placeholder="Ex.: Mensal - Fixo"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label className={fieldLabelClassName}>Chave técnica opcional</Label>
          <Input
            value={form.subtypeKey}
            onChange={(event) => setForm((prev) => ({ ...prev, subtypeKey: event.target.value }))}
            placeholder="mensal_fixo"
          />
        </div>
      </div>
      <TextAreaField
        label="Conceito"
        help="Resumo para o usuário entender quando usar este modelo."
        value={form.conceito}
        onChange={(value) => setForm((prev) => ({ ...prev, conceito: value }))}
        placeholder="Pagamento mensal recorrente, em valor fixo..."
      />
      <TextAreaField
        label="Modelo de honorários"
        help="Texto que será levado para a proposta. Use placeholders entre colchetes."
        value={form.template}
        onChange={(value) => setForm((prev) => ({ ...prev, template: value }))}
        placeholder="Para a prestação dos serviços, propõe-se o pagamento de R$ [VALOR]..."
        minHeight="min-h-32"
      />
      <div className="space-y-1.5">
        <Label className={fieldLabelClassName}>Placeholders extras</Label>
        <Input
          value={form.placeholderKeys}
          onChange={(event) => setForm((prev) => ({ ...prev, placeholderKeys: event.target.value }))}
          placeholder="VALOR, PARCELAS, CONDICAO"
        />
      </div>
      <Button className="justify-self-start gap-2" disabled={isPending} type="submit">
        <Save className="h-4 w-4" />
        Criar subtipo
      </Button>
    </form>
  );
}

function InvestmentSubtypeEditor({
  subtype,
  onMutate,
  isPending,
}: {
  subtype: InvestmentSubtypeRow;
  onMutate: (body: Record<string, unknown>, method?: "POST" | "PATCH", onOk?: () => void) => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState({
    label: subtype.label,
    conceito: subtype.conceito,
    template: subtype.template,
    placeholderKeys: placeholdersRaw(subtype.placeholderKeys),
  });

  return (
    <div className="grid gap-4 px-4 py-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="grid flex-1 gap-2 md:grid-cols-[minmax(0,28rem)_auto]">
          <div className="space-y-1.5">
            <Label className={fieldLabelClassName}>Modelo</Label>
            <Input
              value={draft.label}
              onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
              className="bg-white/90 font-semibold text-primary-dark"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <StatusBadge active={subtype.isActive} />
            <code className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-muted-foreground">
              {subtype.subtypeKey}
            </code>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={isPending}
          onClick={() =>
            onMutate({ kind: "investment_subtype", id: subtype.id, isActive: !subtype.isActive }, "PATCH")
          }
        >
          {subtype.isActive ? "Desativar" : "Ativar"}
        </Button>
      </div>
      <TextAreaField
        label="Conceito"
        help="Descrição curta exibida para orientar a escolha do modelo."
        value={draft.conceito}
        onChange={(value) => setDraft((prev) => ({ ...prev, conceito: value }))}
      />
      <TextAreaField
        label="Modelo de honorários"
        help="Texto final do bloco financeiro da proposta."
        value={draft.template}
        onChange={(value) => setDraft((prev) => ({ ...prev, template: value }))}
        minHeight="min-h-32"
      />
      <div className="space-y-1.5">
        <Label className={fieldLabelClassName}>Placeholders</Label>
        <Input
          value={draft.placeholderKeys}
          onChange={(event) => setDraft((prev) => ({ ...prev, placeholderKeys: event.target.value }))}
          placeholder="Placeholders separados por vírgula"
        />
      </div>
      <Button
        size="sm"
        variant="teal"
        className="justify-self-start gap-2"
        disabled={isPending}
        type="button"
        onClick={() =>
          onMutate(
            {
              kind: "investment_subtype",
              id: subtype.id,
              label: draft.label,
              conceito: draft.conceito,
              template: draft.template,
              placeholderKeys: parsePlaceholders(draft.placeholderKeys),
            },
            "PATCH",
          )
        }
      >
        <Save className="h-4 w-4" />
        Salvar subtipo
      </Button>
    </div>
  );
}

function TextAreaField({
  label,
  help,
  value,
  onChange,
  placeholder,
  minHeight = "min-h-24",
}: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={fieldLabelClassName}>{label}</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`${minHeight} bg-white/85 leading-6`}
      />
      <p className="text-xs leading-5 text-muted-foreground">{help}</p>
    </div>
  );
}
