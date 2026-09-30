/**
 * Regras da área "Assinar Contratos" (sócios) — puras, sem I/O, seguras para client.
 *
 * Classifica documentos de `d4sign_documents` do ponto de vista dos sócios
 * signatários da firma (Gustavo / Ricardo), sem separar por cofre.
 * Também concentra os helpers de signatário compartilhados com o dashboard D4Sign.
 */
import type { Database } from "@/lib/supabase/database.types";
import type { FirmSigner } from "@/lib/d4sign/firm-signers";

// ─── Signatários (compartilhado com o dashboard técnico) ─────────────────────

export type D4SignSignerInfo = {
  email?: string | null;
  role?: string | null;
  signed?: boolean | number | string | null;
  signed_at?: string | null;
  /** Nome gravado pelo CRM (ao enviar) ou pelo D4Sign após assinatura (`user_name`). */
  name?: string | null;
  user_name?: string | null;
  user_document?: string | null;
  key_signer?: string | null;
  act?: string | null;
  /** Status de entrega do e-mail: "Delivery" | "Bounce" | "Pending" … */
  email_sent_status?: string | null;
  /** sign_info da D4Sign (IP, geo) — gravado no enrich */
  sign_info?: { ip?: string; geolocation?: string; date_signed?: string } | null;
};

export function parseSigners(raw: unknown): D4SignSignerInfo[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw as D4SignSignerInfo[];
}

export function signerIsPending(s: D4SignSignerInfo): boolean {
  const { signed } = s;
  if (signed === null || signed === undefined) return true;
  if (typeof signed === "boolean") return !signed;
  return String(signed) === "0" || String(signed) === "false";
}

// ─── Sócios ──────────────────────────────────────────────────────────────────

export type PartnerSigner = {
  /** E-mail canônico (minúsculo). */
  email: string;
  name: string;
  firstName: string;
  /** Aliases de domínio antigo (minúsculos). */
  aliases: string[];
};

export function toPartnerSigners(firm: FirmSigner[]): PartnerSigner[] {
  return firm.map((f) => ({
    email: f.email.trim().toLowerCase(),
    name: f.name,
    firstName: f.name.split(" ")[0] ?? f.name,
    aliases: (f.aliases ?? []).map((a) => a.trim().toLowerCase()),
  }));
}

/** E-mail (canônico ou alias) → e-mail canônico do sócio; `null` se não for sócio. */
export function resolvePartnerEmail(
  email: string | null | undefined,
  partners: PartnerSigner[],
): string | null {
  const key = email?.trim().toLowerCase();
  if (!key) return null;
  for (const p of partners) {
    if (p.email === key || p.aliases.includes(key)) return p.email;
  }
  return null;
}

/** Admin ou sócio signatário (por e-mail, aceitando aliases). */
export function canAccessPartnerSignatures(input: {
  role: Database["public"]["Enums"]["user_role"] | null;
  email: string | null | undefined;
  partners: PartnerSigner[];
}): boolean {
  return input.role === "admin" || resolvePartnerEmail(input.email, input.partners) !== null;
}

// ─── Classificação de documentos ─────────────────────────────────────────────

export type PartnerDocRow = {
  uuid_doc: string;
  name_document: string | null;
  d4sign_status: string | null;
  created_at_d4sign: string | null;
  finalized_at: string | null;
  folder_area: string | null;
  folder_name: string | null;
  signers: unknown;
  client_name: string | null;
};

export type PartnerDocLifecycle = "em_andamento" | "finalizado" | "cancelado";

export type PartnerSignatureSlot = {
  /** E-mail exatamente como está no documento (pode ser alias). */
  signerEmail: string;
  signerName: string | null;
  keySigner: string | null;
  signed: boolean;
  signedAt: string | null;
};

export type ClassifiedPartnerDoc = {
  uuid: string;
  name: string | null;
  clientName: string | null;
  area: string | null;
  status: string | null;
  lifecycle: PartnerDocLifecycle;
  /** Envio real (só existe para documentos enviados pelo CRM — a API D4Sign não expõe data de criação). */
  createdAt: string | null;
  finalizedAt: string | null;
  /** Data no início do nome do arquivo ("2025 09 24 CONTRATO…"), quando houver. */
  contractDate: string | null;
  /** Assinatura mais recente de qualquer signatário. */
  lastSignedAt: string | null;
  /** Referência de "parado desde": última assinatura → envio → data do nome. */
  waitingSince: string | null;
  signers: D4SignSignerInfo[];
  /** e-mail canônico do sócio → situação dele neste documento */
  partners: Record<string, PartnerSignatureSlot>;
};

