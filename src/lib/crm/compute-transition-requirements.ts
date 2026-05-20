import {
  evaluateCondition,
  type FieldCondition,
  type FieldDefinition,
} from "@/lib/crm/crm-field-schema";
import { fieldOptionsFromDb } from "@/lib/crm/pipeline-field-values";
import { normalizeLabelKey } from "@/lib/crm/field-code";
import { isEmptyOrInvalidDateBrStoredValue } from "@/lib/crm/date-br";
import { isValidFullNameTokens } from "@/lib/crm/full-name";
import { getPayloadFieldsRequiredForStage } from "@/modules/crm/domain/workflow-rules";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type PipelineCode = "vendas" | "pos_venda";

type FormValues = Record<string, string | string[] | undefined>;

function trimStr(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return "";
}

function valueJsonToFormValue(raw: unknown): string | string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

export function mapDbFieldToDefinition(row: Record<string, unknown>): FieldDefinition {
  return {
    id: String(row.id),
    field_code: String(row.field_code),
    label: String(row.label),
    field_type: String(row.field_type),
    is_required: Boolean(row.is_required),
    condition_json: (row.condition_json as FieldCondition) ?? null,
    field_options: fieldOptionsFromDb(row.field_options),
    sort_order: Number(row.sort_order ?? 0),
    stage_code: row.stage_code != null ? String(row.stage_code) : null,
    pipeline_code: String(row.pipeline_code ?? "vendas"),
    is_active: row.is_active !== false,
  };
}

/**
 * Já capturados no cadastro do lead; não exibir nem validar na transição para confecção de proposta.
 * Inclui aliases criados no admin (`razao_social_cp`, `cnpj_cp`) além do seed (`cp_*`).
 */
const HIDDEN_CONFECCAO_PROPOSTA_FIELD_CODES = new Set([
  "cp_razao_social",
  "cp_cnpj",
  "razao_social_cp",
  "cnpj_cp",
  /** Desativado no CRM (só obrigatório em fluxo RD legado). */
  "cp_demais_razoes",
  "demais_razoes_sociais_cp",
]);

export function filterConfeccaoPropostaTransitionDefinitions(
  defs: FieldDefinition[],
  params: { pipeline: PipelineCode; nextStage: string },
): FieldDefinition[] {
  if (params.pipeline !== "vendas" || params.nextStage !== "confeccao_proposta") {
    return defs;
  }
  return defs.filter((f) => !HIDDEN_CONFECCAO_PROPOSTA_FIELD_CODES.has(f.field_code));
}

/**
 * Mantém um campo por label normalizado na transição para confecção de proposta,
 * priorizando códigos canónicos `cp_*` e `sort_order` menor.
 */
/**
 * Em `proposta_enviada` o URL oficial é `oportunidades.link_proposta` (bloco "Link da proposta" do modal).
 * Remove `field_definitions` que repetem o mesmo pedido (evita dois inputs iguais).
 */
export function filterPropostaEnviadaDuplicateLinkFields(
  defs: FieldDefinition[],
  params: { pipeline: PipelineCode; nextStage: string },
): FieldDefinition[] {
  if (params.pipeline !== "vendas" || params.nextStage !== "proposta_enviada") {
    return defs;
  }
  return defs.filter((f) => !isDuplicateConfigurableLinkProposta(f));
}

function isDuplicateConfigurableLinkProposta(f: FieldDefinition): boolean {
  const lc = f.field_code.toLowerCase();
  if (
    lc === "link_proposta" ||
    lc === "cp_link_proposta" ||
    lc === "link_da_proposta"
  ) {
    return true;
  }
  const nk = normalizeLabelKey(f.label);
  return nk.includes("link da proposta");
}

