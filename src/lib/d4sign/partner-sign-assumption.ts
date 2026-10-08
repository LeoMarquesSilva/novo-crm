import type { ClassifiedPartnerDoc } from "@/lib/d4sign/partner-signatures";

/**
 * Assinatura ainda não confirmada pela D4Sign.
 * Vale no navegador de quem clicou e, quando o clique foi gravado no
 * servidor, no painel de quem mais está vendo Assinar Contratos.
 */
export type PartnerSignAssumption = {
  uuid: string;
  /** E-mail canônico do sócio. */
  partnerEmail: string;
  /** Quando a janela da D4Sign foi aberta. */
  clickedAt: string;
  /**
   * `signersFetchedAt` no momento do clique.
   * `null` numa cópia vinda do servidor: qualquer leitura estritamente
   * posterior ao clique confirma ou devolve.
   */
  fetchedAtAtClick: string | null;
};

export function isPartnerSignAssumption(value: unknown): value is PartnerSignAssumption {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.uuid === "string" &&
    typeof row.partnerEmail === "string" &&
    typeof row.clickedAt === "string" &&
    (row.fetchedAtAtClick === null || typeof row.fetchedAtAtClick === "string")
  );
}

export function partnerSignAssumptionKey(assumption: Pick<PartnerSignAssumption, "uuid" | "partnerEmail">): string {
  return `${assumption.uuid}:${assumption.partnerEmail}`;
}

/** A leitura dos signatários é posterior ao clique — é a atualização que confirma ou devolve. */
export function partnerSignRefreshLanded(
  doc: ClassifiedPartnerDoc,
  assumption: PartnerSignAssumption,
): boolean {
  const fetched = doc.signersFetchedAt;
  if (!fetched || fetched === assumption.fetchedAtAtClick) return false;
  const fetchedMs = new Date(fetched).getTime();
  const clickedMs = new Date(assumption.clickedAt).getTime();
  return Number.isFinite(fetchedMs) && Number.isFinite(clickedMs) && fetchedMs > clickedMs;
}

export function reconcilePartnerSignAssumptions(
  docs: ClassifiedPartnerDoc[],
  assumptions: PartnerSignAssumption[],
): {
  kept: PartnerSignAssumption[];
  confirmed: PartnerSignAssumption[];
  reverted: PartnerSignAssumption[];
} {
  const byUuid = new Map(docs.map((doc) => [doc.uuid, doc]));
  const kept: PartnerSignAssumption[] = [];
  const confirmed: PartnerSignAssumption[] = [];
  const reverted: PartnerSignAssumption[] = [];

  for (const assumption of assumptions) {
    const doc = byUuid.get(assumption.uuid);
    const slot = doc?.partners[assumption.partnerEmail];
    if (!doc || !slot || doc.lifecycle !== "em_andamento") {
      confirmed.push(assumption);
      continue;
    }
    if (slot.signed) {
      confirmed.push(assumption);
      continue;
    }
    if (partnerSignRefreshLanded(doc, assumption)) {
      reverted.push(assumption);
      continue;
    }
    kept.push(assumption);
  }

  return { kept, confirmed, reverted };
}

function laterClick(a: string, b: string): boolean {
  return new Date(a).getTime() >= new Date(b).getTime();
}

/**
 * Cliques gravados no servidor que ainda esperam a leitura dos signatários.
 * Sem e-mail do sócio (fila antiga) não entram na baixa provisória.
 */
export function openPartnerSignAssumptions(
  docs: ClassifiedPartnerDoc[],
  clicks: Array<{ uuid: string; partnerEmail: string | null; requestedAt: string }>,
): PartnerSignAssumption[] {
  const latest = new Map<string, PartnerSignAssumption>();
  for (const click of clicks) {
    if (!click.partnerEmail) continue;
    const assumption: PartnerSignAssumption = {
      uuid: click.uuid,
      partnerEmail: click.partnerEmail,
      clickedAt: click.requestedAt,
      fetchedAtAtClick: null,
    };
    const key = partnerSignAssumptionKey(assumption);
    const prev = latest.get(key);
    if (!prev || laterClick(assumption.clickedAt, prev.clickedAt)) latest.set(key, assumption);
  }
  return reconcilePartnerSignAssumptions(docs, [...latest.values()]).kept;
}

/** Une a lista local com a do servidor. No empate de horário, fica a de `local`. */
export function mergePartnerSignAssumptions(
  local: PartnerSignAssumption[],
  shared: PartnerSignAssumption[],
): PartnerSignAssumption[] {
  const byKey = new Map<string, PartnerSignAssumption>();
  for (const assumption of [...shared, ...local]) {
    const key = partnerSignAssumptionKey(assumption);
    const prev = byKey.get(key);
    if (!prev || laterClick(assumption.clickedAt, prev.clickedAt)) byKey.set(key, assumption);
  }
  return [...byKey.values()];
}

/**
 * Trata o sócio como assinado só na classificação (aba e contadores).
 * Os signatários originais permanecem, para o chip mostrar "confirmando".
 */
export function overlayPartnerSignAssumptions(
  doc: ClassifiedPartnerDoc,
  assumptions: PartnerSignAssumption[],
): { doc: ClassifiedPartnerDoc; provisionalEmails: string[] } {
  const mine = assumptions.filter((assumption) => assumption.uuid === doc.uuid);
  if (mine.length === 0 || doc.lifecycle !== "em_andamento") {
    return { doc, provisionalEmails: [] };
  }

  let partners = doc.partners;
  const provisionalEmails: string[] = [];
  for (const assumption of mine) {
    const slot = partners[assumption.partnerEmail];
    if (!slot || slot.signed) continue;
    provisionalEmails.push(assumption.partnerEmail);
    partners = {
      ...partners,
      [assumption.partnerEmail]: { ...slot, signed: true },
    };
  }

  if (provisionalEmails.length === 0) return { doc, provisionalEmails: [] };
  return { doc: { ...doc, partners }, provisionalEmails };
}
