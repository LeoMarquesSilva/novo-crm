import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirmSigners, isFirmSignerEmail } from "./firm-signers";
import { resolvePartnerEmail, toPartnerSigners } from "./partner-signatures";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sócios padrão", () => {
  it("reconhece a conta de assinatura digital como Gustavo", () => {
    vi.stubEnv("D4SIGN_FIRM_SIGNERS", "");
    const partners = toPartnerSigners(getFirmSigners());
    expect(resolvePartnerEmail("AssinaturaDigital@bismarchipires.com.br", partners)).toBe("gustavo@bpplaw.com.br");
    expect(isFirmSignerEmail("assinaturadigital@bismarchipires.com.br")).toBe(true);
  });

  it("não confunde a conta de assinatura do domínio novo", () => {
    vi.stubEnv("D4SIGN_FIRM_SIGNERS", "");
    expect(isFirmSignerEmail("assinaturadigital@bpplaw.com.br")).toBe(false);
  });
});
