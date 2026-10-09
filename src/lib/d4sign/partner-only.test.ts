import { afterEach, describe, expect, it, vi } from "vitest";

import { isPartnerOnlyAllowedPath, isPartnerOnlyEmail } from "./partner-only";

afterEach(() => vi.unstubAllEnvs());

describe("modo sócio", () => {
  it("reconhece os sócios pelo e-mail ou alias", () => {
    vi.stubEnv("D4SIGN_FIRM_SIGNERS", "");
    expect(isPartnerOnlyEmail("gustavo@bismarchipires.com.br")).toBe(true);
    expect(isPartnerOnlyEmail("Ricardo@bpplaw.com.br")).toBe(true);
    expect(isPartnerOnlyEmail("caio.silva@bismarchipires.com.br")).toBe(false);
    expect(isPartnerOnlyEmail("controladoria@bismarchipires.com.br")).toBe(false);
    expect(isPartnerOnlyEmail(null)).toBe(false);
  });

  it("libera só Assinar Contratos e o perfil", () => {
    expect(isPartnerOnlyAllowedPath("/crm/assinar-contratos")).toBe(true);
    expect(isPartnerOnlyAllowedPath("/crm/perfil")).toBe(true);
    expect(isPartnerOnlyAllowedPath("/crm")).toBe(false);
    expect(isPartnerOnlyAllowedPath("/crm/contratos")).toBe(false);
    expect(isPartnerOnlyAllowedPath("/crm/assinar-contratos-x")).toBe(false);
    expect(isPartnerOnlyAllowedPath("/crm/admin/usuarios")).toBe(false);
  });
});