export const PARTNER_TABS = ["pendente", "aguardando_outros", "finalizado", "cancelado"] as const;
export type PartnerTab = (typeof PARTNER_TABS)[number];

/** Filtro de sócio: "all" ou e-mail canônico. */
export type PartnerFilter = "all" | string;

export function lifecycleFromStatus(status: string | null): PartnerDocLifecycle {
  const s = String(status ?? "");
  if (s === "1") return "finalizado";
  if (s === "4" || s === "6" || s === "7") return "cancelado";
  return "em_andamento";
}

/** Data `AAAA MM DD` (separador espaço, ponto, hífen ou _) no início do nome → ISO (meio-dia UTC). */
export function dateFromDocumentName(name: string | null): string | null {
  const m = name?.trim().match(/^(\d{4})[ ._-](\d{2})[ ._-](\d{2})(?!\d)/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d, 12));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

function latestIso(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v || !Number.isFinite(new Date(v).getTime())) continue;
    if (!best || new Date(v).getTime() > new Date(best).getTime()) best = v;
  }
  return best;
}

/** `null` quando nenhum sócio é signatário do documento. */
export function classifyPartnerDoc(
  row: PartnerDocRow,
  partners: PartnerSigner[],
): ClassifiedPartnerDoc | null {
  const signers = parseSigners(row.signers);
  const slots: Record<string, PartnerSignatureSlot> = {};

  for (const s of signers) {
    const canonical = resolvePartnerEmail(s.email, partners);
    if (!canonical || !s.email) continue;
    const signed = !signerIsPending(s);
    const current = slots[canonical];
    // Sócio listado duas vezes (ex.: e-mail novo e alias): pendência prevalece.
    if (current && !current.signed) continue;
    slots[canonical] = {
      signerEmail: s.email,
      signerName: s.name?.trim() || s.user_name?.trim() || null,
      keySigner: s.key_signer ?? null,
      signed,
      signedAt: s.signed_at ?? null,
    };
  }

  if (Object.keys(slots).length === 0) return null;

  const contractDate = dateFromDocumentName(row.name_document);
  const lastSignedAt = latestIso(signers.filter((s) => !signerIsPending(s)).map((s) => s.signed_at));

  return {
    uuid: row.uuid_doc,
    name: row.name_document,
    clientName: row.client_name ?? row.folder_name,
    area: row.folder_area,
    status: row.d4sign_status,
    lifecycle: lifecycleFromStatus(row.d4sign_status),
    createdAt: row.created_at_d4sign,
    finalizedAt: row.finalized_at,
    contractDate,
    lastSignedAt,
    waitingSince: lastSignedAt ?? row.created_at_d4sign ?? contractDate,
    signers,
    partners: slots,
  };
}

/** Em qual aba o documento cai para o filtro de sócio; `null` se o sócio não assina o documento. */
export function partnerDocTab(doc: ClassifiedPartnerDoc, filter: PartnerFilter): PartnerTab | null {
  const slots =
    filter === "all" ? Object.values(doc.partners) : doc.partners[filter] ? [doc.partners[filter]] : [];
  if (slots.length === 0) return null;
  if (doc.lifecycle === "finalizado") return "finalizado";
  if (doc.lifecycle === "cancelado") return "cancelado";
  return slots.some((s) => !s.signed) ? "pendente" : "aguardando_outros";
}

export function countPartnerTabs(
  docs: ClassifiedPartnerDoc[],
  filter: PartnerFilter,
): Record<PartnerTab, number> {
  const counts: Record<PartnerTab, number> = {
    pendente: 0,
    aguardando_outros: 0,
    finalizado: 0,
    cancelado: 0,
  };
  for (const doc of docs) {
    const tab = partnerDocTab(doc, filter);
    if (tab) counts[tab] += 1;
  }
  return counts;
}

/** Dias inteiros desde `iso` (0 quando ausente ou no futuro). */
export function daysSince(iso: string | null, now: Date = new Date()): number {
  if (!iso) return 0;
  const diff = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.floor(diff / 86_400_000);
}
