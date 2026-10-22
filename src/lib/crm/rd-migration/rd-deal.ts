/**
 * Leitura do negócio do RD guardado em `rd_deal_reconciliacao.detalhes.deal` (import/webhook).
 * Sem acesso a banco: a migração usa isto para escopo, responsável e pré-preenchimento.
 */

export type RdCustomFieldValue = string | string[];

export type RdDealSnapshot = {
  id: string | null;
  name: string | null;
  stageLabel: string | null;
  /** `true` vendido, `false` perdido, `null` em aberto. */
  win: boolean | null;
  ownerEmail: string | null;
  ownerName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  /** Rótulo normalizado (`normalizeRdLabel`) → rótulo original e valor. */
  fields: Map<string, { label: string; value: RdCustomFieldValue }>;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** Sem acento, minúsculas, só letras/números separados por um espaço ("E-mail do Solicitante" → "e mail do solicitante"). */
export function normalizeRdLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, " ")
    .trim();
}

function readFieldValue(raw: unknown): RdCustomFieldValue | null {
  if (Array.isArray(raw)) {
    const items = raw.map(asText).filter((x): x is string => Boolean(x));
    return items.length > 0 ? items : null;
  }
  return asText(raw);
}

export function readRdDeal(details: unknown): RdDealSnapshot | null {
  if (!isObject(details)) return null;
  const deal = isObject(details.deal) ? details.deal : null;
  if (!deal) return null;

  const stage = isObject(deal.deal_stage) ? deal.deal_stage : null;
  const owner = isObject(deal.user) ? deal.user : null;
  const lost = isObject(deal.deal_lost_reason) ? deal.deal_lost_reason : null;

  const fields = new Map<string, { label: string; value: RdCustomFieldValue }>();
  const rawFields = Array.isArray(deal.deal_custom_fields) ? deal.deal_custom_fields : [];
  for (const item of rawFields) {
    if (!isObject(item)) continue;
    const custom = isObject(item.custom_field) ? item.custom_field : null;
    const label = asText(custom?.label) ?? asText(item.label) ?? asText(custom?.name);
    if (!label) continue;
    const value = readFieldValue(item.value ?? item.content);
    if (value === null) continue;
    const key = normalizeRdLabel(label);
    if (!fields.has(key)) fields.set(key, { label, value });
  }

  const win = deal.win === true ? true : deal.win === false ? false : null;

  return {
    id: asText(deal.id) ?? asText(deal._id),
    name: asText(deal.name) ?? asText(deal.title),
    stageLabel: asText(stage?.name) ?? asText(stage?.label) ?? asText(deal.stage_name),
    win,
    ownerEmail: asText(owner?.email)?.toLowerCase() ?? null,
    ownerName: asText(owner?.name),
    createdAt: asText(deal.created_at),
    updatedAt: asText(deal.updated_at),
    closedAt: asText(deal.closed_at),
    lostReason: asText(lost?.name) ?? asText(lost?.reason),
    fields,
  };
}

/** Valor do primeiro rótulo encontrado (comparação normalizada). */
export function rdField(deal: RdDealSnapshot, aliases: readonly string[]): RdCustomFieldValue | null {
  for (const alias of aliases) {
    const hit = deal.fields.get(normalizeRdLabel(alias));
    if (hit) return hit.value;
  }
  return null;
}

/** Igual a `rdField`, devolvendo o rótulo original junto (para mostrar a origem). */
export function rdFieldWithLabel(
  deal: RdDealSnapshot,
  aliases: readonly string[],
): { label: string; value: RdCustomFieldValue } | null {
  for (const alias of aliases) {
    const hit = deal.fields.get(normalizeRdLabel(alias));
    if (hit) return hit;
  }
  return null;
}

/** Texto do campo (listas viram "a, b"). */
export function rdText(deal: RdDealSnapshot, aliases: readonly string[]): string {
  const value = rdField(deal, aliases);
  if (value === null) return "";
  return Array.isArray(value) ? value.join(", ") : value;
}

/** Lista do campo (texto vira itens separados por vírgula, ponto e vírgula ou quebra de linha). */
export function rdList(deal: RdDealSnapshot, aliases: readonly string[]): string[] {
  const value = rdField(deal, aliases);
  if (value === null) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Campos do deal em ordem de rótulo, para a tela mostrar "o que o RD tem". */
export function listRdFields(deal: RdDealSnapshot): Array<{ label: string; value: string }> {
  return [...deal.fields.values()]
    .map((f) => ({ label: f.label, value: Array.isArray(f.value) ? f.value.join(", ") : f.value }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
