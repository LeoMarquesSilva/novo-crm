import type {
  ContractObjectFieldSource,
  ContractObjectFieldValue,
  ContractRequiredField,
  ContractScope,
} from "./types";

const FIELD_ALIASES: Record<string, string[]> = {
  numero_processo: [
    "numero_processo",
    "NUMERO_PROCESSO",
    "NUM. DO PROCESSO",
    "NUM_DO_PROCESSO",
    "NUM DO PROCESSO",
    "PROCESSO",
    "cc_numero_processo",
    "cp_numero_processo",
  ],
  parte_contraria: [
    "parte_contraria",
    "PARTE_CONTRARIA",
    "PARTE_CONTRÁRIA",
    "PARTE CONTRARIA",
    "PARTE CONTRÁRIA",
    "cc_parte_contraria",
  ],
  vara_tribunal: [
    "vara_tribunal",
    "VARA_TRIBUNAL",
    "VARA",
    "TRIBUNAL",
    "VARA / TRIBUNAL",
    "cc_vara_tribunal",
  ],
  // Alias list própria (sem sobrepor com "numero_processo"/"vara_tribunal"
  // acima): mesmo motivo do qtd_horas_trabalhista/societario logo abaixo — dois
  // escopos (Trabalhista e Cível) podem estar no mesmo contrato, cada um com seu
  // próprio processo. Sem fonte cível distinta ainda, fica só manual/campo cc_
  // próprio — nunca reaproveita o valor do processo trabalhista sem querer.
  numero_processo_civel: ["numero_processo_civel", "NUMERO_PROCESSO_CIVEL", "cc_civel_numero_processo"],
  vara_tribunal_civel: ["vara_tribunal_civel", "VARA_TRIBUNAL_CIVEL", "cc_civel_vara_tribunal"],
  valor_causa: ["valor_causa", "VALOR_CAUSA", "VALOR DA CAUSA", "cc_valor_causa"],
  qtd_acoes: ["qtd_acoes", "QTD_ACOES", "QUANTIDADE_ACOES", "cc_qtd_acoes"],
  // Cada contexto de "N horas mensais" tem chave própria (não um "qtd_horas"
  // genérico compartilhado): full service Trabalhista e Consultivo Societário
  // podem coexistir no mesmo contrato, e um mapa de placeholders só tem um slot
  // por chave — usar a mesma chave nos dois faria um valor sobrescrever o outro.
  qtd_horas_trabalhista: [
    "qtd_horas_trabalhista",
    "QTD_HORAS_TRABALHISTA",
    "qtd_horas",
    "QTD_HORAS",
    "cc_qtd_horas_trabalhista",
  ],
  qtd_horas_societario: [
    "qtd_horas_societario",
    "QTD_HORAS_SOCIETARIO",
    "cc_qtd_horas_societario",
  ],
  valor_excedente_trabalhista_contencioso: [
    "valor_excedente_trabalhista_contencioso",
    "VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO",
    "cc_valor_excedente_trabalhista_contencioso",
  ],
  valor_excedente_trabalhista_consultivo: [
    "valor_excedente_trabalhista_consultivo",
    "VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO",
    "cc_valor_excedente_trabalhista_consultivo",
  ],
  valor_excedente_societario: [
    "valor_excedente_societario",
    "VALOR_EXCEDENTE_SOCIETARIO",
    "cc_valor_excedente_societario",
  ],
};

function aliasList(key: string): string[] {
  return FIELD_ALIASES[key] ?? [key, key.toUpperCase()];
}

function lookupInRecord(
  record: Record<string, string> | undefined,
  aliases: string[],
): string {
  if (!record) return "";
  const entries = Object.entries(record);
  for (const alias of aliases) {
    const direct = record[alias];
    if (typeof direct === "string" && direct.trim()) return direct.trim();
    const found = entries.find(
      ([k, v]) => k.trim().toLowerCase() === alias.trim().toLowerCase() && v.trim(),
    );
    if (found) return found[1].trim();
  }
  return "";
}

