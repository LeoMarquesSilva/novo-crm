import { applyAnnualRenewalDefaults } from "@/lib/crm/contract-renewal-date";
import { moneyCents, type MoneyCents } from "@/modules/contracts/domain/money";
import type { ContractConfigurationInput } from "@/modules/contracts/domain/contract-validation";
import type { BillingComponent } from "@/modules/contracts/domain/entities";
import {
  normalizeAdjustmentIndex,
  normalizeImportedAreaKey,
  type ContractImportExtraction,
} from "./schemas";
import type { SioeRateioSnapshot } from "./sioe-rateio";

const RATEIO_ELIGIBLE_KINDS = new Set([
  "mensal_fixo",
  "mensal_escalonado",
  "mensal_preco_fechado",
  "variavel_processo",
]);

function looksLikeHourComponent(
  component: ContractImportExtraction["components"][number],
): boolean {
  return component.kind === "variavel_hora" || /hora/i.test(component.description ?? "");
}

function shouldRemapUnitPricedToVariable(
  component: ContractImportExtraction["components"][number],
): boolean {
  if (component.kind !== "mensal_fixo" && component.kind !== "mensal_escalonado") return false;
  const unit = component.unitAmountCents ?? null;
  const quantity = component.includedQuantity ?? 0;
  const amount = component.amountCents ?? null;
  const chargeMode = component.chargeMode;
  if (unit == null || unit <= 0) return false;
  if (chargeMode === "quantidade_total" || chargeMode === "excedente") return true;
  if (quantity <= 1) return false;
  return amount == null || amount === unit || amount === unit * quantity;
}

function remapUnitPricedToVariable(
  component: ContractImportExtraction["components"][number],
): ContractImportExtraction["components"][number] {
  if (!shouldRemapUnitPricedToVariable(component)) return component;
  const kind = looksLikeHourComponent(component) ? "variavel_hora" : "variavel_processo";
  const chargeMode =
    component.chargeMode ?? (kind === "variavel_hora" ? "excedente" : "quantidade_total");
  return {
    ...component,
    kind,
    chargeMode,
    unitAmountCents: component.unitAmountCents,
    includedQuantity: component.includedQuantity ?? 0,
    amountCents: null,
  };
}

function dropEstimatedMonthlyDuplicates(
  components: BillingComponent[],
): BillingComponent[] {
  const expandedTotals = new Set(
    components.flatMap((component) => {
      if (component.kind !== "variavel_processo" && component.kind !== "variavel_hora") return [];
      const unit = component.unitAmountCents == null ? 0 : Number(component.unitAmountCents);
      const quantity = component.includedQuantity ?? 0;
      if (unit <= 0 || quantity <= 1) return [];
      return [unit * quantity];
    }),
  );
  if (!expandedTotals.size) return components;
  return components.filter((component) => {
    if (component.kind !== "mensal_fixo") return true;
    return !expandedTotals.has(Number(component.amountCents));
  });
}

function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + months, day ?? 1));
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function buildClosedPriceInstallments(input: {
  count: number;
  amountCents: number;
  firstDueDate: string;
}): Array<{ number: number; competency: string; amountCents: MoneyCents }> {
  return Array.from({ length: input.count }, (_, index) => {
    const due = addMonths(input.firstDueDate, index);
    return {
      number: index + 1,
      competency: firstOfMonth(due),
      amountCents: moneyCents(BigInt(input.amountCents)),
    };
  });
}

