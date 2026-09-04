import { getObjectTemplate, type ContractObjectTemplate } from "./object-catalog";
import { resolveApplicableComposition } from "./object-composition";
import { fieldValuesToPlaceholderMap, resolveContractObjectFields } from "./object-fields";
import { applyPartyPlaceholders, type PartyGrammar } from "./party-language";
import { resolveContractClausePlaceholders } from "./placeholders";
import type {
  CanonicalContractObject,
  ContractObjectBlock,
  ContractObjectCoverage,
  ContractObjectOverride,
  ContractObjectStatus,
  ContractScope,
  NumberedObjectLine,
} from "./types";

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];

export function toRomanListMarker(index: number): string {
  return `(${ROMAN[index] ?? index + 1})`;
}

export function numberContractObjectBlocks(blocks: ContractObjectBlock[]): NumberedObjectLine[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const lines: NumberedObjectLine[] = [];
  let minor = 0;
  let sub = 0;
  let inSubscopeGroup = false;

  const push = (
    number: string,
    block: ContractObjectBlock,
    content: string,
    title?: string,
  ) => {
    lines.push({
      number,
      title,
      content,
      kind: block.kind,
      stableKey: block.stableKey,
      scopeEntryId: block.scopeEntryId,
      sourceLabel: block.sourceLabel,
      version: block.version,
    });
  };

  for (const block of sorted) {
    if (block.kind === "paragraph_unique") {
      push("Parágrafo único", block, block.content);
      continue;
    }

    if (block.kind === "ordered_list") {
      if (block.intro?.trim()) {
        minor += 1;
        sub = 0;
        inSubscopeGroup = false;
        push(`1.${minor}`, block, block.intro, block.title);
      }
      (block.items ?? []).forEach((item, index) => {
        const marker =
          block.listStyle === "decimal" ? `${index + 1}.` : toRomanListMarker(index);
        push(marker, block, item);
      });
      continue;
    }

    if (block.kind === "subscope") {
      if (!inSubscopeGroup) {
        if (minor === 0) minor = 1;
        inSubscopeGroup = true;
        sub = 0;
      }
      sub += 1;
      push(`1.${minor}.${sub}`, block, block.content, block.title);
      continue;
    }

    minor += 1;
    sub = 0;
    inSubscopeGroup = Boolean(block.opensSubscopeGroup);
    const title =
      block.title ??
      (block.kind === "limitation" ? "Limite" : minor === 1 ? "Objeto" : undefined);
    push(`1.${minor}`, block, block.content, title);
  }

  return lines;
}

export function validateContractObjectCoverage(params: {
  scopes: ContractScope[];
  representedScopeIds: string[];
}): ContractObjectCoverage {
  const represented = new Set(params.representedScopeIds);
  const scopeIds = params.scopes.map((s) => s.entryId);
  const scopeSet = new Set(scopeIds);
  const missingScopes = scopeIds.filter((id) => !represented.has(id));
  const unexpectedScopes = params.representedScopeIds.filter((id) => !scopeSet.has(id));
  return {
    ok: missingScopes.length === 0 && unexpectedScopes.length === 0,
    representedScopes: params.representedScopeIds,
    missingScopes,
    unexpectedScopes,
  };
}

function fillTemplate(
  template: ContractObjectTemplate,
  values: Record<string, string>,
  grammar: PartyGrammar,
): { content: string; unresolvedRequired: string[] } {
  const resolved = resolveContractClausePlaceholders({
    content: template.content,
    values,
    requiredPlaceholders: template.requiredPlaceholders,
    optionalPlaceholders: template.optionalPlaceholders,
    grammar,
  });
  return {
    content: resolved.text,
    unresolvedRequired: resolved.unresolvedRequired.filter((key) => key !== "VALOR_CAUSA_CLAUSE"),
  };
}