export function resolveFieldFromSources(params: {
  field: ContractRequiredField;
  scope?: ContractScope;
  fieldByCode?: Record<string, string>;
  manualFields?: Record<string, string>;
}): { value: string; source: ContractObjectFieldSource } {
  const aliases = aliasList(params.field.key);

  const manual = lookupInRecord(params.manualFields, aliases);
  if (manual) return { value: manual, source: "manual" };

  const fromScope = lookupInRecord(params.scope?.placeholders, aliases);
  if (fromScope) return { value: fromScope, source: "proposal" };

  const fromFields = lookupInRecord(params.fieldByCode, aliases);
  if (fromFields) {
    const source: ContractObjectFieldSource = aliases.some((a) =>
      a.toLowerCase().startsWith("cp_"),
    )
      ? "proposal"
      : "opportunity";
    return { value: fromFields, source };
  }

  return { value: "", source: "unresolved" };
}

export function collectRequiredFieldsForScopes(
  scopes: ContractScope[],
): Array<ContractRequiredField & { scopeEntryId: string }> {
  const out: Array<ContractRequiredField & { scopeEntryId: string }> = [];
  const seen = new Set<string>();
  for (const scope of scopes) {
    if (!scope.profile) continue;
    for (const field of scope.profile.requiredContractFields) {
      const id = `${scope.entryId}:${field.key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ ...field, scopeEntryId: scope.entryId });
    }
  }
  return out;
}

export function resolveContractObjectFields(params: {
  scopes: ContractScope[];
  fieldByCode?: Record<string, string>;
  manualFields?: Record<string, string>;
}): ContractObjectFieldValue[] {
  return collectRequiredFieldsForScopes(params.scopes).map((field) => {
    const scope = params.scopes.find((s) => s.entryId === field.scopeEntryId);
    const resolved = resolveFieldFromSources({
      field,
      scope,
      fieldByCode: params.fieldByCode,
      manualFields: params.manualFields,
    });
    return {
      key: field.key,
      label: field.label,
      value: resolved.value,
      source: resolved.source,
      required: field.required,
      scopeEntryId: field.scopeEntryId,
    };
  });
}

export function fieldValuesToPlaceholderMap(
  fields: ContractObjectFieldValue[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of fields) {
    if (!field.value) continue;
    map[field.key] = field.value;
    map[field.key.toUpperCase()] = field.value;
    for (const alias of aliasList(field.key)) {
      map[alias] = field.value;
    }
  }
  const valor = map.valor_causa || map.VALOR_CAUSA || "";
  if (valor) {
    map.VALOR_CAUSA_CLAUSE = `, com valor da causa de ${valor}`;
  } else {
    map.VALOR_CAUSA_CLAUSE = "";
  }

  const qtdAcoes = map.qtd_acoes || map.QTD_ACOES || "";
  const valorExcedenteContencioso =
    map.valor_excedente_trabalhista_contencioso || map.VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO || "";
  map.QTD_ACOES_CLAUSE = qtdAcoes
    ? `, limitada a ${qtdAcoes} ações ativas simultâneas${
        valorExcedenteContencioso
          ? `. Processos excedentes ao limite serão cobrados ao valor de ${valorExcedenteContencioso} por processo`
          : ""
      }`
    : "";

  const qtdHorasTrabalhista = map.qtd_horas_trabalhista || map.QTD_HORAS_TRABALHISTA || "";
  const valorExcedenteConsultivoTrab =
    map.valor_excedente_trabalhista_consultivo || map.VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO || "";
  map.QTD_HORAS_TRABALHISTA_CLAUSE = qtdHorasTrabalhista
    ? `, limitada a ${qtdHorasTrabalhista} horas mensais${
        valorExcedenteConsultivoTrab
          ? `. Horas excedentes ao limite serão cobradas ao valor de ${valorExcedenteConsultivoTrab} por hora`
          : ""
      }`
    : "";

  return map;
}
