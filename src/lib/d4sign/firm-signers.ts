/**
 * Signatários padrão da CONTRATADA (Bismarchi | Pires) — sócios administradores
 * que assinam todo contrato em nome da firma.
 *
 * Pode ser sobrescrito via env `D4SIGN_FIRM_SIGNERS` (JSON):
 *   D4SIGN_FIRM_SIGNERS=[{"email":"x@y.com","name":"Fulano","oab":"OAB/SP 000.000","aliases":["x@antigo.com"]}]
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

/**
 * Conta da controladoria usada para testar a assinatura no lugar do Gustavo.
 * Não entra no modo sócio: o restante do CRM continua disponível.
 */
const GUSTAVO_SIGN_TEST_ALIASES = ["controladoria@bismarchipires.com.br"];

function withSignTestAliases(signers: FirmSigner[]): FirmSigner[] {
  return signers.map((signer) => {
    if (signer.email.toLowerCase() !== "gustavo@bpplaw.com.br") return signer;
    const aliases = [...(signer.aliases ?? [])];
    for (const extra of GUSTAVO_SIGN_TEST_ALIASES) {
      if (!aliases.some((alias) => alias.toLowerCase() === extra)) aliases.push(extra);
    }
    return { ...signer, aliases };
  });
}

const DEFAULT_FIRM_SIGNERS: FirmSigner[] = [
  {
    email: "gustavo@bpplaw.com.br",
    name: "Gustavo Bismarchi Motta",
    oab: "OAB/SP 275.477",
    foreign: "0",
    // `assinaturadigital@` (nos dois domínios) é a conta de assinatura digital
    // do Gustavo: ele assina com o certificado dele, no login de outro usuário.
    aliases: [
      "gustavo@bismarchipires.com.br",
      "assinaturadigital@bismarchipires.com.br",
      "assinaturadigital@bpplaw.com.br",
      ...GUSTAVO_SIGN_TEST_ALIASES,
    ],
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
  if (!raw) return withSignTestAliases(DEFAULT_FIRM_SIGNERS);
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
      const aliases = Array.isArray(r.aliases)
        ? r.aliases.filter((a): a is string => typeof a === "string" && a.trim() !== "").map((a) => a.trim())
        : [];
      out.push({
        email,
        name,
        oab: typeof r.oab === "string" ? r.oab.trim() : "",
        foreign: r.foreign === "1" ? "1" : "0",
        ...(aliases.length > 0 ? { aliases } : {}),
      });
    }
    return withSignTestAliases(out.length > 0 ? out : DEFAULT_FIRM_SIGNERS);
  } catch {
    return withSignTestAliases(DEFAULT_FIRM_SIGNERS);
  }
}

/** Sócio dono do e-mail (canônico ou alias); null se não for sócio. */
export function firmSignerForEmail(email: string | null | undefined): FirmSigner | null {
  if (!email?.trim()) return null;
  const key = email.trim().toLowerCase();
  for (const f of getFirmSigners()) {
    if (f.email.toLowerCase() === key) return f;
    if (f.aliases?.some((alias) => alias.toLowerCase() === key)) return f;
  }
  return null;
}

/** E-mail de sócio administrador (Gustavo/Ricardo), incluindo aliases. */
export function isFirmSignerEmail(email: string | null | undefined): boolean {
  return firmSignerForEmail(email) !== null;
}

/**
 * Signatário de e-mail de sócio aparece como o sócio, papel CONTRATADA.
 * A D4Sign devolve em `user_name` o dono do login (ex.: a conta
 * `assinaturadigital@` está no nome de outro usuário), não quem assinou.
 */
export function normalizeFirmSigner<T extends { email?: string | null; name?: string | null; role?: string | null }>(
  signer: T,
): T {
  const firm = firmSignerForEmail(signer.email);
  return firm ? { ...signer, name: firm.name, role: "CONTRATADA" } : signer;
}
