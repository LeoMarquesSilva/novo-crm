"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isEmptyOrInvalidDateBrStoredValue } from "@/lib/crm/date-br";
import { isValidFullNameTokens } from "@/lib/crm/full-name";
import {
  evaluateCondition,
  type FieldCondition,
  type FieldDefinition,
  type FieldFormValues,
} from "@/lib/crm/crm-field-schema";

export type { FieldCondition, FieldDefinition, FieldFormValues };
export { evaluateCondition };

// ─── Field renderers ──────────────────────────────────────────────────────────

interface FieldProps {
  field: FieldDefinition;
  value: string | string[] | undefined;
  onChange: (code: string, value: string | string[]) => void;
  /** Erro vindo do pai (ex.: validação ao submeter o `DynamicForm`). */
  parentFieldError?: string;
  /** Sincroniza mensagem de validação ao saír do campo (nome completo). */
  onCommitValidation?: (fieldCode: string, message: string | null) => void;
}

const CP_NOME_FOCAL_MSG = "Informe nome e sobrenome (nome completo).";
const MEETING_TIME_SUGGESTIONS = ["09:30", "11:30", "14:30", "16:30"];
const MEETING_LOCATION_PENDING = "Não definido ainda";

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function CpNomeFocalInput({
  field,
  value,
  onChange,
  parentFieldError,
  onCommitValidation,
}: FieldProps) {
  const str = typeof value === "string" ? value : "";
  const [blurError, setBlurError] = useState<string | null>(null);

  const displayError = blurError ?? parentFieldError;

  function runBlurValidation() {
    const s = str.trim();
    if (!field.is_required) {
      setBlurError(null);
      onCommitValidation?.(field.field_code, null);
      return;
    }
    if (!s) {
      setBlurError(null);
      onCommitValidation?.(field.field_code, null);
      return;
    }
    if (!isValidFullNameTokens(s)) {
      setBlurError(CP_NOME_FOCAL_MSG);
      onCommitValidation?.(field.field_code, CP_NOME_FOCAL_MSG);
    } else {
      setBlurError(null);
      onCommitValidation?.(field.field_code, null);
    }
  }

  function handleChange(next: string) {
    onChange(field.field_code, next);
    if (blurError) {
      setBlurError(null);
      onCommitValidation?.(field.field_code, null);
    }
  }

  const control =
    field.field_type === "textarea" ? (
      <Textarea
        id={field.field_code}
        value={str}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={runBlurValidation}
        rows={3}
        className="bg-white/60"
        aria-invalid={!!displayError}
      />
    ) : (
      <Input
        id={field.field_code}
        type="text"
        value={str}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={runBlurValidation}
        className="bg-white/60"
        aria-invalid={!!displayError}
      />
    );

  return (
    <div className="space-y-1">
      {control}
      {displayError ? (
        <p className="text-xs text-red-500" role="alert">
          {displayError}
        </p>
      ) : null}
    </div>
  );
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/** Ex.: (11) 98765-4321 ou (11) 3333-4444 (até 11 dígitos). */
function formatBrazilPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function SelectField({ field, value, onChange }: FieldProps) {
  const opts = field.field_options ?? [];
  return (
    <Select
      modal={false}
      value={typeof value === "string" ? value : ""}
      onValueChange={(v) => onChange(field.field_code, v ?? "")}
    >
      <SelectTrigger className="w-full min-w-0 bg-white/60">
        <SelectValue placeholder="Selecione..." />
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        side="bottom"
        align="start"
        sideOffset={4}
      >
        {opts.map((opt) => (
          <SelectItem key={opt} value={opt}>
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiSelectField({ field, value, onChange }: FieldProps) {
  const opts = field.field_options ?? [];
  const selected: string[] = Array.isArray(value) ? value : [];

  function toggle(opt: string) {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(field.field_code, next);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150",
              active
                ? "border-primary-dark bg-crm-gradient-primary text-white shadow"
                : "border-white/60 bg-white/50 text-primary-medium hover:bg-white/80",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

type AdminUserRow = {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]!}${parts[parts.length - 1]![0]!}`.toUpperCase();
}

function UserAvatarName({
  name,
  avatarUrl,
  size = "md",
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "size-5" : "size-6";
  const text = size === "sm" ? "text-[9px]" : "text-[10px]";
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Avatar className={cn(sz, "shrink-0")}>
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback className={text}>{initialsFromName(name)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </span>
  );
}

function UserSelectField({ field, value, onChange }: FieldProps) {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((json: { data?: AdminUserRow[] }) => {
        if (!cancelled) setUsers(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const v = typeof value === "string" ? value : "";
  const selectedUser = users.find((u) => u.id === v) ?? null;

  return (
    <Select
      modal={false}
      value={v}
      onValueChange={(next) => onChange(field.field_code, next ?? "")}
      disabled={loading}
    >
      <SelectTrigger className="h-auto min-h-8 w-full min-w-0 bg-white/60 py-1.5 [&_[data-slot=select-value]]:w-full [&_[data-slot=select-value]]:min-w-0">
        {loading ? (
          <span className="text-muted-foreground">Carregando usuários…</span>
        ) : v && selectedUser ? (
          <UserAvatarName
            name={selectedUser.full_name}
            avatarUrl={selectedUser.avatar_url}
          />
        ) : v && !selectedUser ? (
          <span className="truncate text-muted-foreground">Utilizador indisponível</span>
        ) : (
          <SelectValue placeholder="Selecione…" />
        )}
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        side="bottom"
        align="start"
        sideOffset={4}
      >
        {users.map((u) => (
          <SelectItem key={u.id} value={u.id} className="py-1.5">
            <UserAvatarName name={u.full_name} avatarUrl={u.avatar_url} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PercentField({ field, value, onChange }: FieldProps) {
  return (
    <div className="relative">
      <Input
        type="number"
        min={0}
        max={100}
        step={1}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(field.field_code, e.target.value)}
        placeholder="0"
        className="bg-white/60 pr-8"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

export function DynamicField({
  field,
  value,
  onChange,
  parentFieldError,
  onCommitValidation,
}: FieldProps) {
  const fieldCodeNorm = normalizeToken(field.field_code);
  const fieldLabelNorm = normalizeToken(field.label);
  const isMeetingLocationField =
    fieldCodeNorm.includes("local_reuniao") ||
    (fieldLabelNorm.includes("local") && fieldLabelNorm.includes("reuniao"));
  const isMeetingTimeField =
    fieldCodeNorm.includes("horario_reuniao") ||
    (fieldLabelNorm.includes("horario") && fieldLabelNorm.includes("reuniao"));

  if (isMeetingLocationField) {
    const current = typeof value === "string" ? value : "";
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(field.field_code, MEETING_LOCATION_PENDING)}
            className="h-7 rounded-full border-[#dfe5ee] bg-white px-2.5 text-[11px] font-semibold text-[#536274] shadow-none hover:border-[#bfd2f6] hover:bg-[#eef5ff] hover:text-[#173a6a]"
          >
            Ainda sem local
          </Button>
        </div>
        <Input
          id={field.field_code}
          type="text"
          value={current}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          placeholder={`Ex.: Matriz São Paulo ou ${MEETING_LOCATION_PENDING}`}
          className="bg-white/60"
        />
      </div>
    );
  }

  if (isMeetingTimeField) {
    return (
      <TimeInputBr
        value={typeof value === "string" ? value : ""}
        onChange={(hm) => onChange(field.field_code, hm)}
        step={300}
        suggestions={MEETING_TIME_SUGGESTIONS}
        className="bg-white/60 font-mono"
      />
    );
  }

  if (field.field_code === "cp_nome_focal") {
    return (
      <CpNomeFocalInput
        field={field}
        value={value}
        onChange={onChange}
        parentFieldError={parentFieldError}
        onCommitValidation={onCommitValidation}
      />
    );
  }

  switch (field.field_type) {
    case "select":
      return <SelectField field={field} value={value} onChange={onChange} />;
    case "multiselect":
      return (
        <MultiSelectField field={field} value={value} onChange={onChange} />
      );
    case "percent":
      return <PercentField field={field} value={value} onChange={onChange} />;
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          placeholder="0"
          className="bg-white/60"
        />
      );
    case "date":
    case "date_br":
      return (
        <DateInputBr
          value={typeof value === "string" ? value : ""}
          onChange={(ymd) => onChange(field.field_code, ymd)}
          className="bg-white/60"
        />
      );
    case "time":
      return (
        <TimeInputBr
          value={typeof value === "string" ? value : ""}
          onChange={(hm) => onChange(field.field_code, hm)}
          className="bg-white/60"
        />
      );
    case "user":
      return <UserSelectField field={field} value={value} onChange={onChange} />;
    case "email":
      return (
        <Input
          type="email"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          placeholder="nome@exemplo.com.br"
          className="bg-white/60"
        />
      );
    case "phone":
      return (
        <Input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => {
            const formatted = formatBrazilPhoneDisplay(digitsOnly(e.target.value));
            onChange(field.field_code, formatted);
          }}
          placeholder="(11) 99999-9999"
          className="bg-white/60"
        />
      );
    case "url":
      return (
        <Input
          type="url"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          placeholder="https://..."
          className="bg-white/60"
        />
      );
    case "textarea":
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          rows={3}
          className="bg-white/60"
        />
      );
    default:
      return (
        <Input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(field.field_code, e.target.value)}
          className="bg-white/60"
        />
      );
  }
}

// ─── DynamicForm ──────────────────────────────────────────────────────────────

interface DynamicFormProps {
  fields: FieldDefinition[];
  initialValues?: FieldFormValues;
  onSubmit?: (values: FieldFormValues) => void | Promise<void>;
  submitLabel?: string;
  className?: string;
}

export function DynamicForm({
  fields,
  initialValues = {},
  onSubmit,
  submitLabel = "Salvar",
  className,
}: DynamicFormProps) {
  const [values, setValues] = useState<FieldFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visibleFields = fields
    .filter((f) => f.is_active !== false)
    .filter((f) =>
      evaluateCondition(f.condition_json as FieldCondition, values),
    );

  function handleChange(code: string, value: string | string[]) {
    setValues((prev) => ({ ...prev, [code]: value }));
    if (errors[code]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
    }
  }

  function handleCommitValidation(code: string, message: string | null) {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[code] = message;
      else delete next[code];
      return next;
    });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of visibleFields) {
      if (!field.is_required) continue;
      const val = values[field.field_code];
      const isEmpty =
        field.field_type === "date_br" || field.field_type === "date"
          ? isEmptyOrInvalidDateBrStoredValue(val)
          : field.field_type === "time"
            ? !val || String(val).trim() === ""
            : Array.isArray(val)
              ? val.length === 0
              : !val || (val as string).trim() === "";
      if (isEmpty) {
        newErrors[field.field_code] = "Campo obrigatório";
        continue;
      }
      if (field.field_code === "cp_nome_focal") {
        const s = typeof val === "string" ? val.trim() : "";
        if (s && !isValidFullNameTokens(s)) {
          newErrors[field.field_code] = CP_NOME_FOCAL_MSG;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit?.(values);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-4", className)}>
      {visibleFields.map((field) => (
        <div key={field.field_code} className="space-y-1.5">
          <Label
            htmlFor={field.field_code}
            className="flex items-center gap-1.5 text-sm font-medium text-primary-dark"
          >
            {field.label}
            {field.is_required && (
              <span className="text-red-500" aria-hidden>
                *
              </span>
            )}
            {field.condition_json && (
              <Badge variant="secondary" className="text-[10px]">
                condicional
              </Badge>
            )}
          </Label>
          <DynamicField
            field={field}
            value={values[field.field_code]}
            onChange={handleChange}
            parentFieldError={errors[field.field_code]}
            onCommitValidation={handleCommitValidation}
          />
          {field.field_code !== "cp_nome_focal" && errors[field.field_code] ? (
            <p className="text-xs text-red-500">{errors[field.field_code]}</p>
          ) : null}
        </div>
      ))}

      {onSubmit && (
        <Button
          type="submit"
          disabled={submitting}
          className="w-full bg-crm-gradient-primary text-white shadow-md shadow-primary-dark/25"
        >
          {submitting ? "Salvando..." : submitLabel}
        </Button>
      )}
    </form>
  );
}
