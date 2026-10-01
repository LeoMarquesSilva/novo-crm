import { afterEach, describe, expect, it, vi } from "vitest";

import { getFirmSigners, isFirmSignerEmail, normalizeFirmSigner } from "./firm-signers";
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

  it("reconhece a conta de assinatura digital do domínio novo como Gustavo", () => {
    vi.stubEnv("D4SIGN_FIRM_SIGNERS", "");
    expect(isFirmSignerEmail("assinaturadigital@bpplaw.com.br")).toBe(true);
  });

  it("troca o dono do login pelo sócio e marca CONTRATADA", () => {
    vi.stubEnv("D4SIGN_FIRM_SIGNERS", "");
    expect(
      normalizeFirmSigner({ email: "assinaturadigital@bpplaw.com.br", name: "Felipe Soares De Camargo", role: "CONTRATANTE", signed: true }),
    ).toEqual({ email: "assinaturadigital@bpplaw.com.br", name: "Gustavo Bismarchi Motta", role: "CONTRATADA", signed: true });
    const client = { email: "cliente@x.com", name: "Cliente", role: "CONTRATANTE" };
    expect(normalizeFirmSigner(client)).toBe(client);
  });
});
