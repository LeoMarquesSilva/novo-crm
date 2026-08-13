import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import type { ProposalCatalogAdminData } from "@/lib/crm/proposal-catalog-db";
import { extractPlaceholderKeysFromText } from "@/data/proposta-tipos-catalog";
import type { ExtractionItem } from "./schemas";

function collectKnownPlaceholderKeys(catalog: ProposalCatalogAdminData): string[] {
  const keys = new Set<string>();
  for (const subtype of catalog.adminRows.scopeSubtypes) {
    for (const key of subtype.placeholderKeys) keys.add(key);
    for (const key of extractPlaceholderKeysFromText(subtype.escopoTemplate)) keys.add(key);
  }
  for (const subtype of catalog.adminRows.investmentSubtypes) {
    for (const key of subtype.placeholderKeys) keys.add(key);
    for (const key of extractPlaceholderKeysFromText(subtype.template, subtype.conceito)) keys.add(key);
  }
  return [...keys].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function compactScopeCatalog(catalog: ProposalCatalogAdminData, areaKey?: string | null) {
  const types = catalog.adminRows.scopeTypes.filter(
    (t) => !areaKey || t.areaKey === areaKey,
  );
  const typeIds = new Set(types.map((t) => t.id));
  const subtypes = catalog.adminRows.scopeSubtypes.filter((s) => typeIds.has(s.scopeTypeId));

  return types.map((type) => ({
    type_id: type.id,
    area_key: type.areaKey,
    type_label: type.label,
    subtypes: subtypes
      .filter((s) => s.scopeTypeId === type.id)
      .map((s) => ({ subtype_id: s.id, label: s.label })),
  }));
}

function compactInvestmentCatalog(catalog: ProposalCatalogAdminData) {
  return catalog.adminRows.investmentTypes.map((type) => ({
    type_id: type.id,
    type_label: type.label,
    subtypes: catalog.adminRows.investmentSubtypes
      .filter((s) => s.investmentTypeId === type.id)
      .map((s) => ({ subtype_id: s.id, label: s.label })),
  }));
}

export function buildExtractionSystemPrompt(catalog: ProposalCatalogAdminData): string {
  const placeholders = collectKnownPlaceholderKeys(catalog);
  const scopeLabels = catalog.adminRows.scopeTypes.map((t) => `${t.areaKey} → ${t.label}`);
  const investmentLabels = catalog.adminRows.investmentTypes.map((t) => t.label);

  return [
    "Você extrai escopos de serviços advocatícios e modelos de investimento/honorários de propostas e contratos em português.",
    "",
    "Áreas de prática válidas (use exatamente estes nomes em suggested_area_key):",
    CRM_PRACTICE_AREAS.map((a) => `- ${a}`).join("\n"),
    "",
    "Convenção de placeholders: substitua nomes de clientes, CNPJ, valores monetários, números de processo, partes, datas e quantidades por [CHAVE_MAIUSCULA].",
    "Use chaves canônicas quando possível:",
    placeholders.slice(0, 80).join(", "),
    "",
    "Tipos de escopo já existentes no catálogo:",
    scopeLabels.length ? scopeLabels.join("\n") : "(nenhum)",
    "",
    "Tipos de investimento já existentes:",
    investmentLabels.length ? investmentLabels.join("\n") : "(nenhum)",
    "",
    "Para cada escopo encontrado, retorne raw_excerpt (trecho original), normalized_template (com placeholders), labels sugeridos e replaced_values mapeando texto original → placeholder.",
    "Para investimentos, preencha conceito quando houver descrição do modelo de cobrança.",
    "Não invente escopos que não aparecem no documento. Agrupe variações mínimas como itens separados se o texto for distinto.",
  ].join("\n");
}

export function buildExtractionUserPrompt(filename: string, text: string): string {
  return [
    `Documento: ${filename}`,
    "",
    "Texto extraído:",
    "---",
    text,
    "---",
    "",
    "Extraia todos os escopos de serviço e modelos de investimento/honorários encontrados.",
  ].join("\n");
}

export function buildConsolidationSystemPrompt(
  kind: "escopo" | "investimento",
  catalog: ProposalCatalogAdminData,
  areaKey?: string | null,
): string {
  const catalogBlock =
    kind === "escopo"
      ? JSON.stringify(compactScopeCatalog(catalog, areaKey), null, 2)
      : JSON.stringify(compactInvestmentCatalog(catalog), null, 2);

  return [
    `Você consolida extrações de ${kind === "escopo" ? "escopos de serviço" : "investimentos/honorários"} em modelos únicos para o catálogo.`,
    kind === "escopo" && areaKey ? `Área deste grupo: ${areaKey}` : "",
    "",
    "Regras:",
    "- Agrupe extrações semanticamente equivalentes em um único template padronizado.",
    "- Use placeholders [CHAVE] para dados variáveis do cliente.",
    "- tipo_label e subtipo_label devem ser claros e distintos.",
    "- source_extraction_indices referencia os índices (0-based) da lista de extrações enviada.",
    "- match_existing: se claramente corresponde a um subtipo do catálogo, informe subtype_id e label; senão null.",
    "- confidence: 0–1 indicando confiança na consolidação.",
    "",
    "Catálogo existente:",
    catalogBlock,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildConsolidationUserPrompt(
  extractions: Array<ExtractionItem & { index: number }>,
): string {
  const indexed = extractions.map((item) => ({
    index: item.index,
    raw_excerpt: item.raw_excerpt,
    normalized_template: item.normalized_template,
    suggested_type_label: item.suggested_type_label,
    suggested_subtype_label: item.suggested_subtype_label,
    conceito: item.conceito ?? null,
  }));

  return [
    "Extrações indexadas para consolidar:",
    JSON.stringify(indexed, null, 2),
    "",
    "Retorne suggestions consolidadas com source_extraction_indices apontando para os índices acima.",
  ].join("\n");
}

export function groupExtractionsByKindArea(
  rows: Array<{
    kind: string;
    suggested_area_key: string | null;
    raw_excerpt: string | null;
    normalized_template: string | null;
    suggested_type_label: string | null;
    suggested_subtype_label: string | null;
    conceito: string | null;
    id: string;
  }>,
): Map<string, Array<ExtractionItem & { extractionId: string; index: number }>> {
  const groups = new Map<string, Array<ExtractionItem & { extractionId: string; index: number }>>();

  for (const row of rows) {
    const kind = row.kind === "investimento" ? "investimento" : "escopo";
    const area = kind === "investimento" ? "__all__" : row.suggested_area_key ?? "Sem área";
    const key = `${kind}::${area}`;

    const list = groups.get(key) ?? [];
    const item: ExtractionItem = {
      raw_excerpt: row.raw_excerpt ?? "",
      normalized_template: row.normalized_template ?? "",
      suggested_area_key: row.suggested_area_key,
      suggested_type_label: row.suggested_type_label ?? "Tipo",
      suggested_subtype_label: row.suggested_subtype_label ?? "Subtipo",
      conceito: row.conceito,
      replaced_values: {},
    };
    list.push({ ...item, extractionId: row.id, index: list.length });
    groups.set(key, list);
  }

  return groups;
}
