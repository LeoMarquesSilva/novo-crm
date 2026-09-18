import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { ADJUSTMENT_INDEX_OPTIONS } from "@/components/crm/contracts/contract-setup-form-helpers";

const partySchema = z.object({
  razaoSocial: z.string(),
  documento: z.string(),
  documentoTipo: z.enum(["cnpj", "cpf", "outro"]).default("cnpj"),
  endereco: z.string().nullable().optional(),
  role: z.enum(["contratante", "relacionada"]).default("contratante"),
});

const areaSchema = z.object({
  areaKey: z.string(),
  includedProcesses: z.number().nullable().optional(),
  includedHours: z.number().nullable().optional(),
});

const componentSchema = z.object({
  kind: z.enum([
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
  ]),
  description: z.string(),
  amountCents: z.number().int().nullable().optional(),
  percentageBasisPoints: z.number().int().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
  installmentCount: z.number().int().nullable().optional(),
  installmentAmountCents: z.number().int().nullable().optional(),
  firstDueDate: z.string().nullable().optional(),
  requiresManualRelease: z.boolean().optional(),
  includedQuantity: z.number().nullable().optional(),
  unitAmountCents: z.number().int().nullable().optional(),
  chargeMode: z.enum(["quantidade_total", "excedente"]).nullable().optional(),
  areaKey: z.string().nullable().optional(),
});

const extrasSchema = z.object({
  objectText: z.string().nullable().optional(),
  solidarity: z.boolean().nullable().optional(),
  exitoBands: z.string().nullable().optional(),
  lgpd: z.boolean().nullable().optional(),
  confidentiality: z.boolean().nullable().optional(),
  moraFinePercent: z.number().nullable().optional(),
  kmRateCents: z.number().int().nullable().optional(),
}).default({});

export const contractImportExtractionSchema = z.object({
  groupName: z.string().nullable().optional(),
  parties: z.array(partySchema).default([]),
  startsAt: z.string().nullable().optional(),
  signedAt: z.string().nullable().optional(),
  indefinite: z.boolean().default(true),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  firstInvoiceAt: z.string().nullable().optional(),
  firstInvoiceConditioned: z.boolean().default(false),
  adjustmentIndex: z.string().nullable().optional(),
  taxMode: z.enum(["included", "added"]).nullable().optional(),
  areas: z.array(areaSchema).default([]),
  components: z.array(componentSchema).default([]),
  d4signUuid: z.string().nullable().optional(),
  signers: z
    .array(z.object({ name: z.string(), email: z.string().nullable().optional() }))
    .default([]),
  extras: extrasSchema,
});

export type ContractImportExtraction = z.infer<typeof contractImportExtractionSchema>;

export function parseContractImportExtraction(raw: unknown): ContractImportExtraction {
  return contractImportExtractionSchema.parse(raw);
}

export function normalizeImportedAreaKey(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const canonical = normalizePracticeAreaKey(value.trim());
  if ((CRM_PRACTICE_AREAS as readonly string[]).includes(canonical)) return canonical;
  const lowered = canonical.toLocaleLowerCase("pt-BR");
  if (lowered.includes("trabalh")) return "Trabalhista";
  if (lowered.includes("reestrut") || lowered.includes("insolven")) {
    return "Reestruturação e Insolvência";
  }
  if (lowered.includes("cível") || lowered.includes("civel")) return "Cível";
  if (lowered.includes("tribut")) return "Tributário";
  if (lowered.includes("societ") || lowered.includes("contrat")) {
    return "Societário e Contratos";
  }
  return canonical;
}

export function normalizeAdjustmentIndex(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const compact = value.trim().toUpperCase().replace(/\s+/g, "-");
  const match = ADJUSTMENT_INDEX_OPTIONS.find((option) => option.toUpperCase() === compact);
  return match ?? null;
}

export const contractImportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    groupName: { type: ["string", "null"] },
    parties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          razaoSocial: { type: "string" },
          documento: { type: "string" },
          documentoTipo: { type: "string", enum: ["cnpj", "cpf", "outro"] },
          endereco: { type: ["string", "null"] },
          role: { type: "string", enum: ["contratante", "relacionada"] },
        },
        required: ["razaoSocial", "documento", "documentoTipo", "endereco", "role"],
      },
    },
    startsAt: { type: ["string", "null"] },
    signedAt: { type: ["string", "null"] },
    indefinite: { type: "boolean" },
    dueDay: { type: ["integer", "null"] },
    firstInvoiceAt: { type: ["string", "null"] },
    firstInvoiceConditioned: { type: "boolean" },
    adjustmentIndex: { type: ["string", "null"] },
    taxMode: { type: ["string", "null"], enum: ["included", "added", null] },
    areas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          areaKey: { type: "string" },
          includedProcesses: { type: ["number", "null"] },
          includedHours: { type: ["number", "null"] },
        },
        required: ["areaKey", "includedProcesses", "includedHours"],
      },
    },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [
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
            ],
          },
          description: { type: "string" },
          amountCents: { type: ["integer", "null"] },
          percentageBasisPoints: { type: ["integer", "null"] },
          effectiveFrom: { type: ["string", "null"] },
          effectiveTo: { type: ["string", "null"] },
          installmentCount: { type: ["integer", "null"] },
          installmentAmountCents: { type: ["integer", "null"] },
          firstDueDate: { type: ["string", "null"] },
          requiresManualRelease: { type: "boolean" },
          includedQuantity: { type: ["number", "null"] },
          unitAmountCents: { type: ["integer", "null"] },
          chargeMode: { type: ["string", "null"], enum: ["quantidade_total", "excedente", null] },
          areaKey: { type: ["string", "null"] },
        },
        required: [
          "kind",
          "description",
          "amountCents",
          "percentageBasisPoints",
          "effectiveFrom",
          "effectiveTo",
          "installmentCount",
          "installmentAmountCents",
          "firstDueDate",
          "requiresManualRelease",
          "includedQuantity",
          "unitAmountCents",
          "chargeMode",
          "areaKey",
        ],
      },
    },
    d4signUuid: { type: ["string", "null"] },
    signers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          email: { type: ["string", "null"] },
        },
        required: ["name", "email"],
      },
    },
    extras: {
      type: "object",
      additionalProperties: false,
      properties: {
        objectText: { type: ["string", "null"] },
        solidarity: { type: ["boolean", "null"] },
        exitoBands: { type: ["string", "null"] },
        lgpd: { type: ["boolean", "null"] },
        confidentiality: { type: ["boolean", "null"] },
        moraFinePercent: { type: ["number", "null"] },
        kmRateCents: { type: ["integer", "null"] },
      },
      required: [
        "objectText",
        "solidarity",
        "exitoBands",
        "lgpd",
        "confidentiality",
        "moraFinePercent",
        "kmRateCents",
      ],
    },
  },
  required: [
    "groupName",
    "parties",
    "startsAt",
    "signedAt",
    "indefinite",
    "dueDay",
    "firstInvoiceAt",
    "firstInvoiceConditioned",
    "adjustmentIndex",
    "taxMode",
    "areas",
    "components",
    "d4signUuid",
    "signers",
    "extras",
  ],
} as const;
