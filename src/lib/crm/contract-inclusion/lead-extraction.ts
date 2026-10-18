import {
  normalizeAdjustmentIndex,
  normalizeImportedAreaKey,
  type ContractImportExtraction,
} from "@/lib/contract-import/schemas";
import type { SioeRateioSnapshot } from "@/lib/contract-import/sioe-rateio";
import type { ContractPrefillResult } from "@/modules/contracts/application/services/build-contract-prefill";
import { onlyDigits, type ClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

type ExtractionComponent = ContractImportExtraction["components"][number];

const EXTRACTION_KINDS = new Set<ExtractionComponent["kind"]>([
  "mensal_fixo",
  "mensal_escalonado",
  "mensal_preco_fechado",
  "manutencao",
  "exito_percentual",
  "exito_valor_fixo",
  "despesa_km",
  "reembolso",
  "variavel_processo",
  "variavel_hora",
  "spot",
]);

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Índice do cadastro → opção do gerenciador de contratos ("Outro" fica sem índice). */
function adjustmentIndexFromOnboarding(indice: string): string | null {
  if (!indice || indice === "Outro") return null;
  return indice;
}

/**
 * "Extração" montada com os dados do lead (cadastro confirmado pelo responsável e por
 * Operações Legais + componentes sugeridos da proposta/contrato do CRM), no mesmo formato
 * da leitura por IA do PDF, para passar pelo mesmo mapeador do gerenciador de contratos.
 */
export function buildLeadExtraction(input: {
  onboarding: ClientOnboardingPayload | null;
  prefill: ContractPrefillResult;
}): ContractImportExtraction {
  const onboarding = input.onboarding;
  const areas = new Map<string, ContractImportExtraction["areas"][number]>();
  for (const { value } of input.prefill.areas) {
    const key = normalizeImportedAreaKey(value.areaKey);
    if (!key || areas.has(key)) continue;
    areas.set(key, { areaKey: key, includedProcesses: value.includedProcesses, includedHours: value.includedHours });
  }
  for (const linha of onboarding?.financeiro.rateioPorArea ?? []) {
    const key = normalizeImportedAreaKey(linha.area);
    if (key && !areas.has(key)) areas.set(key, { areaKey: key, includedProcesses: null, includedHours: null });
  }

  const firstInvoiceAt = onboarding?.financeiro.primeiroFaturamentoCondicionado
    ? null
    : onboarding?.financeiro.primeiroFaturamento || null;

  const components: ExtractionComponent[] = [];
  for (const { value } of input.prefill.billingComponents) {
    const kind = EXTRACTION_KINDS.has(value.kind as ExtractionComponent["kind"])
      ? (value.kind as ExtractionComponent["kind"])
      : value.kind === "mensal_condicionado"
        ? "mensal_fixo"
        : null;
    if (!kind) continue;
    const firstInstallment = value.installments?.[0];
    const closedPrice = kind === "mensal_preco_fechado";
    components.push({
      kind,
      description: value.description,
      amountCents: toNumber(value.amountCents),
      percentageBasisPoints: value.percentageBasisPoints ?? null,
      installmentCount: value.installments?.length ? value.installments.length : null,
      installmentAmountCents: toNumber(firstInstallment?.amountCents ?? null),
      // 1ª parcela = primeiro faturamento confirmado no cadastro; as demais seguem a proposta.
      ...(closedPrice
        ? {
            firstDueDate: firstInvoiceAt ?? firstInstallment?.dueDate ?? null,
            installments: value.installments?.map((installment) => ({
              amountCents: toNumber(installment.amountCents),
              dueDate: installment.dueDate,
            })),
          }
        : {}),
      requiresManualRelease: value.requiresManualRelease || value.kind === "mensal_condicionado",
      includedQuantity: value.includedQuantity ?? null,
      unitAmountCents: toNumber(value.unitAmountCents ?? null),
      areaKey: value.areaKey ? normalizeImportedAreaKey(value.areaKey) : null,
    });
  }

  const contratante = onboarding?.cadastro.razaoSocial
    ? [
        {
          razaoSocial: onboarding.cadastro.razaoSocial,
          documento: onboarding.cadastro.documento,
          documentoTipo: (onlyDigits(onboarding.cadastro.documento).length === 11 ? "cpf" : "cnpj") as "cpf" | "cnpj",
          endereco: null,
          role: "contratante" as const,
        },
      ]
    : [];

  return {
    groupName: null,
    parties: contratante,
    startsAt: onboarding?.financeiro.inicioVigencia || null,
    signedAt: null,
    indefinite: true,
    dueDay: null,
    firstInvoiceAt,
    firstInvoiceConditioned: onboarding?.financeiro.primeiroFaturamentoCondicionado ?? false,
    adjustmentIndex: adjustmentIndexFromOnboarding(onboarding?.financeiro.reajuste.indice ?? ""),
    taxMode: null,
    areas: [...areas.values()],
    components,
    d4signUuid: null,
    signers: [],
    extras: { objectText: null },
    evidence: [],
  };
}

export type InclusionDivergence = { field: string; leadValue: string; pdfValue: string };

const SUCCESS_KINDS = new Set<ExtractionComponent["kind"]>(["exito_percentual", "exito_valor_fixo"]);

function hasValue(component: ExtractionComponent): boolean {
  return component.kind === "exito_percentual"
    ? Boolean(component.percentageBasisPoints)
    : Boolean(component.amountCents);
}

/**
 * Cobrança do PDF completada pela proposta onde o contrato não basta:
 * - preço fechado: 1ª parcela no primeiro faturamento do cadastro; se o total e o número de
 *   parcelas batem com a proposta, valores e vencimentos das parcelas vêm dela;
 * - êxito: contrato que remete à proposta ("conforme condições da proposta") ou que não
 *   traz o êxito recebe o percentual/valor da proposta.
 */
function completePdfComponents(
  pdf: ExtractionComponent[],
  lead: ExtractionComponent[],
  firstInvoiceAt: string | null | undefined,
): { components: ExtractionComponent[]; fromProposal: ExtractionComponent[] } {
  const fromProposal: ExtractionComponent[] = [];
  const leadClosed = lead.find((component) => component.kind === "mensal_preco_fechado");
  let components = pdf.map((component) => {
    if (component.kind === "mensal_preco_fechado") {
      const pdfTotal =
        component.amountCents ?? (component.installmentAmountCents ?? 0) * (component.installmentCount ?? 0);
      const sameDeal =
        leadClosed?.installments?.length &&
        leadClosed.installments.length === component.installmentCount &&
        leadClosed.amountCents === pdfTotal;
      return {
        ...component,
        firstDueDate: firstInvoiceAt ?? component.firstDueDate ?? null,
        ...(sameDeal && leadClosed?.installments ? { installments: leadClosed.installments } : {}),
      };
    }
    if (SUCCESS_KINDS.has(component.kind) && !hasValue(component)) {
      const fallback = lead.find((candidate) => candidate.kind === component.kind && hasValue(candidate));
      if (fallback) {
        const completed = {
          ...component,
          amountCents: fallback.amountCents ?? null,
          percentageBasisPoints: fallback.percentageBasisPoints ?? null,
          requiresManualRelease: true,
        };
        fromProposal.push(completed);
        return completed;
      }
    }
    return component;
  });

  const leadSuccess = lead.filter((component) => SUCCESS_KINDS.has(component.kind) && hasValue(component));
  if (leadSuccess.length && !components.some((component) => SUCCESS_KINDS.has(component.kind) && hasValue(component))) {
    // Êxito do PDF sem valor some: o da proposta entra no lugar.
    components = [
      ...components.filter((component) => !SUCCESS_KINDS.has(component.kind)),
      ...leadSuccess,
    ];
    fromProposal.push(...leadSuccess);
  }
  return { components, fromProposal };
}

/**
 * Junta lead e PDF. O que o responsável e Operações Legais confirmaram no cadastro
 * (vigência, primeiro faturamento, reajuste) prevalece e o PDF completa o que falta;
 * cobrança (componentes) vem do contrato assinado quando a IA achou, completada pela
 * proposta (êxito, parcelas); sem PDF, da proposta.
 */
export function mergeLeadAndPdfExtraction(
  lead: ContractImportExtraction,
  pdf: ContractImportExtraction | null,
): {
  extraction: ContractImportExtraction;
  divergences: InclusionDivergence[];
  /** Componentes do PDF completados pela proposta (para a origem no assistente). */
  fromProposal: ExtractionComponent[];
} {
  if (!pdf) return { extraction: lead, divergences: [], fromProposal: [] };
  const divergences: InclusionDivergence[] = [];
  const compare = (field: string, a: string | null | undefined, b: string | null | undefined) => {
    if (a && b && a.trim() !== b.trim()) divergences.push({ field, leadValue: a, pdfValue: b });
  };
  compare("startsAt", lead.startsAt, pdf.startsAt);
  compare("firstInvoiceAt", lead.firstInvoiceAt, pdf.firstInvoiceAt);
  compare(
    "adjustmentIndex",
    normalizeAdjustmentIndex(lead.adjustmentIndex) ?? lead.adjustmentIndex,
    normalizeAdjustmentIndex(pdf.adjustmentIndex) ?? pdf.adjustmentIndex,
  );

  const leadTotal = lead.components.reduce((acc, c) => acc + (c.amountCents ?? 0), 0);
  const pdfTotal = pdf.components.reduce((acc, c) => acc + (c.amountCents ?? 0), 0);
  if (lead.components.length > 0 && pdf.components.length > 0 && leadTotal !== pdfTotal) {
    divergences.push({
      field: "components",
      leadValue: `R$ ${(leadTotal / 100).toFixed(2)}`,
      pdfValue: `R$ ${(pdfTotal / 100).toFixed(2)}`,
    });
  }

  const areas = new Map<string, ContractImportExtraction["areas"][number]>();
  for (const area of [...pdf.areas, ...lead.areas]) {
    const key = normalizeImportedAreaKey(area.areaKey);
    if (key && !areas.has(key)) areas.set(key, { ...area, areaKey: key });
  }

  const firstInvoiceAt = lead.firstInvoiceAt ?? pdf.firstInvoiceAt ?? null;
  const completed =
    pdf.components.length > 0
      ? completePdfComponents(pdf.components, lead.components, firstInvoiceAt)
      : { components: lead.components, fromProposal: [] };

  return {
    extraction: {
      ...pdf,
      parties: lead.parties.length ? lead.parties : pdf.parties,
      startsAt: lead.startsAt ?? pdf.startsAt ?? null,
      firstInvoiceAt,
      firstInvoiceConditioned: lead.firstInvoiceConditioned || pdf.firstInvoiceConditioned,
      adjustmentIndex: lead.adjustmentIndex ?? pdf.adjustmentIndex ?? null,
      areas: [...areas.values()],
      components: completed.components,
    },
    divergences,
    fromProposal: completed.fromProposal,
  };
}

/** Rateio informado no cadastro, no formato que o mapeador do gerenciador de contratos usa. */
export function rateioFromOnboarding(onboarding: ClientOnboardingPayload | null): SioeRateioSnapshot | null {
  const shares = (onboarding?.financeiro.rateioPorArea ?? [])
    .map((linha) => {
      const areaKey = normalizeImportedAreaKey(linha.area);
      const percent = Number(linha.percentual.replace(",", "."));
      return areaKey && Number.isFinite(percent) && percent > 0
        ? { areaKey, percentageBasisPoints: Math.round(percent * 100), amountCents: 0 }
        : null;
    })
    .filter((s): s is { areaKey: string; percentageBasisPoints: number; amountCents: number } => s !== null);
  if (shares.length === 0) return null;
  return { shares, totalCents: 0, competency: null, situacao: "cadastro", ciTitulo: null };
}