export function mapExtractionToConfiguration(input: {
  extraction: ContractImportExtraction;
  clientId: string | null;
  versionId: string;
  nextId: () => string;
  sioeRateio?: SioeRateioSnapshot | null;
}): ContractConfigurationInput {
  const { extraction, clientId, versionId, nextId } = input;
  const startsAt = extraction.startsAt ?? extraction.signedAt ?? extraction.firstInvoiceAt ?? null;
  const versionFrom = startsAt ?? new Date().toISOString().slice(0, 10);
  const tax =
    extraction.taxMode === "included" || extraction.taxMode === "added"
      ? { mode: extraction.taxMode, percentageBasisPoints: 0 }
      : undefined;

  const areas: ContractConfigurationInput["areas"] = [];
  const areaIdByKey = new Map<string, string>();
  for (const area of extraction.areas) {
    const areaKey = normalizeImportedAreaKey(area.areaKey);
    if (!areaKey || areaIdByKey.has(areaKey)) continue;
    const id = nextId();
    areaIdByKey.set(areaKey, id);
    areas.push({
      id,
      areaKey,
      includedProcesses: area.includedProcesses ?? null,
      includedHours: area.includedHours ?? null,
      processExcessRateCents: null,
      hourExcessRateCents: null,
    });
  }

  const components: BillingComponent[] = extraction.components.map((raw) => {
    const component = remapUnitPricedToVariable(raw);
    const areaKey = normalizeImportedAreaKey(component.areaKey ?? null);
    const areaId = areaKey ? areaIdByKey.get(areaKey) : undefined;
    const effectiveFrom = component.effectiveFrom ?? versionFrom;
    const effectiveTo = component.effectiveTo ?? null;
    const variableIncluded =
      component.kind === "variavel_hora" && (component.includedQuantity == null || component.includedQuantity === 0)
        ? (areaKey
            ? extraction.areas.find((area) => normalizeImportedAreaKey(area.areaKey) === areaKey)?.includedHours
            : null) ?? component.includedQuantity
        : component.includedQuantity;
    const base = {
      id: nextId(),
      description: component.description,
      effectiveFrom,
      effectiveTo,
      areaId,
      tax,
      areaAllocationEligible: component.kind === "variavel_processo",
      partnerShareEligible: false,
      commissionEligible: false,
    };

    if (component.kind === "mensal_fixo" || component.kind === "mensal_escalonado") {
      return {
        ...base,
        kind: component.kind,
        amountCents: moneyCents(BigInt(component.amountCents ?? 0)),
      };
    }
    if (component.kind === "mensal_preco_fechado") {
      const count = component.installmentCount ?? 1;
      const amount = component.installmentAmountCents ?? component.amountCents ?? 0;
      const firstDue = component.firstDueDate ?? extraction.firstInvoiceAt ?? effectiveFrom;
      return {
        ...base,
        kind: "mensal_preco_fechado",
        installments: buildClosedPriceInstallments({
          count,
          amountCents: amount,
          firstDueDate: firstDue,
        }),
      };
    }
    if (component.kind === "exito_percentual") {
      return {
        ...base,
        kind: "exito_percentual",
        percentageBasisPoints: component.percentageBasisPoints ?? 0,
        requiresManualRelease: true as const,
      };
    }
    if (component.kind === "exito_valor_fixo") {
      return {
        ...base,
        kind: "exito_valor_fixo",
        amountCents: moneyCents(BigInt(component.amountCents ?? 0)),
        requiresManualRelease: true as const,
      };
    }
    if (component.kind === "despesa_km") {
      return {
        ...base,
        kind: "despesa_km",
        chargeMode: component.chargeMode ?? "quantidade_total",
        includedQuantity: component.includedQuantity ?? 0,
        unitAmountCents:
          component.unitAmountCents == null ? null : moneyCents(BigInt(component.unitAmountCents)),
      };
    }
    if (component.kind === "variavel_processo" || component.kind === "variavel_hora") {
      return {
        ...base,
        kind: component.kind,
        chargeMode: component.chargeMode ?? (component.kind === "variavel_hora" ? "excedente" : "quantidade_total"),
        includedQuantity: variableIncluded ?? 0,
        unitAmountCents:
          component.unitAmountCents == null ? null : moneyCents(BigInt(component.unitAmountCents)),
      };
    }
    if (component.kind === "reembolso") {
      return { ...base, kind: "reembolso", requiresManualRelease: true as const };
    }
    return {
      ...base,
      kind: "spot",
      amountCents: component.amountCents == null ? undefined : moneyCents(BigInt(component.amountCents)),
      requiresManualRelease: true,
    };
  });

  if (extraction.extras.kmRateCents && !components.some((component) => component.kind === "despesa_km")) {
    components.push({
      id: nextId(),
      kind: "despesa_km",
      description: "Reembolso de quilometragem",
      effectiveFrom: versionFrom,
      effectiveTo: null,
      chargeMode: "quantidade_total",
      includedQuantity: 0,
      unitAmountCents: moneyCents(BigInt(extraction.extras.kmRateCents)),
      areaAllocationEligible: false,
      partnerShareEligible: false,
      commissionEligible: false,
    });
  }

  const configuration: ContractConfigurationInput = applyAnnualRenewalDefaults({
    clientId,
    startsAt,
    indefinite: extraction.indefinite,
    dueDay: extraction.dueDay ?? null,
    renewalDate: null,
    renewalAlertDate: null,
    adjustmentIndex: normalizeAdjustmentIndex(extraction.adjustmentIndex),
    firstInvoiceAt: extraction.firstInvoiceAt ?? null,
    firstInvoiceConditioned: extraction.firstInvoiceConditioned,
    substitutionEvidence: [],
    responsibles: [],
    areas,
    version: {
      id: versionId,
      effectiveFrom: versionFrom,
      effectiveTo: extraction.indefinite ? null : null,
      components: dropEstimatedMonthlyDuplicates(components),
      areaAllocations: [],
      partnerShares: [],
      commissions: [],
    },
  });
  return applySioeRateioToConfiguration(configuration, input.sioeRateio, nextId);
}