function blockFromTemplate(params: {
  template: ContractObjectTemplate;
  kind?: ContractObjectBlock["kind"];
  title?: string;
  order: number;
  scope?: ContractScope;
  values: Record<string, string>;
  grammar: PartyGrammar;
  opensSubscopeGroup?: boolean;
  override?: ContractObjectOverride;
}): { block: ContractObjectBlock; unresolvedRequired: string[] } {
  const filled = fillTemplate(params.template, params.values, params.grammar);
  const content = params.override?.overrideContent ?? filled.content;
  return {
    unresolvedRequired: params.override ? [] : filled.unresolvedRequired,
    block: {
      kind: params.kind ?? params.template.kind,
      stableKey: params.template.stableKey,
      title: params.title ?? params.template.title,
      content,
      intro: params.template.intro
        ? applyPartyPlaceholders(params.template.intro, params.grammar)
        : undefined,
      items: params.template.items,
      listStyle: params.template.listStyle,
      order: params.order,
      scopeEntryId: params.scope?.entryId,
      scopeSubtypeId: params.scope?.subtypeId,
      sourceLabel: params.scope
        ? `${params.scope.areaLabel} > ${params.scope.label}`
        : params.template.title,
      version: params.template.version,
      status: params.template.status,
      opensSubscopeGroup: params.opensSubscopeGroup,
    },
  };
}

function sortScopes(scopes: ContractScope[]): ContractScope[] {
  return [...scopes].sort((a, b) => {
    const ao = a.profile?.areaSortOrder ?? 999;
    const bo = b.profile?.areaSortOrder ?? 999;
    if (ao !== bo) return ao - bo;
    const at = a.profile?.typeSortOrder ?? 999;
    const bt = b.profile?.typeSortOrder ?? 999;
    if (at !== bt) return at - bt;
    return (a.profile?.subtypeSortOrder ?? 999) - (b.profile?.subtypeSortOrder ?? 999);
  });
}

export function renderContractObjectPlainText(object: CanonicalContractObject): string {
  return object.numberedLines
    .map((line) => {
      const title = line.title ? ` ${line.title}.` : "";
      return `${line.number}.${title} ${line.content}`.replace("..", ".");
    })
    .join("\n\n")
    .trim();
}

