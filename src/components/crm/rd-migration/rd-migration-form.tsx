"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileSignature,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react";

import { ClientOnboardingForm } from "@/app/(crm)/crm/leads/[id]/client-onboarding/client-onboarding-form";
import { ConfeccaoReuniaoModalSection } from "@/components/crm/confeccao-reuniao-modal-section";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { DynamicField } from "@/components/crm/dynamic-form";
import { RdMigrationStatusBadge, rdMigrationDisplayStatus } from "@/components/crm/rd-migration/rd-migration-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { maskDocument } from "@/lib/crm/br-document-mask";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { LEAD_TYPE_SELECT_LABELS } from "@/lib/crm/lead-type-label";
import {
  computeRdMigrationRequirements,
  empresasIntakeFromCadastro,
  RD_MIGRATION_SECTION_LABELS,
  type RdMigrationItem,
  type RdMigrationSection,
} from "@/lib/crm/rd-migration/requirements";
import type { RdMigrationD4SignDocument, RdMigrationDetail } from "@/lib/crm/rd-migration/service";
import type { RdMigrationEmpresa, RdMigrationValues } from "@/lib/crm/rd-migration/values";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import {
  indicationTypes,
  leadDigitalPlatforms,
  leadTypes,
} from "@/modules/crm/application/services/new-lead-payload";

type Patch = (mutate: (draft: RdMigrationValues) => void) => void;

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-4 rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  required,
  source,
  missing,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  source?: string;
  missing?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={htmlFor} className={cn(missing && "text-warning-text")}>
          {label}
          {required ? <span className="text-danger-text"> *</span> : null}
        </Label>
        {source ? (
          <span className="rounded-full border border-info-border bg-info-bg px-1.5 py-px text-[11px] font-medium text-info-text" title={source}>
            Do RD
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function SimpleSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  placeholder = "Selecione…",
  invalid,
}: {
  id: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const labels = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value || null} onValueChange={(v) => onChange(String(v ?? ""))} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <CrmSelectValue value={value} labels={labels} placeholder={placeholder} />
      </SelectTrigger>
      <CrmSelectContent>
        {options.map((o) => (
          <CrmSelectItem key={o.value} value={o.value}>
            {o.label}
          </CrmSelectItem>
        ))}
      </CrmSelectContent>
    </Select>
  );
}

// ── Cadastro do lead ──────────────────────────────────────────────────────────

