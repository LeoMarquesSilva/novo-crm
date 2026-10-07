import type { ClassifiedPartnerDoc } from "@/lib/d4sign/partner-signatures";

/**
 * Assinatura ainda não confirmada pela D4Sign.
 * Gravada no navegador de quem clicou em Assinar, até a próxima leitura
 * dos signatários daquele contrato.
 */
export type PartnerSignAssumption = {
  uuid: string;
  /** E-mail canônico do sócio. */
  partnerEmail: string;
  /** Quando a janela da D4Sign foi aberta. */
  clickedAt: string;
  /** `signersFetchedAt` no momento do clique. */
  fetchedAtAtClick: string | null;
};

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
