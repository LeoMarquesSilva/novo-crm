import type {
  AnnualReferenceInput,
  AnnualReferenceResult,
  BillingComponent,
  ManualBillingResolution,
} from "./entities";
import { moneyCents, type MoneyCents } from "./money";

function addMonths(competency: string, count: number): string {
  const match = /^(\d{4})-(\d{2})-01$/.exec(competency);
  if (!match) {
    throw new Error("Projection start must use YYYY-MM-01");
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function isEffective(component: BillingComponent, competency: string): boolean {
  return component.effectiveFrom <= competency &&
    (component.effectiveTo === null || competency <= component.effectiveTo);
}

function releasedResolution(
  componentId: string,
  competency: string,
  resolutions: ManualBillingResolution[],
): ManualBillingResolution | undefined {
  return resolutions.find(
    (resolution) =>
      resolution.componentId === componentId &&
      resolution.released &&
      (resolution.competency === undefined || resolution.competency === competency),
  );
}

function projectedAmount(
  component: BillingComponent,
  competency: string,
  resolutions: ManualBillingResolution[],
): MoneyCents {
  if (!isEffective(component, competency)) return moneyCents(BigInt(0));

  switch (component.kind) {
    case "mensal_fixo":
    case "mensal_escalonado":
    case "manutencao":
    case "ajuste":
      return component.amountCents;
    case "mensal_preco_fechado":
      return component.installments.find((entry) => entry.competency === competency)?.amountCents ?? moneyCents(BigInt(0));
    case "variavel_processo":
    case "variavel_hora":
    case "despesa_km":
      return moneyCents(BigInt(0));
    case "reembolso":
      return releasedResolution(component.id, competency, resolutions)?.amountCents ?? moneyCents(BigInt(0));
    case "exito_percentual": {
      const resolution = releasedResolution(component.id, competency, resolutions);
      return resolution?.baseCents === undefined
        ? moneyCents(BigInt(0))
        : moneyCents((resolution.baseCents * BigInt(component.percentageBasisPoints)) / BigInt(10_000));
    }
    case "mensal_condicionado":
    case "exito_valor_fixo": {
      const resolution = releasedResolution(component.id, competency, resolutions);
      return resolution ? resolution.amountCents ?? component.amountCents : moneyCents(BigInt(0));
    }
    case "spot":
    case "acordo": {
      if (component.requiresManualRelease && !releasedResolution(component.id, competency, resolutions)) {
        return moneyCents(BigInt(0));
      }
      const installment = component.installments?.find((entry) => entry.competency === competency);
      if (installment) return installment.amountCents;
      if (component.kind === "acordo" && component.percentageBasisPoints !== undefined) {
        const base = releasedResolution(component.id, competency, resolutions)?.baseCents;
        return base === undefined
          ? moneyCents(BigInt(0))
          : moneyCents((base * BigInt(component.percentageBasisPoints)) / BigInt(10_000));
      }
      return component.effectiveFrom === competency
        ? component.amountCents ?? moneyCents(BigInt(0))
        : moneyCents(BigInt(0));
    }
  }
}

export function calculateAnnualReference(input: AnnualReferenceInput): AnnualReferenceResult {
  if (input.override && input.override.reason.trim() === "") {
    throw new Error("Annual override reason is required");
  }

  const competencies = Array.from({ length: 12 }, (_, index) => {
    const competency = addMonths(input.projectionStart, index);
    const amount = input.version.components.reduce(
      (total, component) => total + projectedAmount(component, competency, input.manualResolutions),
      BigInt(0),
    );
    return { competency, amountCents: moneyCents(amount) };
  });
  const calculatedCents = moneyCents(
    competencies.reduce((total, competency) => total + competency.amountCents, BigInt(0)),
  );

  return {
    calculatedCents,
    referenceCents: input.override?.amountCents ?? calculatedCents,
    competencies,
    overrideReason: input.override?.reason.trim(),
  };
}
