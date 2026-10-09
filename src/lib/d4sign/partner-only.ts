/**
 * Sócios (Gustavo/Ricardo, por e-mail ou alias) usam o CRM só para assinar:
 * enxergam apenas "Assinar Contratos" (e o próprio perfil). O proxy leva
 * qualquer outra página `/crm/...` para cá; o menu esconde o resto.
 */
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { resolvePartnerEmail, toPartnerSigners } from "@/lib/d4sign/partner-signatures";

export const PARTNER_HOME = "/crm/assinar-contratos";

const PARTNER_ALLOWED_PREFIXES = [PARTNER_HOME, "/crm/perfil"];

/** Assina como o Gustavo no teste, mas continua com o CRM inteiro. */
const PARTNER_ONLY_EXEMPT = new Set(["controladoria@bismarchipires.com.br"]);

export function isPartnerOnlyEmail(email: string | null | undefined): boolean {
  const key = email?.trim().toLowerCase();
  if (key && PARTNER_ONLY_EXEMPT.has(key)) return false;
  return resolvePartnerEmail(email, toPartnerSigners(getFirmSigners())) !== null;
}

export function isPartnerOnlyAllowedPath(pathname: string): boolean {
  return PARTNER_ALLOWED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
