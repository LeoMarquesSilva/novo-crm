import type {
  AllocationResult,
  AreaAllocationRule,
  BillingBlocker,
  BillingCalculationInput,
  BillingCalculationResult,
  BillingComponent,
  BillingMemoryItem,
  CommissionRule,
  ContractConsumption,
  ManualBillingResolution,
  PartnerShareRule,
} from "./entities";
import { moneyCents, type MoneyCents } from "./money";

type CalculatedCharge = {
  component: BillingComponent;
  amountCents: MoneyCents;
  bucket: "honorarios" | "reembolsos";
  quantity?: number;
  unitAmountCents?: MoneyCents;
  percentageBasisPoints?: number;
};

function multiplyCents(value: MoneyCents, multiplier: number): MoneyCents {
  if (!Number.isSafeInteger(multiplier)) {
    throw new Error("Quantity must be a safe integer");
  }
  return moneyCents(value * BigInt(multiplier));
}

function percentageOf(value: MoneyCents, basisPoints: number): MoneyCents {
  if (!Number.isInteger(basisPoints)) {
    throw new Error("Percentage basis points must be an integer");
  }
  return moneyCents((value * BigInt(basisPoints)) / BigInt(10_000));
}

function isEffective(component: BillingComponent, competency: string): boolean {
  return component.effectiveFrom <= competency &&
    (component.effectiveTo === null || competency <= component.effectiveTo);
}

export function selectApplicableComponents(
  components: BillingComponent[],
  competency: string,
): BillingComponent[] {
  return components.filter((component) => isEffective(component, competency));
}

function findResolution(
  componentId: string,
  competency: string,
  resolutions: ManualBillingResolution[],
): ManualBillingResolution | undefined {
  return resolutions.find(
    (resolution) =>
      resolution.componentId === componentId &&
      resolution.competency === competency,
  ) ?? resolutions.find(
    (resolution) =>
      resolution.componentId === componentId &&
      resolution.competency === undefined,
  );
}

function calculateVariable(
  component: Extract<BillingComponent, { kind: "variavel_processo" | "variavel_hora" | "despesa_km" }>,
  consumptions: ContractConsumption[],
  blockers: BillingBlocker[],
): CalculatedCharge | null {
  const matching = consumptions.filter((consumption) => consumption.componentId === component.id);
  if (matching.length === 0) {
    blockers.push({
      code: "missing_consumption",
      componentId: component.id,
      message: `Consumption is required for ${component.description}`,
    });
    return null;
  }

  const quantity = matching.reduce((sum, consumption) => sum + (consumption.quantity ?? 0), 0);
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error(`Consumption quantity must be a non-negative safe integer for ${component.id}`);
  }
  const billableQuantity = component.chargeMode === "excedente"
    ? Math.max(0, quantity - component.includedQuantity)
    : quantity;

  if (billableQuantity === 0) {
    return null;
  }
  if (component.unitAmountCents === null) {
    blockers.push({
      code: component.chargeMode === "excedente" ? "missing_excess_rate" : "missing_unit_rate",
      componentId: component.id,
      message: `A rate is required to charge ${billableQuantity} units for ${component.description}`,
      excessQuantity: component.chargeMode === "excedente" ? billableQuantity : undefined,
    });
    return null;
  }

  return {
    component,
    amountCents: multiplyCents(component.unitAmountCents, billableQuantity),
    bucket: "honorarios",
    quantity: billableQuantity,
    unitAmountCents: component.unitAmountCents,
  };
}

function calculateManual(
  component: Extract<
    BillingComponent,
    { kind: "mensal_condicionado" | "exito_valor_fixo" | "exito_percentual" | "reembolso" | "spot" | "acordo" }
  >,
  competency: string,
  resolutions: ManualBillingResolution[],
  blockers: BillingBlocker[],
): CalculatedCharge | null {
  const resolution = findResolution(component.id, competency, resolutions);
  const mustRelease = component.requiresManualRelease;
  if (mustRelease && !resolution?.released) {
    blockers.push({
      code: "manual_release_required",
      componentId: component.id,
      message: `Manual release is required for ${component.description}`,
    });
    return null;
  }

  if ("installments" in component && component.installments) {
    const installment = component.installments.find((entry) => entry.competency === competency);
    return installment
      ? { component, amountCents: installment.amountCents, bucket: "honorarios" }
      : null;
  }

  if (component.kind === "reembolso") {
    return resolution?.amountCents === undefined
      ? null
      : { component, amountCents: resolution.amountCents, bucket: "reembolsos" };
  }

  if (component.kind === "exito_percentual" || (component.kind === "acordo" && component.percentageBasisPoints !== undefined)) {
    if (resolution?.baseCents === undefined) {
      return null;
    }
    const percentageBasisPoints = component.percentageBasisPoints;
    if (percentageBasisPoints === undefined) {
      return null;
    }
    return {
      component,
      amountCents: percentageOf(resolution.baseCents, percentageBasisPoints),
      bucket: "honorarios",
      percentageBasisPoints,
    };
  }

  const amountCents = resolution?.amountCents ?? component.amountCents;
  if (amountCents === undefined) {
    return null;
  }
  if (component.kind === "spot" && !mustRelease && component.effectiveFrom !== competency) {
    return null;
  }
  return { component, amountCents, bucket: "honorarios" };
}

