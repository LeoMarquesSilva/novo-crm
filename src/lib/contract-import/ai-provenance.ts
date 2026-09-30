import type { Json } from "@/lib/supabase/database.types";
import type { SioeRateioSnapshot } from "./sioe-rateio";
import type { ContractImportExtraction, ContractImportEvidence } from "./schemas";

export type AiProvenanceSource = "contrato" | "sioe";

export type AiProvenanceItem = {
  field: string;
  quote: string;
  clause: string | null;
  source: AiProvenanceSource;
  extractedValue: string | null;
};

export type ImportedOrigemSnapshot = {
  origin: "contrato";
  origem_importacao: "pdf";
  aiProvenance: AiProvenanceItem[];
  sources: Record<string, "contrato" | "sioe" | "manual">;
  reviewedFieldKeys: string[];
};

const IDENTITY_FIELDS = [
  "groupName",
  "clientId",
  "startsAt",
  "indefinite",
  "dueDay",
  "firstInvoiceAt",
  "firstInvoiceConditioned",
  "adjustmentIndex",
] as const;

export function normalizeProvenanceField(field: string): string {
  const key = field.trim();
  if (key.startsWith("areas")) return "areas";
  if (key.startsWith("component") || key === "taxMode") return key === "taxMode" ? "taxMode" : "components";
  if (key.startsWith("allocat") || key === "rateio") return "allocations";
  if (key === "signedAt") return "startsAt";
  return key;
}

export function provenanceFieldStep(field: string): number {
  const key = normalizeProvenanceField(field);
  if (["areas"].includes(key)) return 1;
  if (["components", "taxMode"].includes(key)) return 2;
  if (["allocations"].includes(key)) return 3;
  return 0;
}

function extractedValueForField(extraction: ContractImportExtraction, field: string): string | null {
  const key = normalizeProvenanceField(field);
  switch (key) {
    case "groupName":
      return extraction.groupName ?? null;
    case "startsAt":
      return extraction.startsAt ?? extraction.signedAt ?? null;
    case "indefinite":
      return String(extraction.indefinite);
    case "dueDay":
      return extraction.dueDay != null ? String(extraction.dueDay) : null;
    case "firstInvoiceAt":
      return extraction.firstInvoiceAt ?? null;
    case "firstInvoiceConditioned":
      return String(extraction.firstInvoiceConditioned);
    case "adjustmentIndex":
      return extraction.adjustmentIndex ?? null;
    case "taxMode":
      return extraction.taxMode ?? null;
    case "areas":
      return extraction.areas.map((area) => area.areaKey).join(", ") || null;
    case "components":
      return extraction.components.map((component) => component.description || component.kind).join("; ") || null;
    default:
      return null;
  }
}

export function buildImportedOrigemSnapshot(input: {
  extraction: ContractImportExtraction;
  sioeRateio?: SioeRateioSnapshot | null;
  extras?: Record<string, unknown>;
}): ImportedOrigemSnapshot & Record<string, unknown> {
  const evidence = input.extraction.evidence ?? [];
  const aiProvenance: AiProvenanceItem[] = evidence.map((item) => {
    const field = normalizeProvenanceField(item.field);
    return {
      field,
      quote: item.quote,
      clause: item.clause ?? null,
      source: "contrato",
      extractedValue: extractedValueForField(input.extraction, field),
    };
  });

  const hasSioe = Boolean(input.sioeRateio?.shares.length);
  if (hasSioe) {
    aiProvenance.push({
      field: "allocations",
      quote: "Rateio percentual lido dos honorários do grupo no SIOE, não do PDF.",
      clause: null,
      source: "sioe",
      extractedValue: input.sioeRateio!.shares
        .map((share) => `${share.areaKey} ${Math.round(share.percentageBasisPoints / 100)}%`)
        .join(", "),
    });
  }

  const sources: Record<string, "contrato" | "sioe" | "manual"> = {};
  for (const field of IDENTITY_FIELDS) sources[field] = "contrato";
  sources.areas = "contrato";
  sources.components = "contrato";
  sources.taxMode = "contrato";
  sources.allocations = hasSioe ? "sioe" : "contrato";

  return {
    origin: "contrato",
    origem_importacao: "pdf",
    aiProvenance,
    sources,
    reviewedFieldKeys: [],
    ...(input.extras ?? {}),
    ...(input.sioeRateio ? { sioeRateio: input.sioeRateio } : {}),
  };
}

export function parseAiProvenance(snapshot: Json | null | undefined): {
  items: AiProvenanceItem[];
  reviewedFieldKeys: string[];
} {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { items: [], reviewedFieldKeys: [] };
  }
  const record = snapshot as Record<string, unknown>;
  const rawItems = Array.isArray(record.aiProvenance) ? record.aiProvenance : [];
  const items: AiProvenanceItem[] = rawItems.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.field !== "string" || typeof row.quote !== "string") return [];
    return [{
      field: normalizeProvenanceField(row.field),
      quote: row.quote,
      clause: typeof row.clause === "string" ? row.clause : null,
      source: row.source === "sioe" ? "sioe" : "contrato",
      extractedValue: typeof row.extractedValue === "string" ? row.extractedValue : null,
    }];
  });
  const reviewedFieldKeys = Array.isArray(record.reviewedFieldKeys)
    ? record.reviewedFieldKeys.filter((value): value is string => typeof value === "string")
    : [];
  return { items, reviewedFieldKeys };
}

export function provenanceLooksAltered(
  extractedValue: string | null | undefined,
  currentValue: string | null | undefined,
): boolean {
  if (!extractedValue?.trim() || !currentValue?.trim()) return false;
  const extracted = extractedValue.trim().toLowerCase().replace(/\s+/g, " ");
  const current = currentValue.trim().toLowerCase().replace(/\s+/g, " ");
  if (extracted === current) return false;
  if (extracted.includes(current) || current.includes(extracted)) return false;
  return true;
}

export function evidenceForField(
  items: AiProvenanceItem[],
  field: string,
): AiProvenanceItem | undefined {
  const key = normalizeProvenanceField(field);
  return items.find((item) => item.field === key);
}

export function summarizeEvidence(evidence: ContractImportEvidence[] | undefined): AiProvenanceItem[] {
  return (evidence ?? []).map((item) => ({
    field: normalizeProvenanceField(item.field),
    quote: item.quote,
    clause: item.clause ?? null,
    source: "contrato" as const,
    extractedValue: null,
  }));
}
