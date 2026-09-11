import { applyPartyPlaceholders, type PartyGrammar } from "./party-language";
import type { CanonicalContractData } from "./types";

const BRACKET_RE = /\[([A-Z0-9_]+)\]/g;
const MUSTACHE_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

export const FORBIDDEN_DRAFT_TOKEN_RE =
  /\[[A-Z0-9_]+\]|\{\{[^}]+\}\}|\[\.\.\.\]|\bXX\/XX\b|R\$\s*X\b/i;

export type PlaceholderResolution = {
  text: string;
  unresolvedRequired: string[];
  unresolvedOptional: string[];
  unresolvedTokens: string[];
};

export function resolveContractClausePlaceholders(params: {
  content: string;
  values: Record<string, string>;
  requiredPlaceholders?: string[];
  optionalPlaceholders?: string[];
  grammar?: PartyGrammar;
}): PlaceholderResolution {
  let text = params.grammar ? applyPartyPlaceholders(params.content, params.grammar) : params.content;

  const normalizeKey = (raw: string) => raw.trim().replace(/^\{\{|\}\}$/g, "").replace(/^\[|\]$/g, "");

  const lookup = (token: string): string | undefined => {
    const key = normalizeKey(token);
    const candidates = [key, key.toUpperCase(), key.toLowerCase()];
    for (const c of candidates) {
      const value = params.values[c];
      if (typeof value !== "string") continue;
      if (value.trim() || key.toUpperCase().endsWith("_CLAUSE")) return value;
    }
    return undefined;
  };

  text = text.replace(MUSTACHE_RE, (_all, key: string) => {
    const value = lookup(key);
    return value !== undefined ? value : `{{${key}}}`;
  });
  text = text.replace(BRACKET_RE, (all, key: string) => {
    const value = lookup(key);
    return value !== undefined ? value : all;
  });

  const unresolvedTokens = listPlaceholderTokens(text);
  const required = (params.requiredPlaceholders ?? []).map((k) => k.replace(/^\[|\]$/g, "").toUpperCase());
  const optional = (params.optionalPlaceholders ?? []).map((k) => k.replace(/^\[|\]$/g, "").toUpperCase());
  const unresolvedSet = new Set(unresolvedTokens.map((t) => t.replace(/^\[|\]$/g, "").toUpperCase()));

  return {
    text,
    unresolvedRequired: required.filter((k) => unresolvedSet.has(k) || !lookup(k)),
    unresolvedOptional: optional.filter((k) => unresolvedSet.has(k)),
    unresolvedTokens,
  };
}

export function listPlaceholderTokens(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(BRACKET_RE)) {
    found.add(`[${match[1]}]`);
  }
  for (const match of text.matchAll(MUSTACHE_RE)) {
    found.add(`{{${match[1]}}}`);
  }
  return [...found];
}

export function hasForbiddenDraftTokens(text: string): boolean {
  return FORBIDDEN_DRAFT_TOKEN_RE.test(text);
}

export function listUnresolvedPlaceholders(data: CanonicalContractData): string[] {
  const found = new Set<string>();
  const scan = (text: string) => {
    for (const token of listPlaceholderTokens(text)) found.add(token);
  };
  for (const clause of data.clauses) {
    scan(clause.content);
    scan(clause.title);
  }
  for (const section of data.sections) {
    scan(section.title);
    for (const clause of section.clauses) scan(clause.content);
  }
  if (data.contractObject) {
    for (const block of data.contractObject.blocks) {
      scan(block.content);
      if (block.intro) scan(block.intro);
      for (const item of block.items ?? []) scan(item);
    }
    for (const line of data.contractObject.numberedLines) {
      scan(line.content);
    }
  }
  return [...found];
}

export function listForbiddenDraftTokens(data: CanonicalContractData): string[] {
  const texts: string[] = [];
  for (const clause of data.clauses) texts.push(clause.content, clause.title);
  if (data.contractObject) {
    for (const line of data.contractObject.numberedLines) texts.push(line.content);
    for (const block of data.contractObject.blocks) {
      texts.push(block.content);
      if (block.intro) texts.push(block.intro);
      texts.push(...(block.items ?? []));
    }
  }
  const found = new Set<string>();
  for (const text of texts) {
    const matches = text.match(new RegExp(FORBIDDEN_DRAFT_TOKEN_RE, "gi"));
    if (matches) for (const m of matches) found.add(m);
  }
  return [...found];
}
