import type {
  AreaAllocationRule,
  BillingComponent,
  ContractVersionSnapshot,
} from "./entities";
import type { MoneyCents } from "./money";

export type ContractValidationIssue = {
  code: string;
  path: string;
  severity: "error" | "warning";
  message: string;
};

export type ContractAreaConfiguration = {
  id: string;
  areaKey: string;
  includedProcesses?: number | null;
  includedHours?: number | null;
  processExcessRateCents?: MoneyCents | null;
  hourExcessRateCents?: MoneyCents | null;
};

export type ContractConfigurationInput = {
  clientId: string | null;
  startsAt: string | null;
  indefinite: boolean;
  dueDay: number | null;
  renewalDate: string | null;
  renewalAlertDate: string | null;
  adjustmentIndex: string | null;
  firstInvoiceAt: string | null;
  firstInvoiceConditioned: boolean;
  substitutionEvidence: Array<{ field: string; source: string; originalValue: string; overrideReason: string }>;
  responsibles: Array<{ id: string; role: string }>;
  areas: ContractAreaConfiguration[];
  version: ContractVersionSnapshot;
};

function error(code: string, path: string, message: string): ContractValidationIssue {
  return { code, path, severity: "error", message };
}

function warning(code: string, path: string, message: string): ContractValidationIssue {
  return { code, path, severity: "warning", message };
}

function rangesOverlap(left: BillingComponent, right: BillingComponent): boolean {
  const leftEnd = left.effectiveTo ?? "9999-12-31";
  const rightEnd = right.effectiveTo ?? "9999-12-31";
  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}

function componentConfiguredAmount(component: BillingComponent): MoneyCents | null {
  if ("installments" in component && component.installments) {
    return component.installments.reduce<MoneyCents>(
      (total, installment) => (total + installment.amountCents) as MoneyCents,
      BigInt(0) as MoneyCents,
    );
  }
  if ("amountCents" in component && component.amountCents !== undefined) {
    return component.amountCents;
  }
  return null;
}

function groupByComponent<T extends { componentId?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.componentId ?? "__default";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function validatePercentageGroups(
  rules: Array<{ componentId?: string; percentageBasisPoints: number }>,
  code: string,
  path: string,
  message: string,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  for (const group of groupByComponent(rules).values()) {
    const total = group.reduce((sum, rule) => sum + rule.percentageBasisPoints, 0);
    if (total !== 10_000) issues.push(error(code, path, message));
  }
  return issues;
}

function validateFixedAllocations(
  allocations: Extract<AreaAllocationRule, { mode: "valor" }>[],
  components: BillingComponent[],
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];
  for (const [componentKey, group] of groupByComponent(allocations).entries()) {
    const candidates = componentKey === "__default"
      ? components.filter((component) => component.areaAllocationEligible !== false)
      : components.filter((component) => component.id === componentKey);
    const amounts = candidates.map(componentConfiguredAmount);
    if (amounts.some((amount) => amount === null)) continue;
    const expected = amounts.reduce<bigint>((total, amount) => total + (amount ?? BigInt(0)), BigInt(0));
    const allocated = group.reduce<bigint>((total, rule) => total + rule.amountCents, BigInt(0));
    if (expected !== allocated) {
      issues.push(error(
        "area_fixed_total_mismatch",
        "version.areaAllocations",
        "O rateio por valor deve reconciliar com o valor elegível.",
      ));
    }
  }
  return issues;
}

