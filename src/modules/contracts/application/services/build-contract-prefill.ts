import type { BillingComponentKind } from "../../domain/entities";
import { decimalToCents, type MoneyCents } from "../../domain/money";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { LEAD_RD_FIELD_LABELS } from "@/lib/crm/lead-rd-field-labels";
import {
  getParcelaValues,
  getParcelaVencimentos,
  parseParcelasCount,
} from "@/lib/crm/proposta-investimento-parcelas";
import { parseEscopoJson } from "@/lib/crm/proposta-escopo-json";

export type ContractPrefillSource = "contrato" | "proposta" | "manual" | "rd";

export type ContractPrefillSuggestion<T> = {
  value: T;
  source: ContractPrefillSource;
  requiresConfirmation: true;
};

export type ContractPrefillArea = {
  areaKey: string;
  includedProcesses: number | null;
  includedHours: number | null;
  processExcessRateCents: MoneyCents | null;
  hourExcessRateCents: MoneyCents | null;
};

export type ContractPrefillBillingComponent = {
  key: string;
  kind: BillingComponentKind;
  description: string;
  areaKey?: string;
  amountCents?: MoneyCents;
  percentageBasisPoints?: number;
  includedQuantity?: number;
  unitAmountCents?: MoneyCents | null;
  requiresManualRelease: boolean;
  installments?: Array<{
    number: number;
    amountCents: MoneyCents | null;
    dueCondition: string | null;
  }>;
};

export type ContractPrefillAreaAllocation =
  | { areaKey: string; mode: "valor"; amountCents: MoneyCents }
  | { areaKey: string; mode: "percentual"; percentageBasisPoints: number };

export type ContractPrefillDraft = {
  fields?: Record<string, unknown>;
  areas?: ContractPrefillArea[];
  billingComponents?: ContractPrefillBillingComponent[];
  areaAllocations?: ContractPrefillAreaAllocation[];
};

export type ContractPrefillSources = {
  existingDraft?: ContractPrefillDraft | null;
  fieldValues?: Record<string, unknown> | Array<Record<string, unknown>> | null;
  crmRdFieldOverrides?: Record<string, unknown> | null;
  latestReconciliationDetails?: unknown;
};

export type ContractPrefillResult = {
  fields: Record<string, ContractPrefillSuggestion<string>>;
  areas: Array<ContractPrefillSuggestion<ContractPrefillArea>>;
  billingComponents: Array<ContractPrefillSuggestion<ContractPrefillBillingComponent>>;
  areaAllocations: Array<ContractPrefillSuggestion<ContractPrefillAreaAllocation>>;
};

type SelectedField = { raw: unknown; source: ContractPrefillSource };

const FINANCE_COMPONENTS: Array<{
  key: string;
  kind: BillingComponentKind;
  requiresManualRelease: boolean;
}> = [
  { key: "mensal_fixo_financeiro", kind: "mensal_fixo", requiresManualRelease: false },
  { key: "mensal_escalonado_financeiro", kind: "mensal_escalonado", requiresManualRelease: false },
  { key: "mensal_variavel_financeiro", kind: "mensal_condicionado", requiresManualRelease: true },
  { key: "mensal_condicionado_financeiro", kind: "mensal_condicionado", requiresManualRelease: true },
  { key: "spot_financeiro", kind: "spot", requiresManualRelease: true },
  { key: "spot_manutencao_financeiro", kind: "manutencao", requiresManualRelease: true },
  { key: "spot_parcelado_financeiro", kind: "spot", requiresManualRelease: true },
  { key: "spot_parcelado_manutencao_financeiro", kind: "spot", requiresManualRelease: true },
  { key: "spot_condicionado_financeiro", kind: "spot", requiresManualRelease: true },
  { key: "exito_financeiro", kind: "exito_valor_fixo", requiresManualRelease: true },
  { key: "mensal_preco_fechado_financeiro", kind: "mensal_preco_fechado", requiresManualRelease: false },
];