export function resolveContractObject(params: {
  scopes: ContractScope[];
  grammar: PartyGrammar;
  fieldByCode?: Record<string, string>;
  manualFields?: Record<string, string>;
  overrides?: ContractObjectOverride[];
  explicitCompositionKey?: string | null;
}): CanonicalContractObject {
  const scopes = sortScopes(params.scopes);
  const fieldValues = resolveContractObjectFields({
    scopes,
    fieldByCode: params.fieldByCode,
    manualFields: params.manualFields,
  });
  const values = fieldValuesToPlaceholderMap(fieldValues);
  const overrides = params.overrides ?? [];
  const overrideByKey = new Map(overrides.map((o) => [o.blockStableKey, o]));
  const composition = resolveApplicableComposition({
    scopes,
    explicitCompositionKey: params.explicitCompositionKey,
    fieldByCode: params.fieldByCode,
  });

  const blocks: ContractObjectBlock[] = [];
  const unresolvedRequired: string[] = [];
  let order = 0;
  const represented = new Set<string>();
  const composedSubtypeIds = new Set(composition?.requiredSubtypeKeys ?? []);
  /**
   * Só os campos de fato referenciados (required ou optional) por algum bloco
   * renderizado aparecem no formulário / bloqueiam o objeto — evita campos como
   * "Quantidade de ações" (só usado no Full Service) surgirem num contrato de
   * caso único que nunca referencia esse placeholder.
   */
  const usedFieldKeys = new Set<string>();
  const usedRequiredFieldKeys = new Set<string>();

  const pushTemplate = (
    key: string,
    extra: {
      scope?: ContractScope;
      kind?: ContractObjectBlock["kind"];
      title?: string;
      opensSubscopeGroup?: boolean;
    } = {},
  ) => {
    const template = getObjectTemplate(key);
    if (!template) return;
    for (const placeholder of template.requiredPlaceholders) {
      usedRequiredFieldKeys.add(placeholder.toLowerCase());
      usedFieldKeys.add(placeholder.toLowerCase());
    }
    for (const placeholder of template.optionalPlaceholders) {
      usedFieldKeys.add(placeholder.toLowerCase());
    }
    order += 10;
    const built = blockFromTemplate({
      template,
      kind: extra.kind,
      title: extra.title,
      order,
      scope: extra.scope,
      values,
      grammar: params.grammar,
      opensSubscopeGroup: extra.opensSubscopeGroup,
      override: overrideByKey.get(template.stableKey),
    });
    blocks.push(built.block);
    unresolvedRequired.push(...built.unresolvedRequired);
    if (extra.scope) represented.add(extra.scope.entryId);
  };

  if (composition) {
    pushTemplate(composition.generalObjectKey, { opensSubscopeGroup: true, title: "Objeto" });
    for (const scope of scopes) {
      if (!composedSubtypeIds.has(scope.subtypeId) || !scope.profile) continue;
      const subscopeKey =
        scope.profile.objectDefinition.objectBlockKeys.find((k) => k.endsWith(".subscope")) ??
        `${scope.profile.objectDefinition.objectBlockKeys[0]}.subscope`;
      const fallback = scope.profile.objectDefinition.objectBlockKeys[0];
      pushTemplate(getObjectTemplate(subscopeKey) ? subscopeKey : fallback, {
        scope,
        kind: "subscope",
        title:
          scope.subtypeId.includes("consultivo")
            ? "Consultivo Trabalhista"
            : scope.subtypeId.includes("contencioso")
              ? "Contencioso Trabalhista"
              : scope.label,
      });
    }
    if (composition.paragraphUniqueKey) {
      pushTemplate(composition.paragraphUniqueKey);
    }
  }

  for (const scope of scopes) {
    if (composition && composedSubtypeIds.has(scope.subtypeId)) continue;
    if (!scope.profile) continue;
    for (const key of scope.profile.objectDefinition.objectBlockKeys) {
      if (key.endsWith(".subscope")) continue;
      pushTemplate(key, { scope });
    }
  }

  const coverage = validateContractObjectCoverage({
    scopes,
    representedScopeIds: [...represented],
  });

  const missingRequiredFields = [
    ...new Set([
      ...unresolvedRequired.map((k) => k.toLowerCase()),
      ...fieldValues
        .filter((f) => f.required && !f.value.trim() && usedRequiredFieldKeys.has(f.key))
        .map((f) => f.key),
    ]),
  ];

  let status: ContractObjectStatus = "complete";
  if (scopes.some((s) => s.missingProfile) || coverage.missingScopes.length > 0) {
    status = "missing_profile";
  } else if (missingRequiredFields.length > 0) {
    status = "incomplete";
  } else if (overrides.length > 0) {
    status = "overridden";
  }

  // Só expõe no formulário os campos de fato referenciados pelos blocos
  // renderizados (ex.: "Quantidade de ações" some quando não é Full Service).
  const relevantFieldValues = fieldValues.filter((f) => usedFieldKeys.has(f.key));

  return {
    blocks,
    numberedLines: numberContractObjectBlocks(blocks),
    representedScopeIds: coverage.representedScopes,
    missingScopeIds: coverage.missingScopes,
    unexpectedScopeIds: coverage.unexpectedScopes,
    status,
    missingRequiredFields,
    fieldValues: relevantFieldValues,
    overrides,
    compositionKey: composition?.key ?? null,
  };
}

export function applyObjectOverride(params: {
  object: CanonicalContractObject;
  blockStableKey: string;
  overrideContent: string;
  reason: string;
  changedBy: string;
  changedByName?: string;
  changedAt?: string;
}): CanonicalContractObject {
  const block = params.object.blocks.find((b) => b.stableKey === params.blockStableKey);
  if (!block) return params.object;
  const override: ContractObjectOverride = {
    blockStableKey: params.blockStableKey,
    baseClauseVersion: block.version,
    originalContent: block.content,
    overrideContent: params.overrideContent,
    reason: params.reason,
    changedBy: params.changedBy,
    changedByName: params.changedByName,
    changedAt: params.changedAt ?? new Date().toISOString(),
  };
  const blocks = params.object.blocks.map((b) =>
    b.stableKey === params.blockStableKey ? { ...b, content: params.overrideContent } : b,
  );
  const overrides = [
    ...params.object.overrides.filter((o) => o.blockStableKey !== params.blockStableKey),
    override,
  ];
  return {
    ...params.object,
    blocks,
    numberedLines: numberContractObjectBlocks(blocks),
    overrides,
    status: params.object.status === "complete" ? "overridden" : params.object.status,
  };
}