export function dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(
  defs: FieldDefinition[],
  params: { pipeline: PipelineCode; nextStage: string },
): FieldDefinition[] {
  if (params.pipeline !== "vendas" || params.nextStage !== "confeccao_proposta") {
    return defs;
  }

  const groups = new Map<string, FieldDefinition[]>();
  for (const d of defs) {
    const nk = normalizeLabelKey(d.label);
    const key = nk || `__id:${d.field_code}`;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }

  const winnerCodeByKey = new Map<string, string>();
  for (const [key, group] of groups) {
    if (group.length === 1) {
      winnerCodeByKey.set(key, group[0].field_code);
      continue;
    }
    const sorted = [...group].sort((a, b) => {
      const aCp = a.field_code.startsWith("cp_") ? 0 : 1;
      const bCp = b.field_code.startsWith("cp_") ? 0 : 1;
      if (aCp !== bCp) return aCp - bCp;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.field_code.localeCompare(b.field_code);
    });
    winnerCodeByKey.set(key, sorted[0].field_code);
  }

  return defs.filter((d) => {
    const nk = normalizeLabelKey(d.label);
    const key = nk || `__id:${d.field_code}`;
    return winnerCodeByKey.get(key) === d.field_code;
  });
}

function isEmptyValue(v: string | string[] | undefined): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  return !v || v.trim() === "";
}