const AREA_ALLOCATIONS: Array<{
  areaKey: string;
  valueKey: string;
  percentageKey: string;
}> = [
  {
    areaKey: "Cível",
    valueKey: "rateio_valor_civel_financeiro",
    percentageKey: "rateio_porcentagem_civel_financeiro",
  },
  {
    areaKey: "Trabalhista",
    valueKey: "rateio_valor_trabalhista_financeiro",
    percentageKey: "rateio_porcentagem_trabalhista_financeiro",
  },
  {
    areaKey: "Reestruturação e Insolvência",
    valueKey: "rateio_valor_insolvencia_financeiro",
    percentageKey: "rateio_porcentagem_insolvencia_financeiro",
  },
  {
    areaKey: "Tributário",
    valueKey: "rateio_valor_tributario_financeiro",
    percentageKey: "rateio_porcentagem_tributario_financeiro",
  },
  {
    areaKey: "Societário e Contratos",
    valueKey: "rateio_valor_contratos_financeiro",
    percentageKey: "rateio_porcentagem_contratos_financeiro",
  },
  {
    areaKey: "ADD",
    valueKey: "rateio_valor_add_financeiro",
    percentageKey: "rateio_porcentagem_add_financeiro",
  },
];

const CONTRACT_BUILDER_AREAS = [
  {
    areaKey: "Trabalhista",
    processKey: "cc_trabalhista_limite_acoes",
    hourKey: "cc_trabalhista_horas_consultivas",
  },
  {
    areaKey: "Cível",
    processKey: "cc_civel_limite_processos",
    hourKey: "cc_civel_horas_consultivas",
  },
  {
    areaKey: "Societário e Contratos",
    hourKey: "cc_contratual_horas_mensais",
  },
  {
    areaKey: "Tributário",
    processKey: "cc_tributario_limite_acoes",
  },
] as const;

function suggestion<T>(value: T, source: ContractPrefillSource): ContractPrefillSuggestion<T> {
  return { value, source, requiresConfirmation: true };
}

function scalar(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
    return scalar((raw as { value: unknown }).value);
  }
  return null;
}

