"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, Loader2, MapPin, Search, Target } from "lucide-react";
import { PROPOSTA_TIPOS_CATALOG, type PropostaAreaKey, type PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import {
  DynamicField,
  evaluateCondition,
  type FieldCondition,
  type FieldDefinition,
} from "@/components/crm/dynamic-form";
import { SectionCard, newLeadModalFieldClass } from "@/components/crm/new-lead-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EscopoDirecionamentoAreaPicker } from "@/components/crm/escopo-direcionamento-area-picker";
import { maskDocument } from "@/lib/crm/br-document-mask";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { PROPOSAL_SCOPE_OPTIONS } from "@/lib/crm/proposta-scope-options";
import {
  extractTiposByAreaFromEscopoJson,
  mergeEscopoJsonWithAreaTipos,
  type EscopoTiposByArea,
} from "@/lib/crm/proposta-escopo-direcionamento";
import { cn } from "@/lib/utils";

export { PROPOSAL_SCOPE_OPTIONS };

export type EmpresaIntakeRow = {
  index: number;
  razao_social: string;
  tipo_documento: "CPF" | "CNPJ";
  documento: string;
};

export type PropostaEmpresasPayload = {
  primaryIndex: number;
  extras: Array<{ razao_social: string; documento: string }>;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function formatCepDisplay(d: string): string {
  const x = digitsOnly(d).slice(0, 8);
  if (x.length <= 5) return x;
  return `${x.slice(0, 5)}-${x.slice(5)}`;
}

export function parsePropostaEmpresasJson(raw: string | undefined): PropostaEmpresasPayload {
  if (!raw || !raw.trim()) {
    return { primaryIndex: 0, extras: [] };
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const primaryIndex =
      typeof o.primaryIndex === "number" && o.primaryIndex >= 0
        ? Math.floor(o.primaryIndex)
        : 0;
    const extrasRaw = o.extras;
    const extras: Array<{ razao_social: string; documento: string }> = [];
    if (Array.isArray(extrasRaw)) {
      for (const row of extrasRaw) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        extras.push({
          razao_social: typeof r.razao_social === "string" ? r.razao_social.trim() : "",
          documento: typeof r.documento === "string" ? r.documento.trim() : "",
        });
      }
    }
    return { primaryIndex, extras };
  } catch {
    return { primaryIndex: 0, extras: [] };
  }
}

function serializePropostaEmpresas(p: PropostaEmpresasPayload): string {
  return JSON.stringify(p);
}

function parseAreasValue(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    try {
      const j = JSON.parse(v) as unknown;
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
    return v
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

interface ConfeccaoReuniaoModalSectionProps {
  /** Primeiro campo do modal (Gestor do contrato — tipo `user` no CRM). */
  gestorField?: FieldDefinition | null;
  empresasIntake: EmpresaIntakeRow[];
  customValues: Record<string, string | string[] | undefined>;
  onFieldChange: (fieldCode: string, value: string | string[]) => void;
  disabled: boolean;
}

export function ConfeccaoReuniaoModalSection({
  gestorField,
  empresasIntake,
  customValues,
  onFieldChange,
  disabled,
}: ConfeccaoReuniaoModalSectionProps) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);

  const patchField = useCallback(
    (fieldCode: string, value: string | string[]) => {
      if (fieldCode === "cp_cliente_cep") {
        setCepError(null);
      }
      onFieldChange(fieldCode, value);
    },
    [onFieldChange],
  );

  const gestorVisible =
    gestorField != null &&
    evaluateCondition(
      gestorField.condition_json as FieldCondition | null,
      customValues,
    );

  const empresasPayload = useMemo(
    () => parsePropostaEmpresasJson(typeof customValues.cp_proposta_empresas_json === "string" ? customValues.cp_proposta_empresas_json : ""),
    [customValues.cp_proposta_empresas_json],
  );

  const empresaPrincipal = empresasIntake[0] ?? null;

  const setEmpresasPayload = useCallback(
    (next: PropostaEmpresasPayload) => {
      const primaryIndex = empresaPrincipal?.index ?? next.primaryIndex;
      patchField(
        "cp_proposta_empresas_json",
        serializePropostaEmpresas({ ...next, primaryIndex }),
      );
    },
    [patchField, empresaPrincipal?.index],
  );

  const [scopeCatalog, setScopeCatalog] = useState<PropostaTiposCatalog>(PROPOSTA_TIPOS_CATALOG);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/proposal-catalog")
      .then((res) => res.json())
      .then((json: { ok?: boolean; data?: { scope?: PropostaTiposCatalog } }) => {
        if (!cancelled && json.ok && json.data?.scope) {
          setScopeCatalog(json.data.scope);
        }
      })
      .catch(() => {
        /* fallback estático */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const areasSelected = useMemo(
    () => parseAreasValue(customValues.cp_areas_objeto),
    [customValues.cp_areas_objeto],
  );

  const escopoJsonRaw =
    typeof customValues.cp_escopo_detalhe_json === "string"
      ? customValues.cp_escopo_detalhe_json
      : "";

  const tiposByArea = useMemo(
    () => extractTiposByAreaFromEscopoJson(escopoJsonRaw, areasSelected),
    [escopoJsonRaw, areasSelected],
  );

  const syncAreasAndEscopo = useCallback(
    (nextAreas: string[], nextTiposByArea: EscopoTiposByArea) => {
      const filteredTipos = Object.fromEntries(
        Object.entries(nextTiposByArea).filter(([a]) => nextAreas.includes(a)),
      );
      patchField("cp_areas_objeto", nextAreas);
      patchField(
        "cp_escopo_detalhe_json",
        mergeEscopoJsonWithAreaTipos(escopoJsonRaw, nextAreas, filteredTipos),
      );
    },
    [patchField, escopoJsonRaw],
  );

  const toggleArea = (label: string) => {
    const set = new Set(areasSelected);
    const nextTipos = { ...tiposByArea };
    if (set.has(label)) {
      set.delete(label);
      delete nextTipos[label];
    } else {
      set.add(label);
      if (!nextTipos[label]) nextTipos[label] = [];
    }
    syncAreasAndEscopo([...set], nextTipos);
  };

  const setTiposForArea = (area: string, tipoIds: string[]) => {
    syncAreasAndEscopo(areasSelected, { ...tiposByArea, [area]: tipoIds });
  };

  const buscarCep = async () => {
    const cep = digitsOnly(
      typeof customValues.cp_cliente_cep === "string" ? customValues.cp_cliente_cep : "",
    );
    if (cep.length !== 8) {
      setCepError(
        "O CEP deve ter exatamente 8 números. Confira se digitou todos os dígitos (ex.: 01310100).",
      );
      return;
    }
    setCepError(null);
    setCepLoading(true);
    try {
      const res = await fetch(`/api/integrations/viacep?cep=${encodeURIComponent(cep)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: {
          logradouro: string;
          bairro: string;
          localidade: string;
          uf: string;
        };
      };
      if (!res.ok || !json.ok || !json.data) {
        setCepError(
          json.error ??
            "CEP inválido ou não encontrado. Verifique os números ou preencha o endereço manualmente abaixo.",
        );
        return;
      }
      const d = json.data;
      patchField("cp_cliente_logradouro", d.logradouro);
      patchField("cp_cliente_bairro", d.bairro);
      patchField("cp_cliente_cidade", d.localidade);
      patchField("cp_cliente_uf", d.uf);
      setCepError(null);
    } catch {
      setCepError(
        "Não foi possível consultar o CEP. Tente de novo ou preencha logradouro, bairro, cidade e UF manualmente.",
      );
    } finally {
      setCepLoading(false);
    }
  };

  const addExtraRow = () => {
    setEmpresasPayload({
      ...empresasPayload,
      extras: [...empresasPayload.extras, { razao_social: "", documento: "" }],
    });
  };

  const updateExtra = (i: number, key: "razao_social" | "documento", value: string) => {
    const next = empresasPayload.extras.map((row, j) =>
      j === i ? { ...row, [key]: value } : row,
    );
    setEmpresasPayload({ ...empresasPayload, extras: next });
  };

  const removeExtra = (i: number) => {
    setEmpresasPayload({
      ...empresasPayload,
      extras: empresasPayload.extras.filter((_, j) => j !== i),
    });
  };

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Building2}
        title="Contrato e empresas na proposta"
        subtitle="Gestor, empresa principal do cadastro e participantes adicionais, alinhados ao fluxo de abertura comercial."
      >
        {gestorVisible && gestorField ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-[#111827]">
              {gestorField.label}
              {gestorField.is_required ? (
                <span className="text-red-500" aria-hidden>
                  {" "}
                  *
                </span>
              ) : null}
            </Label>
            <DynamicField
              field={gestorField}
              value={customValues[gestorField.field_code]}
              onChange={patchField}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-xs font-medium text-[#111827]">Empresa principal na proposta (cadastro)</Label>
          {empresaPrincipal ? (
            <div
              className={cn(
                newLeadModalFieldClass,
                "flex min-h-12 flex-col justify-center gap-0.5 bg-[#f8fafc] py-2.5",
              )}
            >
              <p className="text-sm font-semibold text-[#111827]">
                {empresaPrincipal.razao_social || "—"}
              </p>
              <p className="text-xs text-[#6b7280]">
                {empresaPrincipal.tipo_documento}
                {empresaPrincipal.documento
                  ? ` ${maskDocument(empresaPrincipal.documento, empresaPrincipal.tipo_documento)}`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-[#6b7280]">
              Nenhuma empresa no cadastro inicial. Use &quot;Razão social / CNPJ adicional&quot; abaixo.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs font-medium text-[#111827]">Razão social ou CNPJ adicional</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-[#e5e7eb] bg-white text-[#111827]"
              disabled={disabled}
              onClick={addExtraRow}
            >
              Adicionar linha
            </Button>
          </div>
          {empresasPayload.extras.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs text-[#6b7280]">Razão social</Label>
                <Input
                  value={row.razao_social}
                  disabled={disabled}
                  onChange={(e) => updateExtra(i, "razao_social", e.target.value)}
                  className={newLeadModalFieldClass}
                  placeholder="Razão social"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-[#6b7280]">CNPJ / CPF</Label>
                <Input
                  value={row.documento}
                  disabled={disabled}
                  onChange={(e) => updateExtra(i, "documento", e.target.value)}
                  className={newLeadModalFieldClass}
                  placeholder="Somente números ou formatado"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="justify-self-end text-[#6b7280]"
                disabled={disabled}
                onClick={() => removeExtra(i)}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        icon={MapPin}
        title="Endereço do cliente"
        subtitle="Busque pelo CEP ou complete manualmente. Os dados alimentam a qualificação da proposta."
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium text-[#111827]">CEP do cliente</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              value={formatCepDisplay(
                typeof customValues.cp_cliente_cep === "string" ? customValues.cp_cliente_cep : "",
              )}
              disabled={disabled}
              onChange={(e) =>
                patchField("cp_cliente_cep", digitsOnly(e.target.value).slice(0, 8))
              }
              className={cn(newLeadModalFieldClass, "max-w-[11rem]")}
              inputMode="numeric"
              placeholder="00000-000"
              maxLength={9}
            />
            <Button
              type="button"
              variant="secondary"
              className="rounded-full"
              disabled={disabled || cepLoading}
              onClick={() => void buscarCep()}
            >
              {cepLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span className="ml-1.5">Buscar</span>
            </Button>
          </div>
          {cepError ? (
            <Alert variant="destructive" className="border-red-500/50" role="alert">
              <AlertTitle className="text-sm">CEP</AlertTitle>
              <AlertDescription className="text-sm">{cepError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs font-medium text-[#111827]">Logradouro</Label>
            <Input
              value={typeof customValues.cp_cliente_logradouro === "string" ? customValues.cp_cliente_logradouro : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_logradouro", e.target.value)}
              className={newLeadModalFieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#111827]">Número *</Label>
            <Input
              value={typeof customValues.cp_cliente_numero === "string" ? customValues.cp_cliente_numero : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_numero", e.target.value)}
              className={newLeadModalFieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#111827]">Complemento</Label>
            <Input
              value={typeof customValues.cp_cliente_complemento === "string" ? customValues.cp_cliente_complemento : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_complemento", e.target.value)}
              className={newLeadModalFieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#111827]">Bairro</Label>
            <Input
              value={typeof customValues.cp_cliente_bairro === "string" ? customValues.cp_cliente_bairro : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_bairro", e.target.value)}
              className={newLeadModalFieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#111827]">Cidade</Label>
            <Input
              value={typeof customValues.cp_cliente_cidade === "string" ? customValues.cp_cliente_cidade : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_cidade", e.target.value)}
              className={newLeadModalFieldClass}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-[#111827]">UF</Label>
            <Input
              value={typeof customValues.cp_cliente_uf === "string" ? customValues.cp_cliente_uf : ""}
              disabled={disabled}
              onChange={(e) => patchField("cp_cliente_uf", e.target.value.toUpperCase().slice(0, 2))}
              className={newLeadModalFieldClass}
              maxLength={2}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={Target}
        title="Escopo e prazo"
        subtitle="Marque as áreas, indique um ou mais tipos de escopo por área e a data de entrega."
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium text-[#111827]">Escopo da proposta *</Label>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Para cada área marcada, marque os tipos de escopo esperados (múltipla escolha). Quem elaborar verá
            um bloco por tipo na proposta.
          </p>
          <div className="space-y-3">
            {PROPOSAL_SCOPE_OPTIONS.map((opt) => {
              const selected = areasSelected.includes(opt);
              const catalogArea = normalizePracticeAreaKey(opt) as PropostaAreaKey;
              const tipos = scopeCatalog[catalogArea] ?? [];
              const tipoIds = tiposByArea[opt] ?? [];
              return (
                <EscopoDirecionamentoAreaPicker
                  key={opt}
                  area={opt}
                  selected={selected}
                  tipos={tipos}
                  tipoIds={tipoIds}
                  disabled={disabled}
                  onToggleArea={() => toggleArea(opt)}
                  onTipoIdsChange={(next) => setTiposForArea(opt, next)}
                />
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-[#111827]">Prazo para entrega *</Label>
          <DateInputBr
            value={typeof customValues.cp_prazo_entrega === "string" ? customValues.cp_prazo_entrega : ""}
            onChange={(ymd) => patchField("cp_prazo_entrega", ymd)}
            disabled={disabled}
            className={newLeadModalFieldClass}
          />
        </div>
      </SectionCard>
    </div>
  );
}

/** Monta o texto de qualificação para `cp_qualificacao`. */
export function buildCpQualificacaoText(params: {
  empresasIntake: EmpresaIntakeRow[];
  empresasPayload: PropostaEmpresasPayload;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
}): string {
  const lines: string[] = ["Empresa(s) na proposta:"];
  const { empresasIntake, empresasPayload, endereco } = params;

  let primaryIdx = empresasPayload.primaryIndex;
  if (primaryIdx <= 0 && empresasIntake.length > 0) {
    primaryIdx = empresasIntake[0].index;
  }
  if (primaryIdx > 0) {
    const em = empresasIntake.find((e) => e.index === primaryIdx);
    if (em) {
      lines.push(
        `— Principal (cadastro): ${em.razao_social || "—"} (${em.tipo_documento} ${em.documento || "—"})`,
      );
    }
  }

  for (const ex of empresasPayload.extras) {
    if (ex.razao_social.trim() || ex.documento.trim()) {
      lines.push(`— Adicional: ${ex.razao_social.trim() || "—"} — ${ex.documento.trim() || "—"}`);
    }
  }

  if (lines.length === 1) {
    lines.push("— (não informado)");
  }

  const cepFmt = formatCepDisplay(endereco.cep);
  lines.push("");
  lines.push("Endereço do cliente:");
  lines.push(
    `${cepFmt} — ${endereco.logradouro.trim() || "—"}, Nº ${endereco.numero.trim() || "—"}` +
      (endereco.complemento.trim() ? `, ${endereco.complemento.trim()}` : ""),
  );
  lines.push(
    `${endereco.bairro.trim() || "—"} — ${endereco.cidade.trim() || "—"}/${(endereco.uf.trim() || "—").toUpperCase()}`,
  );

  return lines.join("\n");
}
