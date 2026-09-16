"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, RotateCcw, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PracticeAreaIconBadge } from "@/lib/crm/area-lucide-icon";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { DateInputBr } from "@/components/ui/date-input-br";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { Input } from "@/components/ui/input";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";

const YES_NO_LABELS = { Sim: "Sim", Não: "Não" } as const;
import { formatDateYmdBr, formatMaybeDateLikeBr, normalizeTimeToHm } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";
import {
  type ResolvedAppUser,
} from "@/lib/crm/resolve-app-user-display";
import {
  indicationTypes,
  leadAreas,
  leadTypes,
} from "@/modules/crm/application/services/new-lead-payload";

export type LeadFieldEditorKind =
  | "text"
  | "textarea"
  | "date"
  | "time"
  | "email"
  | "yesno"
  | "leadType"
  | "indicationType"
  | "indicationName"
  /** @deprecated use `multiselect` + `selectOptions={leadAreas}` */
  | "areas"
  | "select"
  | "multiselect"
  | "user"
  | "percent"
  | "number"
  | "phone"
  | "url";

interface LeadDetailFieldEditorProps {
  leadId: string;
  scope: "intake" | "rd" | "pipeline";
  fieldKey: string;
  /** Com `scope="pipeline"`: id em `field_definitions` (gravação em `field_values`). */
  fieldDefinitionId?: string;
  label: string;
  value: string;
  kind?: LeadFieldEditorKind;
  /** Opções para `select` / `multiselect` (pipeline ou catálogo RD). */
  selectOptions?: string[];
  /** Só para campos RD: mostra selo e opção de reverter sobreposição. */
  valueSource?: "rd" | "crm";
  /** Oculta o rótulo superior (ex.: edição só com ícone no título). */
  omitLabel?: boolean;
  /** Quando o valor é `app_users.id`, exibe nome + avatar em vez do UUID. */
  resolvedUser?: ResolvedAppUser;
  /**
   * `uuid` (default): valor = `app_users.id` (pipeline / RD user).
   * `email`: valor = e-mail (intake: solicitante / cadastrado por); PATCH grava e-mail.
   */
  userIdentityMode?: "uuid" | "email";
  /** Para identidade interna, impede e-mail livre e exige uma opção de `app_users`. */
  allowExternalUser?: boolean;
  /** Ícone semântico exibido junto ao rótulo do campo. */
  labelIcon?: LucideIcon;
  /** Tipo escolhido no campo irmão, usado para definir o catálogo da indicação. */
  indicationType?: string;
  /** `row` integra o campo numa Surface maior, sem criar um mini-card aninhado. */
  displayVariant?: "card" | "row";
  className?: string;
  onAfterSave?: (savedValue: string) => void;
}

type AppUserOption = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
};

