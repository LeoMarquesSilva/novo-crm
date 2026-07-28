import { describe, expect, it } from "vitest";

import {
  adminInitialPasswordSchema,
  evaluateAdminUserMutation,
} from "./admin-user-policy";

describe("adminInitialPasswordSchema", () => {
  it("rejeita a antiga senha padrão mesmo quando o payload a fornece explicitamente", () => {
    expect(adminInitialPasswordSchema.safeParse("123456").success).toBe(false);
  });

  it("aceita uma senha inicial longa com maiúscula, minúscula e número", () => {
    expect(adminInitialPasswordSchema.safeParse("CrmSeguro2026!").success).toBe(true);
  });
});

describe("evaluateAdminUserMutation", () => {
  it("impede que o administrador exclua a própria conta", () => {
    expect(
      evaluateAdminUserMutation({
        action: "delete",
        actorAppUserId: "actor-1",
        targetAppUserId: "actor-1",
        targetRole: "admin",
        nextRole: null,
        adminCount: 3,
      }),
    ).toEqual({
      allowed: false,
      reason: "Não é possível excluir a própria conta administrativa.",
    });
  });

  it("impede excluir o último administrador", () => {
    expect(
      evaluateAdminUserMutation({
        action: "delete",
        actorAppUserId: "actor-1",
        targetAppUserId: "actor-2",
        targetRole: "admin",
        nextRole: null,
        adminCount: 1,
      }),
    ).toEqual({
      allowed: false,
      reason: "Não é possível excluir o último administrador.",
    });
  });

  it("impede rebaixar o último administrador", () => {
    expect(
      evaluateAdminUserMutation({
        action: "change-role",
        actorAppUserId: "actor-1",
        targetAppUserId: "actor-2",
        targetRole: "admin",
        nextRole: "comercial",
        adminCount: 1,
      }),
    ).toEqual({
      allowed: false,
      reason: "Não é possível remover o papel do último administrador.",
    });
  });

  it("permite remover um administrador quando outro permanece", () => {
    expect(
      evaluateAdminUserMutation({
        action: "delete",
        actorAppUserId: "actor-1",
        targetAppUserId: "actor-2",
        targetRole: "admin",
        nextRole: null,
        adminCount: 2,
      }),
    ).toEqual({ allowed: true });
  });
});