function optionalNumber(raw: unknown): number | null {
  const value = scalar(raw);
  if (!value) return null;
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function optionalMoney(raw: unknown): MoneyCents | null {
  const value = scalar(raw);
  if (!value) return null;
  try {
    return decimalToCents(value);
  } catch {
    return null;
  }
}

function optionalBasisPoints(raw: unknown): number | null {
  const value = optionalNumber(raw);
  return value === null ? null : Math.round(value * 100);
}

function normalizeLabel(label: string): string {
  return label
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function fieldValuesRecord(
  raw: ContractPrefillSources["fieldValues"],
): Record<string, unknown> {
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const result: Record<string, unknown> = {};
  for (const row of raw) {
    const key = scalar(row.fieldCode) ?? scalar(row.field_code) ?? scalar(row.key);
    if (!key) continue;
    result[key] = row.valueJson ?? row.value_json ?? row.value;
  }
  return result;
}

function reconciliationFields(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const details = raw as Record<string, unknown>;
  const direct: Record<string, unknown> = {};
  for (const mapping of LEAD_RD_FIELD_LABELS) {
    if (mapping.key in details) direct[mapping.key] = details[mapping.key];
  }
  const deal = details.deal && typeof details.deal === "object" && !Array.isArray(details.deal)
    ? details.deal as Record<string, unknown>
    : null;
  const customFields = deal && Array.isArray(deal.deal_custom_fields) ? deal.deal_custom_fields : [];
  for (const rowRaw of customFields) {
    if (!rowRaw || typeof rowRaw !== "object" || Array.isArray(rowRaw)) continue;
    const row = rowRaw as Record<string, unknown>;
    const customField = row.custom_field && typeof row.custom_field === "object" && !Array.isArray(row.custom_field)
      ? row.custom_field as Record<string, unknown>
      : null;
    const label = scalar(customField?.label) ?? scalar(row.label);
    if (!label) continue;
    const mapping = LEAD_RD_FIELD_LABELS.find((candidate) =>
      [candidate.label, ...(candidate.aliases ?? [])]
        .some((candidateLabel) => normalizeLabel(candidateLabel) === normalizeLabel(label))
    );
    if (mapping) direct[mapping.key] = row.value ?? row.content;
  }
  return direct;
}

function selectFields(input: ContractPrefillSources): Map<string, SelectedField> {
  const selected = new Map<string, SelectedField>();
  const add = (record: Record<string, unknown>, source: ContractPrefillSource) => {
    for (const [key, raw] of Object.entries(record)) {
      if (!selected.has(key)) selected.set(key, { raw, source });
    }
  };
  add(input.existingDraft?.fields ?? {}, "contrato");
  const normalizedFieldValues = fieldValuesRecord(input.fieldValues);
  for (const [key, raw] of Object.entries(normalizedFieldValues)) {
    add({ [key]: raw }, key.startsWith("cc_") ? "contrato" : "proposta");
  }
  add(input.crmRdFieldOverrides ?? {}, "manual");
  add(reconciliationFields(input.latestReconciliationDetails), "rd");
  return selected;
}

function placeholder(
  placeholders: Record<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (key in placeholders) return placeholders[key];
  }
  return undefined;
}

function proposalAreas(raw: unknown): Array<ContractPrefillSuggestion<ContractPrefillArea>> {
  const json = scalar(raw);
  if (!json) return [];
  const parsed = parseEscopoJson(json);
  return Object.entries(parsed).map(([rawAreaKey, entries]) => {
    const placeholders = Object.assign({}, ...entries.map((entry) => entry.placeholders ?? {}));
    return suggestion({
      areaKey: normalizePracticeAreaKey(rawAreaKey),
      includedProcesses: optionalNumber(placeholder(placeholders, [
        "QTD_PROCESSOS",
        "QTD DE PROCESSOS",
        "PROCESSOS_INCLUIDOS",
        "LIMITE_PROCESSOS",
      ])),
      includedHours: optionalNumber(placeholder(placeholders, [
        "HORAS_MES",
        "HORAS MES",
        "HORASPREVISTAS",
        "HORAS_INCLUIDAS",
      ])),
      processExcessRateCents: optionalMoney(placeholder(placeholders, [
        "VALOR_EXCEDENTE_PROCESSO",
        "VALORPROCESSO",
      ])),
      hourExcessRateCents: optionalMoney(placeholder(placeholders, [
        "VALOR_EXCEDENTE_HORA",
        "VALORHORAEXCEDENTE",
      ])),
    }, "proposta");
  });
}

function proposalComponents(raw: unknown): Array<ContractPrefillSuggestion<ContractPrefillBillingComponent>> {
  const json = scalar(raw);
  if (!json) return [];
  const parsed = parseEscopoJson(json);
  const result: Array<ContractPrefillSuggestion<ContractPrefillBillingComponent>> = [];
  for (const [rawAreaKey, entries] of Object.entries(parsed)) {
    const areaKey = normalizePracticeAreaKey(rawAreaKey);
    for (const entry of entries) {
      const investment = entry.investimento;
      if (!investment) continue;
      const placeholders = investment.placeholders ?? {};
      const key = `proposal:${entry.id}:${investment.subtipoId}`;
      const pushAmount = (
        kind: BillingComponentKind,
        amountKey: string,
        requiresManualRelease: boolean,
      ) => {
        const amountCents = optionalMoney(placeholders[amountKey]);
        if (amountCents === null) return;
        result.push(suggestion({
          key,
          kind,
          description: investment.subtipoId,
          areaKey,
          amountCents,
          requiresManualRelease,
        }, "proposta"));
      };
      switch (investment.subtipoId) {
        case "mensal_fixo":
          pushAmount("mensal_fixo", "VALORMENSAL", false);
          break;
        case "mensal_escalonado":
          pushAmount("mensal_escalonado", "VALORMENSALESCALONADO", false);
          break;
        case "mensal_condicionado":
          pushAmount("mensal_condicionado", "VALORMENSALBASE", true);
          break;
        case "spot":
        case "spot_condicionado": {
          const amountCents = optionalMoney(placeholders.VALORSPOT);
          if (amountCents === null) break;
          const count = parseParcelasCount(placeholders);
          const values = getParcelaValues(placeholders);
          const dueConditions = getParcelaVencimentos(placeholders);
          const installments = count > 0
            ? Array.from({ length: count }, (_, index) => ({
                number: index + 1,
                amountCents: optionalMoney(values[index]),
                dueCondition: scalar(dueConditions[index]),
              }))
            : undefined;
          result.push(suggestion({
            key,
            kind: "spot",
            description: investment.subtipoId,
            areaKey,
            amountCents,
            requiresManualRelease: true,
            ...(installments ? { installments } : {}),
          }, "proposta"));
          break;
        }
        case "manutencao":
          pushAmount("manutencao", "VALORMANUTENCAO", true);
          break;
        case "exito_valor_fixo":
          pushAmount("exito_valor_fixo", "VALOREXITO", true);
          break;
        case "exito_percentual": {
          const percentageBasisPoints = optionalBasisPoints(placeholders.PORCENTAGEMHONORARIOS);
          if (percentageBasisPoints === null) break;
          result.push(suggestion({
            key,
            kind: "exito_percentual",
            description: investment.subtipoId,
            areaKey,
            percentageBasisPoints,
            requiresManualRelease: true,
          }, "proposta"));
          break;
        }
      }
    }
  }
  return result;
}

function builderAreas(
  selected: Map<string, SelectedField>,
  usedAreaKeys: Set<string>,
): Array<ContractPrefillSuggestion<ContractPrefillArea>> {
  const result: Array<ContractPrefillSuggestion<ContractPrefillArea>> = [];
  for (const config of CONTRACT_BUILDER_AREAS) {
    const areaKey = normalizePracticeAreaKey(config.areaKey);
    if (usedAreaKeys.has(areaKey)) continue;
    const process = "processKey" in config ? selected.get(config.processKey) : undefined;
    const hours = "hourKey" in config ? selected.get(config.hourKey) : undefined;
    if (!process && !hours) continue;
    const includedProcesses = optionalNumber(process?.raw);
    const includedHours = optionalNumber(hours?.raw);
    if (includedProcesses === null && includedHours === null) continue;
    result.push(suggestion({
      areaKey,
      includedProcesses,
      includedHours,
      processExcessRateCents: null,
      hourExcessRateCents: null,
    }, "contrato"));
  }
  return result;
}

function financeComponents(
  selected: Map<string, SelectedField>,
): Array<ContractPrefillSuggestion<ContractPrefillBillingComponent>> {
  const result: Array<ContractPrefillSuggestion<ContractPrefillBillingComponent>> = [];
  for (const config of FINANCE_COMPONENTS) {
    const field = selected.get(config.key);
    if (!field) continue;
    const amountCents = optionalMoney(field.raw);
    if (amountCents === null) continue;
    const label = LEAD_RD_FIELD_LABELS.find((mapping) => mapping.key === config.key)?.label
      .replace(/\s+/g, " ")
      .trim() ?? config.key;
    result.push(suggestion({
      key: config.key,
      kind: config.kind,
      description: label,
      amountCents,
      requiresManualRelease: config.requiresManualRelease,
    }, field.source));
  }
  return result;
}

function financeAreaAllocations(
  selected: Map<string, SelectedField>,
): Array<ContractPrefillSuggestion<ContractPrefillAreaAllocation>> {
  const result: Array<ContractPrefillSuggestion<ContractPrefillAreaAllocation>> = [];
  for (const config of AREA_ALLOCATIONS) {
    const valueField = selected.get(config.valueKey);
    const amountCents = optionalMoney(valueField?.raw);
    if (valueField && amountCents !== null) {
      result.push(suggestion({
        areaKey: normalizePracticeAreaKey(config.areaKey),
        mode: "valor",
        amountCents,
      }, valueField.source));
    }
    const percentageField = selected.get(config.percentageKey);
    const percentageBasisPoints = optionalBasisPoints(percentageField?.raw);
    if (percentageField && percentageBasisPoints !== null) {
      result.push(suggestion({
        areaKey: normalizePracticeAreaKey(config.areaKey),
        mode: "percentual",
        percentageBasisPoints,
      }, percentageField.source));
    }
  }
  return result;
}

export function buildContractPrefill(input: ContractPrefillSources): ContractPrefillResult {
  const selected = selectFields(input);
  const fields: ContractPrefillResult["fields"] = {};
  for (const [key, field] of selected.entries()) {
    const value = scalar(field.raw);
    if (value !== null) fields[key] = suggestion(value, field.source);
  }

  const proposalAreaSuggestions = proposalAreas(selected.get("cp_escopo_detalhe_json")?.raw);
  const areas = input.existingDraft?.areas
    ? input.existingDraft.areas.map((area) => suggestion(area, "contrato"))
    : [
        ...proposalAreaSuggestions,
        ...builderAreas(
          selected,
          new Set(proposalAreaSuggestions.map((area) => area.value.areaKey)),
        ),
      ];

  const billingComponents = input.existingDraft?.billingComponents
    ? input.existingDraft.billingComponents.map((component) => suggestion(component, "contrato"))
    : [
        ...proposalComponents(selected.get("cp_escopo_detalhe_json")?.raw),
        ...financeComponents(selected),
      ];

  const areaAllocations = input.existingDraft?.areaAllocations
    ? input.existingDraft.areaAllocations.map((allocation) => suggestion(allocation, "contrato"))
    : financeAreaAllocations(selected);

  return { fields, areas, billingComponents, areaAllocations };
}
