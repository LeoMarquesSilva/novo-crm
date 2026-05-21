import type { Oportunidade } from "@/modules/crm/domain/entities";
import { isFirmSignerEmail } from "@/lib/d4sign/firm-signers";

export type KanbanD4SignSigner = NonNullable<Oportunidade["d4signSigners"]>[number];

function isTruthySigned(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

/** Normaliza JSONB de signatários (webhook/sync podem usar 0/1 em `signed`). */
export function normalizeD4SignSignersForKanban(raw: unknown): KanbanD4SignSigner[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: KanbanD4SignSigner[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const email = typeof row.email === "string" ? row.email.trim() : "";
    if (!email) continue;
    const keySigner =
      typeof row.key_signer === "string"
        ? row.key_signer
        : typeof row.keySigner === "string"
          ? row.keySigner
          : null;
    const roleRaw = row.role;
    const role =
      roleRaw === "CONTRATADA" || roleRaw === "CONTRATANTE" ? roleRaw : null;
    out.push({
      email,
      key_signer: keySigner,
      signed: isTruthySigned(row.signed),
      signed_at: typeof row.signed_at === "string" ? row.signed_at : null,
      role,
      name: typeof row.name === "string" ? row.name.trim() || null : null,
    });
  }
  return out.length > 0 ? out : null;
}

export function signerDisplayLabel(signer: KanbanD4SignSigner): string {
  return signer.name?.trim() || signer.email;
}

export function signerRoleLabel(role: KanbanD4SignSigner["role"]): string | null {
  if (role === "CONTRATADA") return "Contratada";
  if (role === "CONTRATANTE") return "Contratante";
  return null;
}

/** Sócios administradores (Gustavo/Ricardo) — não são cliente, mesmo se D4Sign vier como CONTRATANTE. */
export function isManagingPartnerEmail(email: string | null | undefined): boolean {
  return isFirmSignerEmail(email);
}

/** Lado firma no kanban: CONTRATADA ou sócios administradores. */
export function signerKanbanIsFirmSide(signer: KanbanD4SignSigner): boolean {
  return signer.role === "CONTRATADA" || isManagingPartnerEmail(signer.email);
}

export function signerKanbanBadgeLabel(
  signer: KanbanD4SignSigner,
): "Sócio" | "Adv." | "Cliente" | null {
  if (isManagingPartnerEmail(signer.email)) return "Sócio";
  if (signer.role === "CONTRATADA") return "Adv.";
  if (signer.role === "CONTRATANTE") return "Cliente";
  return null;
}

export function countSignedSigners(signers: KanbanD4SignSigner[]): number {
  return signers.filter((s) => s.signed).length;
}

export function latestSignerSignedAt(signers: KanbanD4SignSigner[]): string | null {
  const dates = signers
    .map((s) => s.signed_at)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return dates[0] ?? null;
}