export function calculateComponent(
  component: BillingComponent,
  input: BillingCalculationInput,
  blockers: BillingBlocker[],
): CalculatedCharge | null {
  switch (component.kind) {
    case "mensal_fixo":
    case "mensal_escalonado":
    case "manutencao":
    case "ajuste":
      return { component, amountCents: component.amountCents, bucket: "honorarios" };
    case "mensal_preco_fechado": {
      const installment = component.installments.find((entry) => entry.competency === input.competency);
      return installment
        ? { component, amountCents: installment.amountCents, bucket: "honorarios" }
        : null;
    }
    case "variavel_processo":
    case "variavel_hora":
    case "despesa_km":
      return calculateVariable(component, input.consumptions, blockers);
    case "mensal_condicionado":
    case "exito_valor_fixo":
    case "exito_percentual":
    case "reembolso":
    case "spot":
    case "acordo":
      return calculateManual(component, input.competency, input.manualResolutions, blockers);
  }
}

export function allocateCentsByPercentage(
  totalCents: MoneyCents,
  percentageBasisPoints: number[],
): MoneyCents[] {
  if (percentageBasisPoints.length === 0) {
    return [];
  }
  if (percentageBasisPoints.some((percentage) => !Number.isInteger(percentage) || percentage < 0)) {
    throw new Error("Allocation percentages must be non-negative integer basis points");
  }
  if (percentageBasisPoints.reduce((sum, percentage) => sum + percentage, 0) !== 10_000) {
    throw new Error("Allocation percentages must sum to 10000 basis points");
  }

  let allocated = BigInt(0);
  return percentageBasisPoints.map((percentage, index) => {
    if (index === percentageBasisPoints.length - 1) {
      return moneyCents(totalCents - allocated);
    }
    const amount = (totalCents * BigInt(percentage)) / BigInt(10_000);
    allocated += amount;
    return moneyCents(amount);
  });
}

function eligibleCharges(
  charges: CalculatedCharge[],
  eligibility: "areaAllocationEligible" | "partnerShareEligible" | "commissionEligible",
): CalculatedCharge[] {
  return charges.filter(
    (charge) =>
      charge.bucket === "honorarios" &&
      charge.component.kind !== "reembolso" &&
      charge.component[eligibility] !== false,
  );
}

function allocateRules(
  charges: CalculatedCharge[],
  rules: (AreaAllocationRule | PartnerShareRule | CommissionRule)[],
  beneficiary: (rule: AreaAllocationRule | PartnerShareRule | CommissionRule) => string,
  eligibility: "areaAllocationEligible" | "partnerShareEligible" | "commissionEligible",
): AllocationResult[] {
  const candidates = eligibleCharges(charges, eligibility);
  const results: AllocationResult[] = [];
  const componentIds = [...new Set(rules.flatMap((rule) => (rule.componentId ? [rule.componentId] : [])))];

  const apply = (
    scopedRules: (AreaAllocationRule | PartnerShareRule | CommissionRule)[],
    baseCents: MoneyCents,
    componentId?: string,
  ) => {
    if (scopedRules.length === 0) return;
    const allPercentage = scopedRules.every((rule) => !("amountCents" in rule));
    if (allPercentage) {
      const amounts = allocateCentsByPercentage(
        baseCents,
        scopedRules.map((rule) => ("percentageBasisPoints" in rule ? rule.percentageBasisPoints : 0)),
      );
      scopedRules.forEach((rule, index) => {
        results.push({ ruleId: rule.id, componentId, beneficiaryId: beneficiary(rule), amountCents: amounts[index] });
      });
      return;
    }

    scopedRules.forEach((rule) => {
      if (!("amountCents" in rule)) {
        throw new Error("Percentage and fixed-value allocation rules cannot be mixed");
      }
      results.push({ ruleId: rule.id, componentId, beneficiaryId: beneficiary(rule), amountCents: rule.amountCents });
    });
    const sum = results
      .filter((result) => result.componentId === componentId)
      .reduce((total, result) => total + result.amountCents, BigInt(0));
    if (sum !== baseCents) {
      throw new Error("Fixed-value allocations must reconcile with the eligible amount");
    }
  };

  for (const componentId of componentIds) {
    const scopedRules = rules.filter((rule) => rule.componentId === componentId);
    const baseCents = moneyCents(
      candidates
        .filter((charge) => charge.component.id === componentId)
        .reduce((sum, charge) => sum + charge.amountCents, BigInt(0)),
    );
    apply(scopedRules, baseCents, componentId);
  }

  const defaultRules = rules.filter((rule) => rule.componentId === undefined);
  const defaultBase = moneyCents(
    candidates
      .filter((charge) => !componentIds.includes(charge.component.id))
      .reduce((sum, charge) => sum + charge.amountCents, BigInt(0)),
  );
  apply(defaultRules, defaultBase);
  return results;
}

