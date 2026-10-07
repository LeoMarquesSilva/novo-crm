import { describe, expect, it } from "vitest";

import { PASSWORD_RECOVERY_COOKIE, RESET_PASSWORD_PATH, passwordRecoveryCookieOptions } from "./password-recovery";

describe("password recovery", () => {
  it("guarda o cookie por 15 minutos e só no HTTPS em produção", () => {
    expect(PASSWORD_RECOVERY_COOKIE).toBe("crm_pwd_recovery");
    expect(RESET_PASSWORD_PATH).toBe("/redefinir-senha");
    expect(passwordRecoveryCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 900,
    });
    expect(passwordRecoveryCookieOptions(false).secure).toBe(false);
  });
});
