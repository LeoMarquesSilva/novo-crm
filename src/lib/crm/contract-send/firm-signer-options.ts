import { firmSignerForEmail, getFirmSigners } from "@/lib/d4sign/firm-signers";
import { isPartnerOnlyEmail } from "@/lib/d4sign/partner-only";

/** Sócio no diálogo de envio: e-mail padrão e e-mails aceitos (conta de assinatura digital etc.). */
export type FirmSignerOption = {
  /** E-mail canônico (identifica o sócio). */
  key: string;
  name: string;
  oab: string;
  foreign: "0" | "1";
  defaultEmail: string;
  emailOptions: string[];
};

export function listFirmSignerOptions(): FirmSignerOption[] {
  return getFirmSigners().map((signer) => {
    const emails = [signer.email, ...(signer.aliases ?? [])]
      .map((e) => e.trim().toLowerCase())
      // Fora a conta de teste (controladoria assina "como o Gustavo" só no teste).
      .filter((e, i, all) => all.indexOf(e) === i && isPartnerOnlyEmail(e));
    const canonical = signer.email.trim().toLowerCase();
    return {
      key: canonical,
      name: signer.name,
      oab: signer.oab,
      foreign: signer.foreign,
      defaultEmail: canonical,
      emailOptions: emails.includes(canonical) ? emails : [canonical, ...emails],
    };
  });
}

export type ChosenFirmSigner = {
  /** E-mail canônico do sócio. */
  key: string;
  email: string;
  name: string;
  foreign: "0" | "1";
};

/** Valida os e-mails escolhidos para os sócios (cada um precisa ser de um sócio, sem repetir sócio). */
export function resolveChosenFirmSigners(
  chosen: { email: string }[],
): { ok: true; signers: ChosenFirmSigner[] } | { ok: false; message: string } {
  const out: ChosenFirmSigner[] = [];
  for (const row of chosen) {
    const email = row.email.trim().toLowerCase();
    const signer = firmSignerForEmail(email);
    if (!signer) return { ok: false, message: `${row.email} não é e-mail de um sócio signatário.` };
    const key = signer.email.trim().toLowerCase();
    if (out.some((s) => s.key === key)) {
      return { ok: false, message: `${signer.name} aparece mais de uma vez entre os sócios.` };
    }
    out.push({ key, email, name: signer.name, foreign: signer.foreign });
  }
  return { ok: true, signers: out };
}