export function allocateByArea(charges: CalculatedCharge[], rules: AreaAllocationRule[]): AllocationResult[] {
  return allocateRules(charges, rules, (rule) => (rule as AreaAllocationRule).areaId, "areaAllocationEligible");
}

export function allocatePartnerShares(charges: CalculatedCharge[], rules: PartnerShareRule[]): AllocationResult[] {
  return allocateRules(charges, rules, (rule) => (rule as PartnerShareRule).beneficiaryId, "partnerShareEligible");
}

export function calculateCommissions(charges: CalculatedCharge[], rules: CommissionRule[]): AllocationResult[] {
  const candidates = eligibleCharges(charges, "commissionEligible");
  const result: AllocationResult[] = [];
  for (const rule of rules) {
    const base = moneyCents(
      candidates
        .filter((charge) => rule.componentId === undefined || charge.component.id === rule.componentId)
        .reduce((sum, charge) => sum + charge.amountCents, BigInt(0)),
    );
    result.push({
      ruleId: rule.id,
      componentId: rule.componentId,
      beneficiaryId: rule.beneficiaryId,
      amountCents: rule.mode === "valor" ? rule.amountCents : percentageOf(base, rule.percentageBasisPoints),
    });
  }
  return result;
}

export function buildMemoryItem(charge: CalculatedCharge, index: number): BillingMemoryItem {
  return {
    id: `charge:${index}:${charge.component.id}`,
    category: charge.bucket === "reembolsos" ? "reimbursement" : "charge",
    componentId: charge.component.id,
    description: charge.component.description,
    amountCents: charge.amountCents,
    quantity: charge.quantity,
    unitAmountCents: charge.unitAmountCents,
    percentageBasisPoints: charge.percentageBasisPoints,
  };
}

export function calculateMonthlyBilling(input: BillingCalculationInput): BillingCalculationResult {
  if (input.version.effectiveFrom > input.competency ||
      (input.version.effectiveTo !== null && input.competency > input.version.effectiveTo)) {
    throw new Error("Contract version is not effective for the requested competency");
  }

  const blockers: BillingBlocker[] = [];
  const charges = selectApplicableComponents(input.version.components, input.competency)
    .map((component) => calculateComponent(component, input, blockers))
    .filter((charge): charge is CalculatedCharge => charge !== null);

  let honorarios = BigInt(0);
  let tributos = BigInt(0);
  let reembolsos = BigInt(0);
  const items = charges.map(buildMemoryItem);

  for (const charge of charges) {
    if (charge.bucket === "reembolsos") {
      reembolsos += charge.amountCents;
      continue;
    }

    const tax = charge.component.tax;
    if (tax?.mode === "included") {
      const taxAmount = (charge.amountCents * BigInt(tax.percentageBasisPoints)) /
        BigInt(10_000 + tax.percentageBasisPoints);
      tributos += taxAmount;
      honorarios += charge.amountCents - taxAmount;
      items.push({
        id: `tax:${charge.component.id}`,
        category: "tax",
        componentId: charge.component.id,
        description: `Tributo incluído em ${charge.component.description}`,
        amountCents: moneyCents(taxAmount),
        percentageBasisPoints: tax.percentageBasisPoints,
      });
    } else {
      honorarios += charge.amountCents;
      if (tax?.mode === "added") {
        const taxAmount = percentageOf(charge.amountCents, tax.percentageBasisPoints);
        tributos += taxAmount;
        items.push({
          id: `tax:${charge.component.id}`,
          category: "tax",
          componentId: charge.component.id,
          description: `Tributo adicional em ${charge.component.description}`,
          amountCents: taxAmount,
          percentageBasisPoints: tax.percentageBasisPoints,
        });
      }
    }
  }

  const areaAllocations = allocateByArea(charges, input.version.areaAllocations);
  const partnerShares = allocatePartnerShares(charges, input.version.partnerShares);
  const commissions = calculateCommissions(charges, input.version.commissions);
  partnerShares.forEach((allocation, index) => items.push({
    id: `partner:${index}:${allocation.ruleId}`,
    category: "partner_share",
    componentId: allocation.componentId,
    description: "Participação de sócio",
    amountCents: allocation.amountCents,
  }));
  commissions.forEach((allocation, index) => items.push({
    id: `commission:${index}:${allocation.ruleId}`,
    category: "commission",
    componentId: allocation.componentId,
    description: "Comissão",
    amountCents: allocation.amountCents,
  }));

  return {
    honorariosCents: moneyCents(honorarios),
    tributosCents: moneyCents(tributos),
    reembolsosCents: moneyCents(reembolsos),
    totalCents: moneyCents(honorarios + tributos + reembolsos),
    items,
    blockers,
    areaAllocations,
    partnerShares,
    commissions,
  };
}
