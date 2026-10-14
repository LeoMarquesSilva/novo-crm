import { normalizeImportedAreaKey, type ContractImportExtraction } from "@/lib/contract-import/schemas";
import type { SioeRateioSnapshot } from "@/lib/contract-import/sioe-rateio";
import type { ContractPrefillResult } from "@/modules/contracts/application/services/build-contract-prefill";
import { onlyDigits, type ClientOnboardingPayload } from "@/modules/crm/domain/client-onboarding";

type ExtractionComponent = ContractImportExtraction["components"][number];

const EXTRACTION_KINDS = new Set<ExtractionComponent["kind"]>([
  "mensal_fixo",
  "mensal_escalonado",
  "mensal_preco_fechado",
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

  const components: ExtractionComponent[] = [];
  for (const { value } of input.prefill.billingComponents) {
    const kind = EXTRACTION_KINDS.has(value.kind as ExtractionComponent["kind"])
      ? (value.kind as ExtractionComponent["kind"])
      : value.kind === "mensal_condicionado"
        ? "mensal_fixo"
        : null;
    if (!kind) continue;
    const firstInstallment = value.installments?.[0];
    components.push({
      kind,
      description: value.description,
      amountCents: toNumber(value.amountCents),
      percentageBasisPoints: value.percentageBasisPoints ?? null,
      installmentCount: value.installments?.length ? value.installments.length : null,
      installmentAmountCents: toNumber(firstInstallment?.amountCents ?? null),
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
    firstInvoiceAt: onboarding?.financeiro.primeiroFaturamentoCondicionado
      ? null
      : onboarding?.financeiro.primeiroFaturamento || null,
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

/**
 * Junta lead e PDF. O que o responsável e Operações Legais confirmaram no cadastro
 * (vigência, primeiro faturamento, reajuste) prevalece e o PDF completa o que falta;
 * cobrança (componentes) vem do contrato assinado quando a IA achou, senão da proposta.
 */
export function mergeLeadAndPdfExtraction(
  lead: ContractImportExtraction,
  pdf: ContractImportExtraction | null,
): { extraction: ContractImportExtraction; divergences: InclusionDivergence[] } {
  if (!pdf) return { extraction: lead, divergences: [] };
  const divergences: InclusionDivergence[] = [];
  const compare = (field: string, a: string | null | undefined, b: string | null | undefined) => {
    if (a && b && a.trim() !== b.trim()) divergences.push({ field, leadValue: a, pdfValue: b });
  };
  compare("startsAt", lead.startsAt, pdf.startsAt);
  compare("firstInvoiceAt", lead.firstInvoiceAt, pdf.firstInvoiceAt);
  compare("adjustmentIndex", lead.adjustmentIndex, pdf.adjustmentIndex);

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

  return {
    extraction: {
      ...pdf,
      parties: lead.parties.length ? lead.parties : pdf.parties,
      startsAt: lead.startsAt ?? pdf.startsAt ?? null,
      firstInvoiceAt: lead.firstInvoiceAt ?? pdf.firstInvoiceAt ?? null,
      firstInvoiceConditioned: lead.firstInvoiceConditioned || pdf.firstInvoiceConditioned,
      adjustmentIndex: lead.adjustmentIndex ?? pdf.adjustmentIndex ?? null,
      areas: [...areas.values()],
      components: pdf.components.length > 0 ? pdf.components : lead.components,
    },
    divergences,
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
