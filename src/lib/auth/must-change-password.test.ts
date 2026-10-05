import { describe, expect, it } from "vitest";

import {
  mustChangePasswordRedirect,
  replacementPasswordSchema,
  userMustChangePassword,
} from "./must-change-password";

describe("userMustChangePassword", () => {
  it("só é verdadeiro quando a flag do app_metadata está ligada", () => {
    expect(userMustChangePassword(null)).toBe(false);
    expect(userMustChangePassword({ app_metadata: {} })).toBe(false);
    expect(userMustChangePassword({ app_metadata: { must_change_password: true } })).toBe(true);
  });
});

describe("mustChangePasswordRedirect", () => {
  it("manda o login e o CRM para a troca enquanto a flag estiver ligada", () => {
    expect(mustChangePasswordRedirect({ pathname: "/crm", signedIn: true, mustChange: true })).toBe("/trocar-senha");
    expect(mustChangePasswordRedirect({ pathname: "/login", signedIn: true, mustChange: true })).toBe("/trocar-senha");
    expect(mustChangePasswordRedirect({ pathname: "/trocar-senha", signedIn: true, mustChange: true })).toBeNull();
  });

  it("não deixa a página de troca aberta depois que a senha já foi definida", () => {
    expect(mustChangePasswordRedirect({ pathname: "/trocar-senha", signedIn: true, mustChange: false })).toBe("/crm");
    expect(mustChangePasswordRedirect({ pathname: "/crm", signedIn: true, mustChange: false })).toBeNull();
  });

  it("exige sessão para abrir a troca", () => {
    expect(mustChangePasswordRedirect({ pathname: "/trocar-senha", signedIn: false, mustChange: false })).toBe(
      "/login?next=%2Ftrocar-senha",
    );
  });
});

describe("replacementPasswordSchema", () => {
  it("exige o padrão de senha do CRM", () => {
    expect(replacementPasswordSchema.safeParse("curta1").success).toBe(false);
    expect(replacementPasswordSchema.safeParse("CrmSeguro2026!").success).toBe(true);
  });
});