function isEmptyPhone(v: string | string[] | undefined): boolean {
  if (v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  const digits = String(v).replace(/\D/g, "");
  return digits.length < 10;
}

/** Campos obrigatórios visíveis e ainda vazios (bloqueiam a transição). */
export function listBlockingCustomFields(
  defs: FieldDefinition[],
  values: FormValues,
): FieldDefinition[] {
  const blocking: FieldDefinition[] = [];
  const visible = defs
    .filter((f) => f.is_active !== false)
    .filter((f) => evaluateCondition(f.condition_json as FieldCondition, values));

  for (const field of visible) {
    if (!field.is_required) continue;
    const raw = values[field.field_code];
    const empty =
      field.field_type === "phone"
        ? isEmptyPhone(raw)
        : field.field_type === "date_br"
          ? isEmptyOrInvalidDateBrStoredValue(raw)
          : isEmptyValue(raw);
    if (empty) {
      blocking.push(field);
      continue;
    }
    if (field.field_code === "cp_nome_focal") {
      const s = trimStr(raw);
      if (s && !isValidFullNameTokens(s)) {
        blocking.push(field);
      }
    }
  }
  return blocking;
}

/** Valor preenchido mas só com um nome (sem sobrenome) em `cp_nome_focal`. */
export function isCpNomeFocalSingleTokenOnly(values: FormValues): boolean {
  const s = trimStr(values.cp_nome_focal);
  return Boolean(s) && !isValidFullNameTokens(s);
}

/** Mensagem por campo para `422` na API de transição. */
export function formatTransitionBlockingError(
  field: FieldDefinition,
  values: FormValues,
): string {
  if (field.field_code === "cp_nome_focal") {
    const s = trimStr(values[field.field_code]);
    if (s && !isValidFullNameTokens(s)) {
      return "Informe o nome completo (nome e sobrenome) do ponto focal / Comercial.";
    }
  }
  return `Campo obrigatório: ${field.label}`;
}

export interface LeadIntakeSnapshot {
  needed: boolean;
  showFields: boolean;
  local_reuniao: string;
  data_reuniao: string;
  horario_reuniao: string;
}

export function computeLeadIntakeRequirement(params: {
  nextStage: OpportunityStage;
  intakeRow: {
    local_reuniao: string | null;
    data_reuniao: string | null;
    horario_reuniao: string | null;
  } | null;
}): { snapshot: LeadIntakeSnapshot | null; blockingReason: string | null } {
  if (params.nextStage !== "reuniao") {
    return { snapshot: null, blockingReason: null };
  }

  if (!params.intakeRow) {
    return {
      snapshot: null,
      blockingReason:
        "Este lead não possui ficha de intake (cadastro inicial). Não é possível agendar a Reunião sem essa base; abra o suporte ou recadastre o lead.",
    };
  }

  const local = trimStr(params.intakeRow.local_reuniao);
  const data = params.intakeRow.data_reuniao
    ? String(params.intakeRow.data_reuniao).slice(0, 10)
    : "";
  const hora = params.intakeRow.horario_reuniao
    ? String(params.intakeRow.horario_reuniao).slice(0, 5)
    : "";

  const incomplete = !local || !data || !hora;
  return {
    snapshot: {
      needed: incomplete,
      showFields: true,
      local_reuniao: local,
      data_reuniao: data,
      horario_reuniao: hora,
    },
    blockingReason: null,
  };
}

export function linkFieldsMissing(params: {
  nextStage: OpportunityStage;
  linkProposta: string | null | undefined;
  linkContrato: string | null | undefined;
}): { linkProposta: boolean; linkContrato: boolean } {
  const required = getPayloadFieldsRequiredForStage(params.nextStage);
  return {
    linkProposta:
      required.includes("linkProposta") && !trimStr(params.linkProposta ?? ""),
    linkContrato:
      required.includes("linkContrato") && !trimStr(params.linkContrato ?? ""),
  };
}

export function mergeFieldValuesFromDb(
  defs: FieldDefinition[],
  rows: { field_definition_id: string; value_json: unknown }[],
): FormValues {
  const byDefId = new Map(rows.map((r) => [r.field_definition_id, r.value_json]));
  const values: FormValues = {};
  for (const d of defs) {
    const json = byDefId.get(d.id);
    values[d.field_code] = valueJsonToFormValue(json);
  }
  return values;
}

const BRAZIL_TZ = "America/Sao_Paulo";

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function ymdToUtcNoon(y: number, mo: number, d: number): Date {
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

function addCalendarDays(y: number, mo: number, d: number, delta: number): {
  y: number;
  m: number;
  d: number;
} {
  const x = new Date(Date.UTC(y, mo - 1, d + delta, 12, 0, 0));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

function compareYmd(
  a: { y: number; m: number; d: number },
  b: { y: number; m: number; d: number },
): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function isWeekdaySun0(y: number, mo: number, d: number): boolean {
  const wd = ymdToUtcNoon(y, mo, d).getUTCDay();
  return wd !== 0 && wd !== 6;
}

/** Dias úteis (seg–sex), do dia seguinte a `fromYmd` até `toYmd` inclusive. */
export function countBusinessDaysFromTomorrowInclusive(
  fromYmd: string,
  toYmd: string,
): number | null {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  if (!from || !to) return null;
  let { y, m, d } = from;
  ({ y, m, d } = addCalendarDays(y, m, d, 1));
  let count = 0;
  while (compareYmd({ y, m, d }, to) <= 0) {
    if (isWeekdaySun0(y, m, d)) count += 1;
    ({ y, m, d } = addCalendarDays(y, m, d, 1));
  }
  return count;
}

function todayYmdInTimeZone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Avisos não bloqueantes para o modal de transição (ex.: prazo &lt; 2 dias úteis).
 */
export function buildTransitionWarnings(params: {
  pipeline: PipelineCode;
  nextStage: string;
  fieldValues: FormValues;
}): string[] {
  const warnings: string[] = [];
  if (params.pipeline !== "vendas" || params.nextStage !== "confeccao_proposta") {
    return warnings;
  }
  const raw = params.fieldValues.cp_prazo_entrega;
  const prazo = typeof raw === "string" ? raw.trim() : "";
  if (!prazo) return warnings;

  const todayBr = todayYmdInTimeZone(BRAZIL_TZ);
  const n = countBusinessDaysFromTomorrowInclusive(todayBr, prazo);
  if (n === null) return warnings;
  if (n < 2) {
    warnings.push(
      "O prazo para entrega é menor que 2 dias úteis a partir de hoje. Sinalize exceções e motivos junto ao time responsável.",
    );
  }
  return warnings;
}

/**
 * Lead criado sem trilha de DUE: pré-preenche "Realizou Due Diligence?" como Não quando ainda vazio.
 */
export function applyConfeccaoPropostaDefaults(
  fieldValues: FormValues,
  params: { haveraDueDiligence: boolean | null | undefined },
): FormValues {
  if (params.haveraDueDiligence !== false) return fieldValues;
  const cur = fieldValues.cp_realizou_due;
  if (typeof cur === "string" && cur.trim() !== "") return fieldValues;
  return { ...fieldValues, cp_realizou_due: "Nao" };
}
