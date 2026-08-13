import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";
import { slugifyFieldCodeFromLabel } from "@/lib/crm/field-code";

export const extractionItemSchema = z.object({
  raw_excerpt: z.string(),
  normalized_template: z.string(),
  suggested_area_key: z.string().nullable(),
  suggested_type_label: z.string(),
  suggested_subtype_label: z.string(),
  conceito: z.string().nullable().optional(),
  replaced_values: z.record(z.string(), z.string()).default({}),
});

export const extractionResponseSchema = z.object({
  escopos: z.array(extractionItemSchema).default([]),
  investimentos: z.array(extractionItemSchema).default([]),
});

export const consolidationSuggestionSchema = z.object({
  template: z.string(),
  tipo_label: z.string(),
  subtipo_label: z.string(),
  conceito: z.string().nullable().optional(),
  source_extraction_indices: z.array(z.number().int().nonnegative()),
  match_existing: z
    .object({
      subtype_id: z.string().uuid(),
      label: z.string(),
    })
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const consolidationResponseSchema = z.object({
  suggestions: z.array(consolidationSuggestionSchema).default([]),
});

export type ExtractionItem = z.infer<typeof extractionItemSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type ConsolidationSuggestion = z.infer<typeof consolidationSuggestionSchema>;
export type ConsolidationResponse = z.infer<typeof consolidationResponseSchema>;

const practiceAreaSet = new Set<string>(CRM_PRACTICE_AREAS);

export function normalizeAreaKey(value: string | null | undefined): {
  areaKey: string | null;
  invalidArea: boolean;
} {
  if (!value?.trim()) return { areaKey: null, invalidArea: false };
  const trimmed = value.trim();
  if (practiceAreaSet.has(trimmed)) return { areaKey: trimmed, invalidArea: false };
  return { areaKey: null, invalidArea: true };
}

export function recomputePlaceholderKeys(template: string, conceito?: string | null): string[] {
  return extractPlaceholderKeysFromText(template, conceito ?? "");
}

export function buildTypeKey(label: string): string {
  return slugifyFieldCodeFromLabel(label).slice(0, 80);
}

export function buildSubtypeKey(label: string): string {
  return slugifyFieldCodeFromLabel(label).slice(0, 80);
}

export const extractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    escopos: {
      type: "array",
      items: extractionItemJsonSchema(),
    },
    investimentos: {
      type: "array",
      items: extractionItemJsonSchema(),
    },
  },
  required: ["escopos", "investimentos"],
} as const;

export const consolidationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          template: { type: "string" },
          tipo_label: { type: "string" },
          subtipo_label: { type: "string" },
          conceito: { type: ["string", "null"] },
          source_extraction_indices: {
            type: "array",
            items: { type: "integer", minimum: 0 },
          },
          match_existing: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  subtype_id: { type: "string" },
                  label: { type: "string" },
                },
                required: ["subtype_id", "label"],
              },
              { type: "null" },
            ],
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: [
          "template",
          "tipo_label",
          "subtipo_label",
          "source_extraction_indices",
        ],
      },
    },
  },
  required: ["suggestions"],
} as const;

function extractionItemJsonSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      raw_excerpt: { type: "string" },
      normalized_template: { type: "string" },
      suggested_area_key: { type: ["string", "null"] },
      suggested_type_label: { type: "string" },
      suggested_subtype_label: { type: "string" },
      conceito: { type: ["string", "null"] },
      replaced_values: {
        type: "object",
        additionalProperties: { type: "string" },
      },
    },
    required: [
      "raw_excerpt",
      "normalized_template",
      "suggested_area_key",
      "suggested_type_label",
      "suggested_subtype_label",
      "replaced_values",
    ],
  };
}

export function parseExtractionResponse(raw: unknown): ExtractionResponse {
  return extractionResponseSchema.parse(raw);
}

export function parseConsolidationResponse(raw: unknown): ConsolidationResponse {
  return consolidationResponseSchema.parse(raw);
}
