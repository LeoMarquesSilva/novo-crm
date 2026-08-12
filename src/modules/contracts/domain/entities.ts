import type { MoneyCents } from "./money";

export type BillingComponentKind =
  | "mensal_fixo"
  | "mensal_preco_fechado"
  | "mensal_escalonado"
  | "variavel_processo"
  | "variavel_hora"
  | "mensal_condicionado"
  | "spot"
  | "manutencao"
  | "exito_percentual"
  | "exito_valor_fixo"
  | "acordo"
  | "despesa_km"
  | "reembolso"
  | "ajuste";

export type VariableChargeMode = "quantidade_total" | "excedente";
export type AllocationMode = "percentual" | "valor";

export type TaxTreatment = {
  mode: "added" | "included";
  percentageBasisPoints: number;
};

type ComponentBase = {
  id: string;
  kind: BillingComponentKind;
  description: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  areaId?: string;
  tax?: TaxTreatment;
  areaAllocationEligible?: boolean;
  partnerShareEligible?: boolean;
  commissionEligible?: boolean;
};

type RecurringComponent = ComponentBase & {
  kind: "mensal_fixo" | "mensal_escalonado" | "manutencao";
  amountCents: MoneyCents;
};

type InstallmentComponent = ComponentBase & {
  kind: "mensal_preco_fechado";
  installments: BillingInstallment[];
};

type SpotComponent = ComponentBase & {
  kind: "spot";
  amountCents?: MoneyCents;
  installments?: BillingInstallment[];
  requiresManualRelease: boolean;
};

type VariableComponent = ComponentBase & {
  kind: "variavel_processo" | "variavel_hora" | "despesa_km";
  chargeMode: VariableChargeMode;
  includedQuantity: number;
  unitAmountCents: MoneyCents | null;
};

type FixedManualComponent = ComponentBase & {
  kind: "mensal_condicionado" | "exito_valor_fixo";
  amountCents: MoneyCents;
  requiresManualRelease: true;
};

type PercentageManualComponent = ComponentBase & {
  kind: "exito_percentual";
  percentageBasisPoints: number;
  requiresManualRelease: true;
};

type ReimbursementComponent = ComponentBase & {
  kind: "reembolso";
  requiresManualRelease: true;
};

type AgreementComponent = ComponentBase & {
  kind: "acordo";
  amountCents?: MoneyCents;
  percentageBasisPoints?: number;
  installments?: BillingInstallment[];
  requiresManualRelease: boolean;
};

type AdjustmentComponent = ComponentBase & {
  kind: "ajuste";
  amountCents: MoneyCents;
  reason: string;
};

export type BillingComponent =
  | RecurringComponent
  | InstallmentComponent
  | SpotComponent
  | VariableComponent
  | FixedManualComponent
  | PercentageManualComponent
  | ReimbursementComponent
  | AgreementComponent
  | AdjustmentComponent;

export type BillingInstallment = {
  number: number;
  competency: string;
  amountCents: MoneyCents;
};

export type ContractConsumption = {
  id: string;
  componentId: string;
  areaId?: string;
  kind: "processo" | "hora" | "quilometro" | "valor_manual";
  quantity?: number;
  amountCents?: MoneyCents;
};

export type ManualBillingResolution = {
  componentId: string;
  competency?: string;
  released: boolean;
  amountCents?: MoneyCents;
  baseCents?: MoneyCents;
  reason?: string;
};

export type AreaAllocationRule =
  | { id: string; componentId?: string; areaId: string; mode: "percentual"; percentageBasisPoints: number }
  | { id: string; componentId?: string; areaId: string; mode: "valor"; amountCents: MoneyCents };

export type PartnerShareRule = {
  id: string;
  componentId?: string;
  beneficiaryId: string;
  percentageBasisPoints: number;
};

export type CommissionRule =
  | {
      id: string;
      componentId?: string;
      beneficiaryId: string;
      mode: "percentual";
      percentageBasisPoints: number;
    }
  | {
      id: string;
      componentId?: string;
      beneficiaryId: string;
      mode: "valor";
      amountCents: MoneyCents;
    };

export type ContractVersionSnapshot = {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  components: BillingComponent[];
  areaAllocations: AreaAllocationRule[];
  partnerShares: PartnerShareRule[];
  commissions: CommissionRule[];
};

export type BillingCalculationInput = {
  contractId: string;
  competency: string;
  version: ContractVersionSnapshot;
  consumptions: ContractConsumption[];
  manualResolutions: ManualBillingResolution[];
};

export type BillingMemoryItem = {
  id: string;
  category: "charge" | "tax" | "reimbursement" | "partner_share" | "commission";
  componentId?: string;
  description: string;
  amountCents: MoneyCents;
  quantity?: number;
  unitAmountCents?: MoneyCents;
  percentageBasisPoints?: number;
};

export type BillingBlocker = {
  code: "missing_consumption" | "missing_excess_rate" | "missing_unit_rate" | "manual_release_required";
  componentId: string;
  message: string;
  excessQuantity?: number;
};

export type AllocationResult = {
  ruleId: string;
  componentId?: string;
  beneficiaryId: string;
  amountCents: MoneyCents;
};

export type BillingCalculationResult = {
  honorariosCents: MoneyCents;
  tributosCents: MoneyCents;
  reembolsosCents: MoneyCents;
  totalCents: MoneyCents;
  items: BillingMemoryItem[];
  blockers: BillingBlocker[];
  areaAllocations: AllocationResult[];
  partnerShares: AllocationResult[];
  commissions: AllocationResult[];
};

export type AnnualReferenceInput = {
  projectionStart: string;
  version: ContractVersionSnapshot;
  manualResolutions: ManualBillingResolution[];
  override?: { amountCents: MoneyCents; reason: string };
};

export type AnnualReferenceCompetency = {
  competency: string;
  amountCents: MoneyCents;
};

export type AnnualReferenceResult = {
  calculatedCents: MoneyCents;
  referenceCents: MoneyCents;
  competencies: AnnualReferenceCompetency[];
  overrideReason?: string;
};