function explicitContractAreaKeys(configuration: ContractConfigurationInput): string[] {
  const keys = new Set<string>();
  for (const area of configuration.areas) {
    const areaKey = normalizeImportedAreaKey(area.areaKey);
    if (areaKey) keys.add(areaKey);
  }
  const areaKeyById = new Map(configuration.areas.map((area) => [area.id, area.areaKey]));
  for (const component of configuration.version.components) {
    const fromId = component.areaId ? areaKeyById.get(component.areaId) : null;
    const areaKey = normalizeImportedAreaKey(fromId ?? null);
    if (areaKey) keys.add(areaKey);
  }
  return [...keys];
}

export function applySioeRateioToConfiguration(
  configuration: ContractConfigurationInput,
  snapshot: SioeRateioSnapshot | null | undefined,
  nextId: () => string,
): ContractConfigurationInput {
  const shares = snapshot?.shares.length
    ? snapshot.shares
    : (() => {
        const areaKeys = explicitContractAreaKeys(configuration);
        if (areaKeys.length !== 1 || !areaKeys[0]) return [];
        return [{ areaKey: areaKeys[0], percentageBasisPoints: 10_000 }];
      })();
  if (!shares.length) return configuration;

  const areas = [...configuration.areas];
  const areaIdByKey = new Map(areas.map((area) => [area.areaKey, area.id]));
  for (const share of shares) {
    if (areaIdByKey.has(share.areaKey)) continue;
    const id = nextId();
    areaIdByKey.set(share.areaKey, id);
    areas.push({
      id,
      areaKey: share.areaKey,
      includedProcesses: null,
      includedHours: null,
      processExcessRateCents: null,
      hourExcessRateCents: null,
    });
  }

  return {
    ...configuration,
    areas,
    version: {
      ...configuration.version,
      components: configuration.version.components.map((component) =>
        RATEIO_ELIGIBLE_KINDS.has(component.kind) ? { ...component, areaAllocationEligible: true } : component,
      ),
      areaAllocations: shares.flatMap((share) => {
        const areaId = areaIdByKey.get(share.areaKey);
        if (!areaId) return [];
        return [
          {
            id: nextId(),
            areaId,
            mode: "percentual" as const,
            percentageBasisPoints: share.percentageBasisPoints,
          },
        ];
      }),
    },
  };
}