export function validateContractConfiguration(
  input: ContractConfigurationInput,
): ContractValidationIssue[] {
  const issues: ContractValidationIssue[] = [];

  if (!input.clientId?.trim()) {
    issues.push(error("client_required", "clientId", "Informe o cliente do contrato."));
  }
  if (!input.startsAt?.trim()) {
    issues.push(error("start_date_required", "startsAt", "Informe o início da vigência."));
  }
  if (!input.firstInvoiceAt?.trim() && !input.firstInvoiceConditioned) {
    issues.push(error(
      "first_invoice_required",
      "firstInvoiceAt",
      "Informe o primeiro faturamento ou marque-o como condicionado.",
    ));
  }
  if (input.responsibles.length === 0) {
    issues.push(error("responsible_required", "responsibles", "Informe ao menos um responsável."));
  }
  if (input.version.components.length === 0) {
    issues.push(error(
      "billing_component_required",
      "version.components",
      "Informe ao menos um componente de cobrança.",
    ));
  }

  const areaIds = new Set(input.areas.map((area) => area.id));
  const componentIds = new Set(input.version.components.map((component) => component.id));

  input.version.components.forEach((component, index) => {
    if (component.areaId && !areaIds.has(component.areaId)) {
      issues.push(error(
        "component_area_not_found",
        `version.components[${index}].areaId`,
        "A área referenciada pelo componente não pertence à versão.",
      ));
    }
    const startsBeforeVersion = component.effectiveFrom < input.version.effectiveFrom;
    const endsAfterVersion = input.version.effectiveTo !== null &&
      (component.effectiveTo === null || component.effectiveTo > input.version.effectiveTo);
    if (startsBeforeVersion || endsAfterVersion) {
      issues.push(error(
        "component_outside_version",
        `version.components[${index}]`,
        "O período do componente deve estar contido no período da versão.",
      ));
    }
  });

  const stepped = input.version.components
    .map((component, index) => ({ component, index }))
    .filter(({ component }) => component.kind === "mensal_escalonado");
  for (let rightIndex = 1; rightIndex < stepped.length; rightIndex += 1) {
    const right = stepped[rightIndex]!;
    for (let leftIndex = 0; leftIndex < rightIndex; leftIndex += 1) {
      const left = stepped[leftIndex]!;
      if (left.component.areaId === right.component.areaId && rangesOverlap(left.component, right.component)) {
        issues.push(error(
          "stepped_ranges_overlap",
          `version.components[${right.index}]`,
          "Faixas escalonadas da mesma área não podem se sobrepor.",
        ));
        break;
      }
    }
  }

  input.version.areaAllocations.forEach((allocation, index) => {
    if (allocation.componentId && !componentIds.has(allocation.componentId)) {
      issues.push(error(
        "allocation_component_not_found",
        `version.areaAllocations[${index}].componentId`,
        "O componente referenciado pelo rateio não pertence à versão.",
      ));
    }
    if (!areaIds.has(allocation.areaId)) {
      issues.push(error(
        "allocation_area_not_found",
        `version.areaAllocations[${index}].areaId`,
        "A área referenciada pelo rateio não pertence à versão.",
      ));
    }
  });

  issues.push(...validatePercentageGroups(
    input.version.areaAllocations.filter(
      (allocation): allocation is Extract<AreaAllocationRule, { mode: "percentual" }> =>
        allocation.mode === "percentual",
    ),
    "area_percentage_total_invalid",
    "version.areaAllocations",
    "O rateio percentual deve fechar em 100%.",
  ));
  issues.push(...validatePercentageGroups(
    input.version.partnerShares,
    "partner_share_total_invalid",
    "version.partnerShares",
    "A participação dos sócios deve fechar em 100%.",
  ));
  issues.push(...validateFixedAllocations(
    input.version.areaAllocations.filter(
      (allocation): allocation is Extract<AreaAllocationRule, { mode: "valor" }> => allocation.mode === "valor",
    ),
    input.version.components,
  ));

  input.areas.forEach((area, index) => {
    if (area.includedProcesses !== null && area.includedProcesses !== undefined && area.processExcessRateCents == null) {
      issues.push(warning(
        "missing_process_excess_rate",
        `areas[${index}].processExcessRateCents`,
        "Há franquia de processos sem tarifa de excedente; nenhum preço será presumido.",
      ));
    }
    if (area.includedHours !== null && area.includedHours !== undefined && area.hourExcessRateCents == null) {
      issues.push(warning(
        "missing_hour_excess_rate",
        `areas[${index}].hourExcessRateCents`,
        "Há franquia de horas sem tarifa de excedente; nenhum preço será presumido.",
      ));
    }
  });

  return issues;
}
