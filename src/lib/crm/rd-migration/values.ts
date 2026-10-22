import { z } from "zod";

import {
  clientOnboardingPayloadSchema,
  type ClientOnboardingPayload,
} from "@/modules/crm/domain/client-onboarding";

/**
 * Valores do formulário "Migrar do RD" (`rd_migracoes.payload`).
 * - cadastro: o que o formulário de Novo Lead pede (vai para `lead_intakes`).
 * - campos: campos configuráveis do funil por `field_code` (`cp_*`, vão para `field_values`).
 * - evidencias: o que o RD já tem das etapas passadas (links do SharePoint, D4Sign, assinatura).
 * - onboarding: cadastro do cliente e faturamento do pós-venda (`lead_client_onboarding.payload`).
 * O schema aceita rascunho; o que falta para cada etapa vem de `computeRdMigrationRequirements`.
 */
export const RD_MIGRATION_SCHEMA_VERSION = 1;

const text = (max = 500) => z.string().trim().max(max).catch("").default("");

export const rdMigrationEmpresaSchema = z.object({
  tipo_documento: z.enum(["CPF", "CNPJ"]).catch("CNPJ").default("CNPJ"),
  razao_social: text(250),
  documento: text(20),
});

export type RdMigrationEmpresa = z.infer<typeof rdMigrationEmpresaSchema>;

const emptyCadastro = {
  empresas: [],
  tipoLead: "",
  tipoIndicacao: "",
  nomeIndicacao: "",
  plataforma: "",
  areaCrossSelling: "",
  decisor: "",
  areasAnalise: [],
  dueDiligence: "" as const,
  dataEntregaDue: "",
  horarioEntregaDue: "",
  localReuniao: "",
  dataReuniao: "",
  horarioReuniao: "",
};

export const rdMigrationCadastroSchema = z
  .object({
    empresas: z.array(rdMigrationEmpresaSchema).max(20).catch([]).default([]),
    tipoLead: text(40),
    tipoIndicacao: text(60),
    nomeIndicacao: text(200),
    plataforma: text(40),
    areaCrossSelling: text(60),
    decisor: text(200),
    areasAnalise: z.array(z.string().trim().max(80)).max(12).catch([]).default([]),
    dueDiligence: z.enum(["", "Sim", "Nao"]).catch("").default(""),
    /** AAAA-MM-DD */
    dataEntregaDue: text(10),
    /** HH:MM */
    horarioEntregaDue: text(5),
    localReuniao: text(200),
    dataReuniao: text(10),
    horarioReuniao: text(5),
  })
  .default(emptyCadastro);

export type RdMigrationCadastro = z.infer<typeof rdMigrationCadastroSchema>;

const emptyEvidencias = {
  linkProposta: "",
  linkContrato: "",
  d4signDocumentUuid: "",
  d4signDocumentName: "",
  dataAssinatura: "",
};

export const rdMigrationEvidenciasSchema = z
  .object({
    linkProposta: text(1000),
    linkContrato: text(1000),
    d4signDocumentUuid: text(64),
    d4signDocumentName: text(300),
    /** AAAA-MM-DD */
    dataAssinatura: text(10),
  })
  .default(emptyEvidencias);

export type RdMigrationEvidencias = z.infer<typeof rdMigrationEvidenciasSchema>;

const fieldValueSchema = z.union([
  z.string().max(60_000),
  z.array(z.string().max(300)).max(40),
]);

export const rdMigrationValuesSchema = z.object({
  version: z.literal(RD_MIGRATION_SCHEMA_VERSION).catch(RD_MIGRATION_SCHEMA_VERSION).default(RD_MIGRATION_SCHEMA_VERSION),
  cadastro: rdMigrationCadastroSchema,
  campos: z.record(z.string().max(80), fieldValueSchema).catch({}).default({}),
  evidencias: rdMigrationEvidenciasSchema,
  onboarding: clientOnboardingPayloadSchema.catch(() => clientOnboardingPayloadSchema.parse({})),
  /** Caminho do campo → origem do valor pré-preenchido ("RD: Gestor do Contrato [CP]"). */
  sources: z.record(z.string(), z.string()).catch({}).default({}),
});

export type RdMigrationValues = z.infer<typeof rdMigrationValuesSchema>;
export type RdMigrationFieldValue = z.infer<typeof fieldValueSchema>;

export function parseRdMigrationValues(raw: unknown): RdMigrationValues {
  const parsed = rdMigrationValuesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : rdMigrationValuesSchema.parse({});
}

export function emptyRdMigrationValues(): RdMigrationValues {
  return rdMigrationValuesSchema.parse({});
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return value;
  return true;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** O valor do rascunho vale quando preenchido; vazio cai no da base (pré-preenchimento). */
function mergePreferFilled(base: unknown, draft: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(draft)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(draft)) {
      out[key] = key in base ? mergePreferFilled(base[key], value) : value;
    }
    return out;
  }
  return isFilled(draft) ? draft : base;
}

/**
 * Rascunho salvo por cima do pré-preenchimento: o que a pessoa digitou vale; campo deixado
 * vazio volta a mostrar o que o RD tem (o RD segue andando até a virada).
 */
export function mergeRdMigrationValues(base: RdMigrationValues, draft: unknown): RdMigrationValues {
  if (!isPlainObject(draft)) return base;
  const merged = mergePreferFilled(base, parseRdMigrationValues(draft)) as RdMigrationValues;
  return parseRdMigrationValues({ ...merged, sources: { ...base.sources, ...(merged.sources ?? {}) } });
}

export type { ClientOnboardingPayload };