function CadastroSection({
  values,
  patch,
  disabled,
  isMissing,
  showDueDates,
  showMeeting,
}: {
  values: RdMigrationValues;
  patch: Patch;
  disabled: boolean;
  isMissing: (key: string) => boolean;
  showDueDates: boolean;
  showMeeting: boolean;
}) {
  const c = values.cadastro;
  const src = values.sources;
  const setEmpresa = (index: number, next: Partial<RdMigrationEmpresa>) =>
    patch((d) => {
      d.cadastro.empresas[index] = { ...d.cadastro.empresas[index], ...next };
    });

  return (
    <Section
      id="cadastro"
      title="Cadastro do lead"
      description="O que o formulário de Novo Lead pede. Plataforma (Lead Digital), área do cross selling e decisor não existem no RD."
    >
      <div className="space-y-3">
        {(c.empresas.length > 0 ? c.empresas : [{ tipo_documento: "CNPJ" as const, razao_social: "", documento: "" }]).map(
          (empresa, index) => (
            <div key={index} className="grid gap-3 sm:grid-cols-[8rem_1fr_12rem_auto] sm:items-end">
              <Field label="Documento" htmlFor={`emp-tipo-${index}`}>
                <SimpleSelect
                  id={`emp-tipo-${index}`}
                  value={empresa.tipo_documento}
                  options={[
                    { value: "CNPJ", label: "CNPJ" },
                    { value: "CPF", label: "CPF" },
                  ]}
                  disabled={disabled}
                  onChange={(v) => setEmpresa(index, { tipo_documento: v === "CPF" ? "CPF" : "CNPJ" })}
                />
              </Field>
              <Field
                label={index === 0 ? "Razão social / nome do cliente" : "Outra empresa"}
                htmlFor={`emp-razao-${index}`}
                required={index === 0}
                source={index === 0 ? src["cadastro.empresas"] : undefined}
                missing={index === 0 && isMissing("cadastro.empresas.razao_social")}
              >
                <Input
                  id={`emp-razao-${index}`}
                  value={empresa.razao_social}
                  disabled={disabled}
                  aria-invalid={(index === 0 && isMissing("cadastro.empresas.razao_social")) || undefined}
                  onChange={(e) => {
                    if (c.empresas.length === 0) {
                      patch((d) => {
                        d.cadastro.empresas = [{ tipo_documento: "CNPJ", razao_social: e.target.value, documento: "" }];
                      });
                    } else setEmpresa(index, { razao_social: e.target.value });
                  }}
                />
              </Field>
              <Field
                label={empresa.tipo_documento}
                htmlFor={`emp-doc-${index}`}
                required={index === 0}
                missing={index === 0 && isMissing("cadastro.empresas.documento")}
              >
                <Input
                  id={`emp-doc-${index}`}
                  inputMode="numeric"
                  value={maskDocument(empresa.documento, empresa.tipo_documento)}
                  disabled={disabled}
                  aria-invalid={(index === 0 && isMissing("cadastro.empresas.documento")) || undefined}
                  onChange={(e) => {
                    const documento = e.target.value.replace(/\D/g, "").slice(0, 14);
                    if (c.empresas.length === 0) {
                      patch((d) => {
                        d.cadastro.empresas = [{ tipo_documento: "CNPJ", razao_social: "", documento }];
                      });
                    } else setEmpresa(index, { documento });
                  }}
                />
              </Field>
              {index > 0 && !disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remover empresa"
                  onClick={() =>
                    patch((d) => {
                      d.cadastro.empresas.splice(index, 1);
                    })
                  }
                >
                  <X className="size-4" />
                </Button>
              ) : (
                <span className="hidden sm:block" />
              )}
            </div>
          ),
        )}
        {!disabled ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              patch((d) => {
                if (d.cadastro.empresas.length === 0) {
                  d.cadastro.empresas.push({ tipo_documento: "CNPJ", razao_social: "", documento: "" });
                }
                d.cadastro.empresas.push({ tipo_documento: "CNPJ", razao_social: "", documento: "" });
              })
            }
          >
            <Plus className="size-4" />
            Adicionar empresa
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de lead" htmlFor="tipo-lead" required source={src["cadastro.tipoLead"]} missing={isMissing("cadastro.tipoLead")}>
          <SimpleSelect
            id="tipo-lead"
            value={c.tipoLead}
            options={leadTypes.map((t) => ({ value: t, label: LEAD_TYPE_SELECT_LABELS[t] ?? t }))}
            disabled={disabled}
            invalid={isMissing("cadastro.tipoLead")}
            onChange={(v) => patch((d) => void (d.cadastro.tipoLead = v))}
          />
        </Field>
        {c.tipoLead === "Indicacao" ? (
          <>
            <Field label="Tipo de indicação" htmlFor="tipo-ind" required source={src["cadastro.tipoIndicacao"]} missing={isMissing("cadastro.tipoIndicacao")}>
              <SimpleSelect
                id="tipo-ind"
                value={c.tipoIndicacao}
                options={indicationTypes.map((t) => ({ value: t, label: t }))}
                disabled={disabled}
                invalid={isMissing("cadastro.tipoIndicacao")}
                onChange={(v) => patch((d) => void (d.cadastro.tipoIndicacao = v))}
              />
            </Field>
            <Field label="Nome da indicação" htmlFor="nome-ind" required source={src["cadastro.nomeIndicacao"]} missing={isMissing("cadastro.nomeIndicacao")}>
              <Input
                id="nome-ind"
                value={c.nomeIndicacao}
                disabled={disabled}
                aria-invalid={isMissing("cadastro.nomeIndicacao") || undefined}
                onChange={(e) => patch((d) => void (d.cadastro.nomeIndicacao = e.target.value))}
              />
            </Field>
          </>
        ) : null}
        {c.tipoLead === "Lead Digital" ? (
          <Field label="Plataforma" htmlFor="plataforma" required missing={isMissing("cadastro.plataforma")}>
            <SimpleSelect
              id="plataforma"
              value={c.plataforma}
              options={leadDigitalPlatforms.map((t) => ({ value: t, label: t }))}
              disabled={disabled}
              invalid={isMissing("cadastro.plataforma")}
              onChange={(v) => patch((d) => void (d.cadastro.plataforma = v))}
            />
          </Field>
        ) : null}
        {c.tipoLead === "Cross Selling" ? (
          <Field label="Área do cross selling" htmlFor="area-cross" required missing={isMissing("cadastro.areaCrossSelling")}>
            <SimpleSelect
              id="area-cross"
              value={c.areaCrossSelling}
              options={CRM_PRACTICE_AREAS.map((a) => ({ value: a, label: a }))}
              disabled={disabled}
              invalid={isMissing("cadastro.areaCrossSelling")}
              onChange={(v) => patch((d) => void (d.cadastro.areaCrossSelling = v))}
            />
          </Field>
        ) : null}
        <Field label="Decisor" htmlFor="decisor" source={src["cadastro.decisor"]}>
          <Input
            id="decisor"
            value={c.decisor}
            disabled={disabled}
            placeholder="Quem decide a contratação no cliente (opcional)"
            onChange={(e) => patch((d) => void (d.cadastro.decisor = e.target.value))}
          />
        </Field>
      </div>

      <Field label="Áreas de análise" required source={src["cadastro.areasAnalise"]} missing={isMissing("cadastro.areasAnalise")}>
        <div className="flex flex-wrap gap-2">
          {CRM_PRACTICE_AREAS.map((area) => {
            const active = c.areasAnalise.includes(area);
            return (
              <button
                key={area}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() =>
                  patch((d) => {
                    d.cadastro.areasAnalise = active
                      ? d.cadastro.areasAnalise.filter((a) => a !== area)
                      : [...d.cadastro.areasAnalise, area];
                  })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors disabled:opacity-60",
                  active
                    ? "border-interactive-300 bg-interactive-50 text-interactive-700"
                    : "border-neutral-200 bg-white text-foreground hover:bg-neutral-50",
                )}
              >
                {area}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Haverá due diligence?" htmlFor="due" required source={src["cadastro.dueDiligence"]} missing={isMissing("cadastro.dueDiligence")}>
          <SimpleSelect
            id="due"
            value={c.dueDiligence}
            options={[
              { value: "Sim", label: "Sim" },
              { value: "Nao", label: "Não" },
            ]}
            disabled={disabled}
            onChange={(v) => patch((d) => void (d.cadastro.dueDiligence = v === "Sim" ? "Sim" : "Nao"))}
          />
        </Field>
        {showDueDates ? (
          <>
            <Field label="Prazo de entrega da DUE" required missing={isMissing("cadastro.dataEntregaDue")}>
              <DateInputBr
                value={c.dataEntregaDue}
                disabled={disabled}
                onChange={(ymd) => patch((d) => void (d.cadastro.dataEntregaDue = ymd))}
              />
            </Field>
            <Field label="Horário de entrega" required missing={isMissing("cadastro.horarioEntregaDue")}>
              <TimeInputBr
                value={c.horarioEntregaDue}
                disabled={disabled}
                onChange={(hm) => patch((d) => void (d.cadastro.horarioEntregaDue = hm))}
              />
            </Field>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Local da reunião" htmlFor="local" required source={src["cadastro.localReuniao"]} missing={isMissing("cadastro.localReuniao")}>
          <Input
            id="local"
            value={c.localReuniao}
            disabled={disabled}
            aria-invalid={isMissing("cadastro.localReuniao") || undefined}
            onChange={(e) => patch((d) => void (d.cadastro.localReuniao = e.target.value))}
          />
        </Field>
        {showMeeting ? (
          <>
            <Field label="Data da reunião" required source={src["cadastro.dataReuniao"]} missing={isMissing("cadastro.dataReuniao")}>
              <DateInputBr
                value={c.dataReuniao}
                disabled={disabled}
                onChange={(ymd) => patch((d) => void (d.cadastro.dataReuniao = ymd))}
              />
            </Field>
            <Field label="Horário da reunião" required source={src["cadastro.horarioReuniao"]} missing={isMissing("cadastro.horarioReuniao")}>
              <TimeInputBr
                value={c.horarioReuniao}
                disabled={disabled}
                onChange={(hm) => patch((d) => void (d.cadastro.horarioReuniao = hm))}
              />
            </Field>
          </>
        ) : null}
      </div>
    </Section>
  );
}

// ── Documentos do RD (evidências) ─────────────────────────────────────────────

function D4SignPicker({
  values,
  patch,
  disabled,
  required,
  missing,
}: {
  values: RdMigrationValues;
  patch: Patch;
  disabled: boolean;
  required: boolean;
  missing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RdMigrationD4SignDocument[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ev = values.evidencias;

  async function search() {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/rd-migration/d4sign-documents?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json()) as { ok?: boolean; error?: string; documents?: RdMigrationD4SignDocument[] };
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Falha na busca.");
      setResults(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na busca.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Field
      label={required ? "Documento enviado para assinatura (D4Sign)" : "Contrato assinado na D4Sign (opcional)"}
      required={required}
      missing={missing}
    >
      {ev.d4signDocumentUuid ? (
        <div className="flex items-center justify-between gap-3 rounded-(--radius-v2-md) border border-neutral-200 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{ev.d4signDocumentName || "Documento da D4Sign"}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{ev.d4signDocumentUuid}</p>
          </div>
          {!disabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                patch((d) => {
                  d.evidencias.d4signDocumentUuid = "";
                  d.evidencias.d4signDocumentName = "";
                })
              }
            >
              Trocar
            </Button>
          ) : null}
        </div>
      ) : disabled ? (
        <p className="text-sm text-muted-foreground">Nenhum documento ligado.</p>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
              placeholder="Nome do documento no cofre (ex.: nome do cliente)"
              aria-label="Buscar documento na D4Sign"
            />
            <Button type="button" variant="secondary" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
              {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              Buscar
            </Button>
          </div>
          {error ? <p className="text-sm text-danger-text">{error}</p> : null}
          {results ? (
            results.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento com esse nome.</p>
            ) : (
              <ul className="divide-y divide-neutral-200 rounded-(--radius-v2-md) border border-neutral-200">
                {results.map((doc) => (
                  <li key={doc.uuid} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{doc.name ?? doc.uuid}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.statusName ?? "Sem status"}
                        {doc.createdAt ? ` · ${formatDateTimeBr(doc.createdAt)}` : ""}
                        {doc.linkedOpportunityId ? " · já ligado a um lead" : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        patch((d) => {
                          d.evidencias.d4signDocumentUuid = doc.uuid;
                          d.evidencias.d4signDocumentName = doc.name ?? "";
                        })
                      }
                    >
                      Usar
                    </Button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      )}
    </Field>
  );
}

// ── Painéis laterais ──────────────────────────────────────────────────────────

const SECTION_ORDER: RdMigrationSection[] = ["responsavel", "cadastro", "proposta", "evidencias", "investimento", "pos_venda"];

function PendenciasPanel({ items, converted }: { items: RdMigrationItem[]; converted: boolean }) {
  const missing = items.filter((i) => i.missing);
  const bySection = SECTION_ORDER.map((section) => ({
    section,
    items: missing.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-foreground">Pendências</h2>
      {missing.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-success-text">
          <CheckCircle2 className="size-4" aria-hidden />
          Nada falta {converted ? "para concluir a migração" : "para a virada"}.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {bySection.map((group) => (
            <div key={group.section}>
              <a
                href={`#${group.section === "responsavel" ? "topo" : group.section}`}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {RD_MIGRATION_SECTION_LABELS[group.section]}
              </a>
              <ul className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <li key={item.key} className="flex items-start gap-2 text-[13px] text-foreground">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning-text" aria-hidden />
                    <span>
                      {item.label}
                      {item.afterConversion && !converted ? (
                        <span className="text-muted-foreground"> · depois da virada</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RdFieldsPanel({ fields, rdDealUrl, rdUpdatedAt }: { fields: Array<{ label: string; value: string }>; rdDealUrl: string | null; rdUpdatedAt: string | null }) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? fields.filter((f) => f.label.toLowerCase().includes(q) || f.value.toLowerCase().includes(q)) : fields;
  }, [fields, filter]);
  return (
    <section className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">O que o RD tem</h2>
        {rdDealUrl ? (
          <a
            href={rdDealUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-interactive-700 hover:underline"
          >
            Abrir no RD
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : null}
      </div>
      {rdUpdatedAt ? (
        <p className="mt-0.5 text-xs text-muted-foreground">Atualizado no RD em {formatDateTimeBr(rdUpdatedAt)}</p>
      ) : null}
      {fields.length > 8 ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar campos"
          className="mt-3 h-8 text-[13px]"
          aria-label="Filtrar campos do RD"
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{fields.length === 0 ? "Sem campos preenchidos no RD." : "Nenhum campo."}</p>
      ) : (
        <dl className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {shown.map((f) => (
            <div key={f.label}>
              <dt className="text-[11px] font-medium text-muted-foreground">{f.label}</dt>
              <dd className="whitespace-pre-wrap break-words text-[13px] text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

// ── Formulário ────────────────────────────────────────────────────────────────

export function RdMigrationForm({ initial }: { initial: RdMigrationDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [values, setValues] = useState<RdMigrationValues>(initial.values);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [foraOpen, setForaOpen] = useState(false);
  const [foraMotivo, setForaMotivo] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);

  const disabled = !detail.canEdit || saving;
  const requirements = useMemo(
    () =>
      detail.stage && detail.requirements
        ? computeRdMigrationRequirements({
            stage: detail.stage,
            values,
            fieldDefinitions: detail.requirements.fieldDefinitions,
            responsibleAppUserId: detail.responsible?.appUserId ?? null,
          })
        : null,
    [detail.stage, detail.requirements, detail.responsible, values],
  );
  const missingKeys = useMemo(() => new Set(requirements?.missing.map((i) => i.key) ?? []), [requirements]);
  const isMissing = (key: string) => missingKeys.has(key);
  const needs = requirements?.needs ?? null;

  const patch: Patch = (mutate) => {
    setValues((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
    setDirty(true);
  };

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/crm/rd-migration/${encodeURIComponent(detail.opportunityId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values, expectedUpdatedAt: detail.updatedAt }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: RdMigrationDetail;
        warnings?: string[];
      };
      if (!res.ok || data.ok === false || !data.detail) throw new Error(data.error ?? "Não foi possível salvar.");
      setDetail(data.detail);
      setValues(data.detail.values);
      setDirty(false);
      const concluded = data.detail.status === "concluida";
      setNotice({
        tone: data.warnings?.length ? "warn" : "ok",
        text: [
          concluded
            ? "Migração concluída: o lead segue normalmente no CRM."
            : data.detail.converted
              ? "Salvo no CRM."
              : "Rascunho salvo. Na virada, o lead entra no CRM com estes dados.",
          ...(data.warnings ?? []),
        ].join(" "),
      });
      if (concluded) router.refresh();
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function adminPatch(body: Record<string, unknown>) {
    setAdminBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/crm/rd-migration/${encodeURIComponent(detail.opportunityId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; detail?: RdMigrationDetail };
      if (!res.ok || data.ok === false || !data.detail) throw new Error(data.error ?? "Não foi possível alterar.");
      setDetail(data.detail);
      if (!dirty) setValues(data.detail.values);
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível alterar." });
    } finally {
      setAdminBusy(false);
    }
  }

  async function convertNow() {
    setAdminBusy(true);
    setNotice(null);
    try {
      if (dirty) await save();
      const res = await fetch(`/api/crm/rd-migration/${encodeURIComponent(detail.opportunityId)}/convert`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        result?: { outcome: string; reason?: string; warnings?: string[] };
      };
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Não foi possível converter.");
      if (data.result?.outcome === "skipped") throw new Error(`Não convertido: ${data.result.reason ?? "fora da migração"}.`);
      setNotice({ tone: "ok", text: ["Lead convertido: agora ele anda no CRM.", ...(data.result?.warnings ?? [])].join(" ") });
      router.refresh();
      const fresh = await fetch(`/api/crm/rd-migration/${encodeURIComponent(detail.opportunityId)}`).then((r) => r.json());
      if (fresh?.detail) {
        setDetail(fresh.detail);
        setValues(fresh.detail.values);
        setDirty(false);
      }
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "Não foi possível converter." });
    } finally {
      setAdminBusy(false);
    }
  }

  const displayStatus = rdMigrationDisplayStatus({
    status: detail.status,
    readyForConversion: requirements?.readyForConversion ?? false,
  });
  const userLabels = Object.fromEntries(detail.users.map((u) => [u.id, u.fullName]));
  const leadHref = `/crm/leads/${encodeURIComponent(detail.opportunityId)}`;
  const pendingCount = detail.converted
    ? (requirements?.missing.length ?? 0)
    : (requirements?.missingBeforeConversion.length ?? 0);

  return (
    <div id="topo" className="space-y-5">
      <div className="flex flex-col gap-3">
        <Link
          href="/crm/migracao-rd"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Migrar do RD
        </Link>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">{detail.nome}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <RdMigrationStatusBadge status={displayStatus} />
              <span>
                {detail.rdStageLabel ?? "Etapa do RD desconhecida"}
                {detail.stageLabel ? (
                  <>
                    <ArrowRight className="mx-1.5 inline size-3.5" aria-hidden />
                    <span className="text-foreground">{detail.stageLabel}</span>
                  </>
                ) : null}
              </span>
              <span aria-hidden>·</span>
              <span>
                Responsável:{" "}
                {detail.responsible ? (
                  <span className="text-foreground">{detail.responsible.fullName}</span>
                ) : (
                  <span className="text-warning-text">sem responsável</span>
                )}
                {detail.responsible?.origem === "dono_rd" ? " (dono do negócio no RD)" : ""}
              </span>
            </div>
          </div>
          {detail.converted ? (
            <Link href={leadHref} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}>
              Abrir ficha do lead
            </Link>
          ) : null}
        </div>
      </div>

      {detail.schemaPending ? (
        <Alert className="border-warning-border bg-warning-bg">
          <AlertTitle className="text-warning-text">Migração ainda não habilitada no banco</AlertTitle>
          <AlertDescription>Falta aplicar a migration 20261019120000_rd_migracao.sql; o formulário não grava.</AlertDescription>
        </Alert>
      ) : null}
      {detail.outOfScopeReason ? (
        <Alert>
          <AlertTitle>Fora da migração</AlertTitle>
          <AlertDescription>{detail.outOfScopeReason}</AlertDescription>
        </Alert>
      ) : null}
      {detail.duplicate && detail.status !== "fora" ? (
        <Alert className={detail.duplicate.suggested ? "border-info-border bg-info-bg" : "border-danger-border bg-danger-bg"}>
          <AlertTitle className={detail.duplicate.suggested ? "text-info-text" : "text-danger-text"}>
            Mesmo cliente em outro negócio do RD
          </AlertTitle>
          <AlertDescription>
            <p>
              {detail.duplicate.reason === "documento" ? "O mesmo CPF/CNPJ" : "O mesmo nome"} aparece em{" "}
              {detail.duplicate.others.map((o, i) => (
                <span key={o.opportunityId}>
                  {i > 0 ? ", " : ""}
                  <Link href={`/crm/migracao-rd/${encodeURIComponent(o.opportunityId)}`} className="font-medium underline">
                    {o.nome}
                  </Link>{" "}
                  ({o.stageLabel ?? "fora da migração"})
                </span>
              ))}
              . Converter os dois criaria dois leads para o mesmo cliente, por isso a conversão em lote pula estes negócios.
            </p>
            <p className="mt-1">
              {detail.duplicate.suggested
                ? "Sugestão: migrar este (etapa mais adiantada) e tirar os outros da migração."
                : "Sugestão: tirar este da migração e completar o outro, que está mais adiantado."}
              {detail.isAdmin ? "" : " Quem decide é o admin."}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.status === "fora" ? (
        <Alert>
          <AlertTitle>Tirado da migração pelo admin</AlertTitle>
          <AlertDescription>{detail.motivoFora ?? "Sem motivo informado."} O negócio fica no RD.</AlertDescription>
        </Alert>
      ) : null}
      {detail.status === "concluida" ? (
        <Alert className="border-success-border bg-success-bg">
          <AlertTitle className="text-success-text">Migração concluída</AlertTitle>
          <AlertDescription>
            O lead anda normalmente no CRM. Ajustes daqui em diante são feitos na{" "}
            <Link href={leadHref} className="font-medium underline">
              ficha do lead
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {detail.isAdmin && !detail.schemaPending ? (
        <section className="flex flex-col gap-3 rounded-(--radius-v2-xl) border border-neutral-200 bg-neutral-50 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="w-full max-w-sm space-y-1.5">
            <Label htmlFor="responsavel">Responsável (admin)</Label>
            <Select
              value={detail.responsible?.appUserId ?? null}
              disabled={adminBusy || detail.status === "concluida"}
              onValueChange={(v) => void adminPatch({ responsavelAppUserId: v ? String(v) : null })}
            >
              <SelectTrigger id="responsavel" className="w-full bg-white">
                <CrmSelectValue value={detail.responsible?.appUserId ?? ""} labels={userLabels} placeholder="Escolher responsável" />
              </SelectTrigger>
              <CrmSelectContent>
                {detail.users.map((u) => (
                  <CrmSelectItem key={u.id} value={u.id}>
                    {u.fullName}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {!detail.converted && detail.status !== "fora" ? (
              <>
                <Button type="button" variant="secondary" size="sm" disabled={adminBusy} onClick={() => setForaOpen(true)}>
                  Tirar da migração
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={adminBusy || !detail.stage}
                  onClick={() => setConvertOpen(true)}
                >
                  {adminBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Converter agora
                </Button>
              </>
            ) : null}
            {detail.status === "fora" ? (
              <Button type="button" variant="secondary" size="sm" disabled={adminBusy} onClick={() => void adminPatch({ fora: false })}>
                Voltar para a migração
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {detail.stage ? (
            <>
              <CadastroSection
                values={values}
                patch={patch}
                disabled={disabled}
                isMissing={isMissing}
                showDueDates={values.cadastro.dueDiligence === "Sim"}
                showMeeting
              />

              {needs?.proposta ? (
                <Section
                  id="proposta"
                  title="Elaboração da proposta"
                  description="Endereço separado (CEP, logradouro, número), áreas e escopo pelo catálogo: o contrato do CRM é montado com isso."
                >
                  <ConfeccaoReuniaoModalSection
                    gestorField={detail.gestorField}
                    empresasIntake={empresasIntakeFromCadastro(values)}
                    customValues={values.campos}
                    disabled={disabled}
                    onFieldChange={(code, value) =>
                      patch((d) => {
                        d.campos[code] = value;
                      })
                    }
                  />
                  {(requirements?.fieldDefinitions.length ?? 0) > 0 ? (
                    <div className="grid gap-4 border-t border-neutral-200 pt-4 sm:grid-cols-2">
                      {requirements!.fieldDefinitions.map((def) => (
                        <Field
                          key={def.field_code}
                          label={def.label.replace(/\s*\[CP\]\s*$/i, "")}
                          required={def.is_required}
                          source={values.sources[`campos.${def.field_code}`]}
                          missing={isMissing(`campos.${def.field_code}`)}
                        >
                          <fieldset disabled={disabled} className="contents">
                            <DynamicField
                              field={def}
                              value={values.campos[def.field_code]}
                              onChange={(code, value) =>
                                patch((d) => {
                                  d.campos[code] = value;
                                })
                              }
                            />
                          </fieldset>
                        </Field>
                      ))}
                    </div>
                  ) : null}
                </Section>
              ) : null}

              {needs && (needs.linkProposta || needs.linkContrato || needs.d4sign || needs.dataAssinatura) ? (
                <Section
                  id="evidencias"
                  title="Documentos do RD"
                  description="As etapas que o negócio já cumpriu no RD valem pelos links do SharePoint; não é preciso gerar de novo no CRM."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    {needs.linkProposta ? (
                      <Field
                        label="Link da proposta enviada"
                        htmlFor="link-proposta"
                        required={needs.linkProposta === "required"}
                        source={values.sources["evidencias.linkProposta"]}
                        missing={isMissing("evidencias.linkProposta")}
                      >
                        <Input
                          id="link-proposta"
                          value={values.evidencias.linkProposta}
                          disabled={disabled}
                          placeholder="https://…sharepoint.com/…"
                          onChange={(e) => patch((d) => void (d.evidencias.linkProposta = e.target.value))}
                        />
                      </Field>
                    ) : null}
                    {needs.linkContrato ? (
                      <Field
                        label="Link do contrato elaborado"
                        htmlFor="link-contrato"
                        required={needs.linkContrato === "required"}
                        source={values.sources["evidencias.linkContrato"]}
                        missing={isMissing("evidencias.linkContrato")}
                      >
                        <Input
                          id="link-contrato"
                          value={values.evidencias.linkContrato}
                          disabled={disabled}
                          placeholder="https://…sharepoint.com/…"
                          onChange={(e) => patch((d) => void (d.evidencias.linkContrato = e.target.value))}
                        />
                      </Field>
                    ) : null}
                    {needs.dataAssinatura ? (
                      <Field
                        label="Data de assinatura do contrato"
                        required
                        source={values.sources["evidencias.dataAssinatura"]}
                        missing={isMissing("evidencias.dataAssinatura")}
                      >
                        <DateInputBr
                          value={values.evidencias.dataAssinatura}
                          disabled={disabled}
                          onChange={(ymd) => patch((d) => void (d.evidencias.dataAssinatura = ymd))}
                        />
                      </Field>
                    ) : null}
                  </div>
                  {needs.d4sign ? (
                    <D4SignPicker
                      values={values}
                      patch={patch}
                      disabled={disabled}
                      required={needs.d4sign === "required"}
                      missing={isMissing("evidencias.d4signDocumentUuid")}
                    />
                  ) : null}
                </Section>
              ) : null}

              {needs?.investimento ? (
                <Section id="investimento" title="Escopo e investimento" description="O contrato do CRM usa o investimento da proposta pelo catálogo.">
                  {detail.converted ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 text-sm">
                        {isMissing("investimento") ? (
                          <>
                            <CircleAlert className="size-4 text-warning-text" aria-hidden />
                            Falta preencher o investimento na aba Proposta.
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="size-4 text-success-text" aria-hidden />
                            Investimento preenchido.
                          </>
                        )}
                      </p>
                      <Link
                        href={`${leadHref}?tab=proposal`}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0")}
                      >
                        <FileSignature className="size-4" aria-hidden />
                        Abrir a proposta
                      </Link>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Depois da virada, preencha o investimento na aba Proposta da ficha do lead (o editor da proposta só abre
                      para leads do CRM). Até lá isso não bloqueia o rascunho.
                    </p>
                  )}
                </Section>
              ) : null}

              {needs?.onboarding ? (
                <Section
                  id="pos_venda"
                  title="Cadastro do cliente e faturamento"
                  description={
                    needs.onboarding === "required"
                      ? "Pré-preenchido com [CADASTRO] e [FINANCEIRO] do RD. Operações Legais e o Financeiro seguem a partir daqui."
                      : "Pré-preenchido com o RD. Na virada vira o rascunho da aba Cadastro, que o responsável completa e envia a Operações Legais."
                  }
                >
                  {needs.onboarding === "draft" && detail.converted ? (
                    <Link href={`${leadHref}?tab=onboarding`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
                      Abrir a aba Cadastro
                    </Link>
                  ) : (
                    <ClientOnboardingForm
                      payload={values.onboarding}
                      readOnly={disabled}
                      onChange={(next) =>
                        patch((d) => {
                          d.onboarding = next;
                        })
                      }
                    />
                  )}
                </Section>
              ) : null}
            </>
          ) : null}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {requirements ? <PendenciasPanel items={requirements.items} converted={detail.converted} /> : null}
          <RdFieldsPanel fields={detail.rdFields} rdDealUrl={detail.rdDealUrl} rdUpdatedAt={detail.rdUpdatedAt} />
        </aside>
      </div>

      {detail.canEdit ? (
        <div className="sticky bottom-3 z-(--z-sticky) rounded-(--radius-v2-xl) border border-neutral-200 bg-white px-4 py-3 shadow-(--shadow-v2-sm)">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p
              role="status"
              className={cn(
                "text-sm",
                notice?.tone === "error"
                  ? "text-danger-text"
                  : notice?.tone === "warn"
                    ? "text-warning-text"
                    : notice?.tone === "ok"
                      ? "text-success-text"
                      : "text-muted-foreground",
              )}
            >
              {notice?.text ??
                (pendingCount === 0
                  ? detail.converted
                    ? "Tudo preenchido: salvar conclui a migração."
                    : "Tudo pronto para a virada."
                  : `${pendingCount} ${pendingCount === 1 ? "pendência" : "pendências"}${detail.converted ? "" : " antes da virada"}.`)}
            </p>
            <Button type="button" onClick={() => void save()} disabled={saving || (!dirty && !detail.converted)}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {detail.converted ? (pendingCount === 0 ? "Salvar e concluir" : "Salvar no CRM") : "Salvar rascunho"}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={foraOpen} onOpenChange={setForaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar da migração?</AlertDialogTitle>
            <AlertDialogDescription>
              O negócio fica no RD e não vira lead do CRM na virada (ex.: parado há meses, já encerrado na prática).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={foraMotivo}
            onChange={(e) => setForaMotivo(e.target.value)}
            placeholder="Motivo (aparece na fila)"
            rows={3}
            aria-label="Motivo"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={foraMotivo.trim().length < 3}
              onClick={() => {
                setForaOpen(false);
                void adminPatch({ fora: { motivo: foraMotivo.trim() } });
              }}
            >
              Tirar da migração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Converter este negócio agora?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele vira lead do CRM em {detail.stageLabel ?? "sua etapa"} e o sync do RD deixa de alterá-lo. Use para o piloto
              ou para corrigir depois da virada; a conversão de todos é feita na fila.
              {pendingCount > 0 ? ` Ainda há ${pendingCount} pendências: o lead não avança até completar.` : ""}
              {detail.duplicate
                ? ` O mesmo cliente está em outro negócio da fila (${detail.duplicate.others.map((o) => o.nome).join(", ")}): tire o outro da migração para não criar dois leads.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConvertOpen(false);
                void convertNow();
              }}
            >
              Converter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
