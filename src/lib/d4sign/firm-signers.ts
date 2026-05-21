/**
 * Signatários padrão da CONTRATADA (Bismarchi | Pires) — sócios administradores
 * que assinam todo contrato em nome da firma.
 *
 * Pode ser sobrescrito via env `D4SIGN_FIRM_SIGNERS` (JSON):
 *   D4SIGN_FIRM_SIGNERS=[{"email":"x@y.com","name":"Fulano","oab":"OAB/SP 000.000"}]
 *
 * Origem dos defaults: `solicitantes-gestores-avatars.md` + cláusula da CONTRATADA
 * em `generate-contrato-docx.ts` (CNPJ 26.080.152/0001-35).
 */

export type FirmSigner = {
  email: string;
  name: string;
  /** Identificador OAB para exibição (informativo apenas — D4Sign não usa). */
  oab: string;
  /** Sempre estrangeiro=0 (CPF brasileiro) — D4Sign foreign param. */
  foreign: "0" | "1";
  /**
   * E-mails alternativos do mesmo signatário (ex.: domínio antigo).
   * Usados no filtro do dashboard para reconhecer contratos históricos.
   */
  aliases?: string[];
};

const DEFAULT_FIRM_SIGNERS: FirmSigner[] = [
  {
    email: "gustavo@bpplaw.com.br",
    name: "Gustavo Bismarchi Motta",
    oab: "OAB/SP 275.477",
    foreign: "0",
    aliases: ["gustavo@bismarchipires.com.br"],
  },
  {
    email: "ricardo@bpplaw.com.br",
    name: "Ricardo Viscardi Pires",
    oab: "OAB/SP 353.389",
    foreign: "0",
    aliases: ["ricardo@bismarchipires.com.br"],
  },
];

export function getFirmSigners(): FirmSigner[] {
  const raw = process.env.D4SIGN_FIRM_SIGNERS?.trim();
  if (!raw) return DEFAULT_FIRM_SIGNERS;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_FIRM_SIGNERS;
    const out: FirmSigner[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const email = typeof r.email === "string" ? r.email.trim() : "";
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!email || !name) continue;
      out.push({
        email,
        name,
        oab: typeof r.oab === "string" ? r.oab.trim() : "",
        foreign: r.foreign === "1" ? "1" : "0",
      });
    }
    return out.length > 0 ? out : DEFAULT_FIRM_SIGNERS;
  } catch {
    return DEFAULT_FIRM_SIGNERS;
  }
}

/** E-mail de sócio administrador (Gustavo/Ricardo), incluindo aliases de domínio antigo. */
export function isFirmSignerEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  const key = email.trim().toLowerCase();
  for (const f of getFirmSigners()) {
    if (f.email.toLowerCase() === key) return true;
    if (f.aliases?.some((alias) => alias.toLowerCase() === key)) return true;
  }
  return false;
}