type LeadFormOptionsPayload = {
  orqestraiCollaborators?: Array<{
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
  }>;
  registeredIndicators?: string[];
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function formatBrazilPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function parseMultiselectStored(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeYesNoForSelect(raw: string): "Sim" | "Não" {
  const t = raw.trim().toLowerCase();
  if (t === "sim" || t === "s" || t === "yes") return "Sim";
  return "Não";
}

function normalizeYesNoLabel(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "sim" || t === "s" || t === "yes") return "Sim";
  if (t === "não" || t === "nao" || t === "n" || t === "no") return "Não";
  return raw;
}

function looksLikeJsonObject(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

function looksLikeUuid(raw: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.trim());
}

function multiselectOptionsForKind(
  kind: LeadFieldEditorKind,
  selectOptions: string[] | undefined,
): string[] {
  if (kind === "areas") return [...leadAreas];
  return selectOptions ?? [];
}

/** Mapeia `field_definitions` → editor (mesmos padrões do `DynamicForm`). */
export function pipelineFieldToEditorProps(field: {
  fieldType: string;
  fieldOptions: string[] | null;
}): { kind: LeadFieldEditorKind; selectOptions?: string[] } {
  const opts = field.fieldOptions;
  switch (field.fieldType) {
    case "select":
      if (!opts?.length) return { kind: "text" };
      return { kind: "select", selectOptions: opts };
    case "multiselect":
      if (!opts?.length) return { kind: "textarea" };
      return { kind: "multiselect", selectOptions: opts };
    case "user":
      return { kind: "user" };
    case "percent":
      return { kind: "percent" };
    case "number":
      return { kind: "number" };
    case "phone":
      return { kind: "phone" };
    case "url":
      return { kind: "url" };
    case "date":
    case "date_br":
      return { kind: "date" };
    case "time":
      return { kind: "time" };
    case "textarea":
      return { kind: "textarea" };
    case "email":
      return { kind: "email" };
    default:
      return { kind: "text" };
  }
}

function UserAvatarName({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null | undefined;
}) {
  return (
    <CrmUserLabel
      name={name}
      avatarUrl={avatarUrl}
      size="sm"
      variant="inline"
      className="w-full flex-1"
      nameClassName="font-medium"
    />
  );
}

export function LeadDetailFieldEditor({
  leadId,
  scope,
  fieldKey,
  fieldDefinitionId,
  label,
  value,
  kind = scope === "rd" ? "textarea" : "text",
  selectOptions,
  valueSource,
  omitLabel,
  resolvedUser,
  userIdentityMode = "uuid",
  allowExternalUser = true,
  labelIcon: LabelIcon,
  indicationType,
  displayVariant = "card",
  className,
  onAfterSave,
}: LeadDetailFieldEditorProps) {
  const [editing, setEditing] = useState(false);
  const [committedValue, setCommittedValue] = useState(value);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [appUsers, setAppUsers] = useState<AppUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [registeredIndicators, setRegisteredIndicators] = useState<string[]>([]);
  const [indicationOptionsLoading, setIndicationOptionsLoading] = useState(false);

  useEffect(() => {
    setCommittedValue(value);
  }, [value]);

  const msOptions = multiselectOptionsForKind(kind, selectOptions);

  useEffect(() => {
    if (kind !== "user") return;
    let cancelled = false;
    setUsersLoading(true);
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((json: { data?: AppUserOption[] }) => {
        if (!cancelled) setAppUsers(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setAppUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  useEffect(() => {
    if (kind !== "indicationName") return;
    let cancelled = false;
    setIndicationOptionsLoading(true);
    fetch("/api/crm/lead-form-options", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { data?: LeadFormOptionsPayload }) => {
        if (cancelled) return;
        setAppUsers(
          (json.data?.orqestraiCollaborators ?? []).map((user) => ({
            id: user.id,
            full_name: user.name,
            avatar_url: user.avatarUrl,
            email: user.email,
          })),
        );
        setRegisteredIndicators(json.data?.registeredIndicators ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setAppUsers([]);
        setRegisteredIndicators([]);
      })
      .finally(() => {
        if (!cancelled) setIndicationOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const isCollaboratorIndication = indicationType?.trim().toLowerCase() === "colaborador";
  const selectedIndicationUser = useMemo(() => {
    if (kind !== "indicationName" || !isCollaboratorIndication) return null;
    const normalizedDraft = draft.trim().toLocaleLowerCase("pt-BR");
    return (
      appUsers.find(
        (user) => user.full_name.trim().toLocaleLowerCase("pt-BR") === normalizedDraft,
      ) ?? null
    );
  }, [appUsers, draft, isCollaboratorIndication, kind]);
  const committedIndicationUser = useMemo(() => {
    if (kind !== "indicationName" || !isCollaboratorIndication) return null;
    const normalizedValue = committedValue.trim().toLocaleLowerCase("pt-BR");
    return (
      appUsers.find(
        (user) => user.full_name.trim().toLocaleLowerCase("pt-BR") === normalizedValue,
      ) ?? null
    );
  }, [appUsers, committedValue, isCollaboratorIndication, kind]);
  const indicationCatalog = useMemo(() => {
    const unique = new Set(registeredIndicators.map((item) => item.trim()).filter(Boolean));
    return [...unique].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registeredIndicators]);

  const selectedAppUser = useMemo(() => {
    if (kind !== "user") return null;
    if (userIdentityMode === "email") {
      const d = draft.trim().toLowerCase();
      return appUsers.find((u) => (u.email ?? "").trim().toLowerCase() === d) ?? null;
    }
    return appUsers.find((u) => u.id === draft) ?? null;
  }, [appUsers, draft, kind, userIdentityMode]);

  const committedAppUser = useMemo(() => {
    if (kind !== "user") return null;
    if (userIdentityMode === "email") {
      const email = committedValue.trim().toLowerCase();
      return appUsers.find((user) => (user.email ?? "").trim().toLowerCase() === email) ?? null;
    }
    return appUsers.find((user) => user.id === committedValue) ?? null;
  }, [appUsers, committedValue, kind, userIdentityMode]);

  const displayedResolvedUser =
    committedAppUser != null
      ? {
          fullName: committedAppUser.full_name,
          avatarUrl: committedAppUser.avatar_url,
        }
      : resolvedUser;

  const usersWithEmail = useMemo(
    () => appUsers.filter((u): u is AppUserOption & { email: string } => Boolean(u.email?.trim())),
    [appUsers],
  );

  const emailSelectValue = useMemo(() => {
    if (kind !== "user" || userIdentityMode !== "email") return undefined;
    const d = draft.trim().toLowerCase();
    const u = usersWithEmail.find((x) => x.email.toLowerCase() === d);
    return u?.email;
  }, [kind, userIdentityMode, draft, usersWithEmail]);

  const selectOptsEffective = useMemo(() => {
    const base = selectOptions ?? [];
    if (kind !== "select") return base;
    if (draft && !base.includes(draft)) return [draft, ...base];
    return base;
  }, [kind, selectOptions, draft]);

  function toggleMultiselectOption(opt: string) {
    const opts = multiselectOptionsForKind(kind, selectOptions);
    const cur = parseMultiselectStored(draft);
    const set = new Set(cur);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    const ordered = opts.filter((o) => set.has(o));
    const extras = cur.filter((c) => !opts.includes(c));
    setDraft([...ordered, ...extras].join(", "));
  }

  const startEdit = () => {
    setDraft(committedValue);
    setEditing(true);
    setError(null);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(committedValue);
    setError(null);
  };

  async function submit(nextValue: string) {
    setSaving(true);
    setError(null);
    try {
      const body =
        scope === "intake"
          ? { intakeField: { key: fieldKey, value: nextValue } }
          : scope === "rd"
            ? { rdField: { key: fieldKey, value: nextValue } }
            : fieldDefinitionId
              ? { pipelineField: { fieldDefinitionId, value: nextValue } }
              : null;
      if (!body) {
        throw new Error("Campo de pipeline sem fieldDefinitionId.");
      }
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Não foi possível salvar.");
      }
      setCommittedValue(nextValue);
      setEditing(false);
      onAfterSave?.(nextValue);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    await submit(draft);
  }

  async function revertRdOverride() {
    await submit("");
  }

  const showRdBadge = scope === "rd" && valueSource === "crm";

  return (
    <div
      className={cn(
        omitLabel
          ? ""
          : displayVariant === "row"
            ? "min-w-0 bg-white px-4 py-3.5"
            : "rounded-(--radius-v2-md) border border-neutral-200 bg-white p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {!omitLabel ? (
          <p
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium text-muted-foreground",
              displayVariant === "card" && "uppercase tracking-wide",
            )}
          >
            {LabelIcon ? <LabelIcon className="size-3.5 shrink-0" aria-hidden /> : null}
            {label}
          </p>
        ) : (
          <span className="sr-only">{label}</span>
        )}
        {!editing ? (
          <div className="flex shrink-0 items-center gap-1">
            {showRdBadge ? (
              <span className="rounded-(--radius-v2-sm) bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold text-info-text">
                Ajustado no CRM
              </span>
            ) : null}
            {showRdBadge ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                title="Restaurar valor vindo do RD"
                onClick={() => void revertRdOverride()}
                disabled={saving}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Editar"
              onClick={startEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      {!editing ? (
        kind === "indicationName" &&
        isCollaboratorIndication &&
        committedIndicationUser &&
        committedValue ? (
          <CrmUserLabel
            name={committedIndicationUser.full_name}
            avatarUrl={committedIndicationUser.avatar_url}
            size="sm"
            variant="inline"
            className="mt-1"
            nameClassName="font-medium"
          />
        ) : displayedResolvedUser && committedValue ? (
          <CrmUserLabel
            name={displayedResolvedUser.fullName}
            avatarUrl={displayedResolvedUser.avatarUrl}
            size={displayVariant === "row" ? "sm" : "md"}
            variant={userIdentityMode === "email" ? "stacked" : "inline"}
            sublabel={userIdentityMode === "email" ? committedValue : undefined}
            className="mt-1"
            nameClassName="font-medium"
          />
        ) : kind === "yesno" && committedValue ? (
          <p className="mt-1 text-sm font-medium text-foreground">{normalizeYesNoLabel(committedValue)}</p>
        ) : kind === "multiselect" || kind === "areas" ? (
          parseMultiselectStored(committedValue).length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {parseMultiselectStored(committedValue).map((p) => (
                <span
                  key={p}
                  className={cn(
                    "inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 text-xs font-medium text-foreground",
                    fieldKey === "areas_analise" ? "gap-1.5 py-1 pl-1 pr-2.5" : "px-2.5 py-0.5",
                  )}
                >
                  {fieldKey === "areas_analise" ? (
                    <PracticeAreaIconBadge area={p} size="xs" />
                  ) : null}
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-foreground">—</p>
          )
        ) : kind === "select" && committedValue ? (
          <p className="mt-1 text-sm text-foreground break-words">
            {looksLikeUuid(committedValue) ? "Valor técnico não resolvido" : committedValue}
          </p>
        ) : kind === "user" && committedValue && !resolvedUser ? (
          <p
            className={
              userIdentityMode === "email"
                ? "mt-1 text-sm text-foreground break-all"
                : "mt-1 font-mono text-xs text-muted-foreground break-all"
            }
          >
            {looksLikeUuid(committedValue) ? "Usuário não localizado" : committedValue}
          </p>
        ) : (
          <p className="mt-1 text-sm text-foreground break-words whitespace-pre-wrap">
            {committedValue
              ? kind === "date"
                ? formatDateYmdBr(committedValue.slice(0, 10)) || committedValue
                : kind === "time"
                  ? normalizeTimeToHm(committedValue) || committedValue
                  : scope === "rd"
                    ? formatMaybeDateLikeBr(committedValue)
                    : looksLikeJsonObject(committedValue)
                      ? "Dados estruturados salvos"
                      : committedValue
              : "—"}
          </p>
        )
      ) : (
        <div className="mt-2 space-y-2">
          {kind === "textarea" ? (
            <textarea
              className="flex min-h-[88px] w-full rounded-(--radius-v2-md) border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive-600/25"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
            />
          ) : null}
          {kind === "text" || kind === "email" ? (
            <Input
              type={kind === "email" ? "email" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              className="bg-white"
            />
          ) : null}
          {kind === "date" ? (
            <DateInputBr
              value={draft.slice(0, 10)}
              onChange={(ymd) => setDraft(ymd)}
              disabled={saving}
              className="bg-white"
            />
          ) : null}
          {kind === "time" ? (
            <TimeInputBr
              value={draft}
              onChange={(hm) => setDraft(hm)}
              disabled={saving}
              className="bg-white"
            />
          ) : null}
          {kind === "yesno" ? (
            <Select
              value={normalizeYesNoForSelect(draft)}
              onValueChange={(v) => setDraft(v === "Sim" ? "Sim" : "Não")}
              disabled={saving}
            >
              <SelectTrigger className="bg-white">
                <CrmSelectValue
                  value={normalizeYesNoForSelect(draft)}
                  labels={YES_NO_LABELS}
                />
              </SelectTrigger>
              <CrmSelectContent>
                <CrmSelectItem value="Sim">Sim</CrmSelectItem>
                <CrmSelectItem value="Não">Não</CrmSelectItem>
              </CrmSelectContent>
            </Select>
          ) : null}
          {kind === "select" && selectOptsEffective.length > 0 ? (
            <Select
              modal={false}
              value={selectOptsEffective.includes(draft) ? draft : undefined}
              onValueChange={(v) => setDraft(v ?? "")}
              disabled={saving}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <CrmSelectContent className="max-h-[min(280px,50dvh)]">
                {selectOptsEffective.map((opt) => (
                  <CrmSelectItem key={opt} value={opt}>
                    {opt}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          ) : null}
          {(kind === "multiselect" || kind === "areas") && msOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {msOptions.map((opt) => {
                const active = parseMultiselectStored(draft).includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleMultiselectOption(opt)}
                    disabled={saving}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
                      active
                        ? "border-brand-navy bg-brand-navy text-white"
                        : "border-neutral-200 bg-white text-muted-foreground hover:bg-neutral-50",
                    )}
                  >
                    {fieldKey === "areas_analise" ? (
                      <PracticeAreaIconBadge area={opt} size="xs" className="mr-1.5 align-middle" />
                    ) : null}
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : null}
          {kind === "user" ? (
            userIdentityMode === "email" ? (
              <div className="space-y-2">
                <Select
                  modal={false}
                  value={emailSelectValue}
                  onValueChange={(v) => setDraft(v ?? "")}
                  disabled={saving || usersLoading}
                >
                  <SelectTrigger className="h-auto min-h-9 w-full min-w-0 bg-white py-1.5 [&_[data-slot=select-value]]:w-full [&_[data-slot=select-value]]:min-w-0">
                    {usersLoading ? (
                      <span className="text-muted-foreground">Carregando usuários…</span>
                    ) : draft && selectedAppUser ? (
                      <UserAvatarName
                        name={selectedAppUser.full_name}
                        avatarUrl={selectedAppUser.avatar_url}
                      />
                    ) : draft && draft.includes("@") && !selectedAppUser ? (
                      <span className="truncate text-sm text-foreground">{draft}</span>
                    ) : draft && !selectedAppUser ? (
                      <span className="truncate text-muted-foreground">E-mail não associado a um usuário</span>
                    ) : (
                      <SelectValue placeholder="Selecione o usuário…" />
                    )}
                  </SelectTrigger>
                  <CrmSelectContent className="max-h-72">
                    {usersWithEmail.map((u) => (
                      <CrmSelectItem key={u.id} value={u.email} className="py-1.5">
                        <UserAvatarName name={u.full_name} avatarUrl={u.avatar_url} />
                      </CrmSelectItem>
                    ))}
                  </CrmSelectContent>
                </Select>
                {allowExternalUser ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      Ou digite um e-mail que não esteja na lista (ex.: contato externo).
                    </p>
                    <Input
                      type="email"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={saving}
                      className="bg-white"
                      placeholder="nome@empresa.com.br"
                    />
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Somente utilizadores ativos do CRM podem ser selecionados.
                  </p>
                )}
              </div>
            ) : (
              <Select
                modal={false}
                value={draft}
                onValueChange={(v) => setDraft(v ?? "")}
                disabled={saving || usersLoading}
              >
                <SelectTrigger className="h-auto min-h-9 w-full min-w-0 bg-white py-1.5 [&_[data-slot=select-value]]:w-full [&_[data-slot=select-value]]:min-w-0">
                  {usersLoading ? (
                    <span className="text-muted-foreground">Carregando usuários…</span>
                  ) : draft && selectedAppUser ? (
                    <UserAvatarName
                      name={selectedAppUser.full_name}
                      avatarUrl={selectedAppUser.avatar_url}
                    />
                  ) : draft && !selectedAppUser ? (
                    <span className="truncate text-muted-foreground">Utilizador indisponível</span>
                  ) : (
                    <SelectValue placeholder="Selecione…" />
                  )}
                </SelectTrigger>
                <CrmSelectContent className="max-h-72">
                  {appUsers.map((u) => (
                    <CrmSelectItem key={u.id} value={u.id} className="py-1.5">
                      <UserAvatarName name={u.full_name} avatarUrl={u.avatar_url} />
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>
            )
          ) : null}
          {kind === "percent" ? (
            <div className="relative">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={saving}
                placeholder="0"
                className="bg-white pr-8"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          ) : null}
          {kind === "number" ? (
            <Input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              placeholder="0"
              className="bg-white"
            />
          ) : null}
          {kind === "phone" ? (
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={draft}
              onChange={(e) => {
                const formatted = formatBrazilPhoneDisplay(digitsOnly(e.target.value));
                setDraft(formatted);
              }}
              disabled={saving}
              placeholder="(11) 99999-9999"
              className="bg-white"
            />
          ) : null}
          {kind === "url" ? (
            <Input
              type="url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={saving}
              placeholder="https://…"
              className="bg-white"
            />
          ) : null}
          {kind === "leadType" ? (
            <Select value={draft} onValueChange={(v) => setDraft(v ?? "")} disabled={saving}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <CrmSelectContent>
                {leadTypes.map((t) => (
                  <CrmSelectItem key={t} value={t}>
                    {t}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          ) : null}
          {kind === "indicationType" ? (
            <Select
              value={draft || "__empty__"}
              onValueChange={(v) => setDraft(v === "__empty__" || v == null ? "" : v)}
              disabled={saving}
            >
              <SelectTrigger className="bg-white">
                <CrmSelectValue
                  value={draft || "__empty__"}
                  labels={{
                    __empty__: "(vazio)",
                    ...Object.fromEntries(indicationTypes.map((t) => [t, t])),
                  }}
                  placeholder="Tipo de indicação"
                />
              </SelectTrigger>
              <CrmSelectContent>
                <CrmSelectItem value="__empty__">(vazio)</CrmSelectItem>
                {indicationTypes.map((t) => (
                  <CrmSelectItem key={t} value={t}>
                    {t}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          ) : null}
          {kind === "indicationName" ? (
            <Select
              modal={false}
              value={
                isCollaboratorIndication
                  ? selectedIndicationUser?.full_name
                  : indicationCatalog.includes(draft)
                    ? draft
                    : undefined
              }
              onValueChange={(nextValue) => setDraft(nextValue ?? "")}
              disabled={saving || indicationOptionsLoading}
            >
              <SelectTrigger className="h-auto min-h-9 w-full min-w-0 bg-white py-1.5 [&_[data-slot=select-value]]:w-full [&_[data-slot=select-value]]:min-w-0">
                {indicationOptionsLoading ? (
                  <span className="text-muted-foreground">Carregando opções…</span>
                ) : isCollaboratorIndication && selectedIndicationUser ? (
                  <UserAvatarName
                    name={selectedIndicationUser.full_name}
                    avatarUrl={selectedIndicationUser.avatar_url}
                  />
                ) : (
                  <CrmSelectValue
                    value={indicationCatalog.includes(draft) ? draft : null}
                    labels={Object.fromEntries(indicationCatalog.map((name) => [name, name]))}
                    placeholder={
                      isCollaboratorIndication
                        ? "Selecione um utilizador do CRM…"
                        : "Selecione um indicador cadastrado…"
                    }
                  />
                )}
              </SelectTrigger>
              <CrmSelectContent className="max-h-72">
                {isCollaboratorIndication
                  ? appUsers.map((user) => (
                      <CrmSelectItem key={user.id} value={user.full_name} className="py-1.5">
                        <UserAvatarName name={user.full_name} avatarUrl={user.avatar_url} />
                      </CrmSelectItem>
                    ))
                  : indicationCatalog.map((name) => (
                      <CrmSelectItem key={name} value={name}>
                        {name}
                      </CrmSelectItem>
                    ))}
              </CrmSelectContent>
            </Select>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="cta"
              disabled={
                saving ||
                (kind === "user" &&
                  userIdentityMode === "email" &&
                  !allowExternalUser &&
                  !selectedAppUser) ||
                (kind === "indicationName" &&
                  (indicationOptionsLoading ||
                    (isCollaboratorIndication
                      ? !selectedIndicationUser
                      : !indicationCatalog.includes(draft))))
              }
              onClick={() => void save()}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={saving} onClick={cancel}>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function intakeFieldEditorKind(fieldKey: string): LeadFieldEditorKind {
  if (fieldKey === "due_diligence_intake") return "yesno";
  if (fieldKey === "data_entrega_due" || fieldKey === "data_reuniao") return "date";
  if (fieldKey === "horario_entrega_due" || fieldKey === "horario_reuniao") return "time";
  if (fieldKey === "email_solicitante" || fieldKey === "cadastrado_por") return "user";
  if (fieldKey === "tipo_lead") return "leadType";
  if (fieldKey === "tipo_indicacao") return "indicationType";
  if (fieldKey === "nome_indicacao") return "indicationName";
  if (fieldKey === "areas_analise") return "multiselect";
  if (fieldKey === "contexto_comercial") return "textarea";
  return "text";
}

/** @deprecated Prefer `pipelineFieldToEditorProps` (inclui opções de select/multiselect). */
export function pipelineFieldEditorKind(fieldType: string): LeadFieldEditorKind {
  return pipelineFieldToEditorProps({ fieldType, fieldOptions: null }).kind;
}
