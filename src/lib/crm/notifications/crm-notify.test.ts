import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseFake } from "@/test/supabase-fake";
import { notifyInApp, resolveNotificationRecipients } from "./crm-notify";

vi.mock("@/modules/crm/application/services/send-lead-notification-email", () => ({
  sendCrmNotificationEmail: vi.fn(),
}));

function fakeWithUsers(users: { id: string; email: string }[], tables = {}) {
  const fake = createSupabaseFake({ tables });
  (fake.client as unknown as { auth: unknown }).auth = {
    admin: { listUsers: vi.fn(async () => ({ data: { users } })) },
  };
  return fake;
}

beforeEach(() => vi.unstubAllEnvs());

describe("resolveNotificationRecipients", () => {
  it("junta papéis, e-mails e sócios sem duplicar, e manda sócio para Assinar Contratos", async () => {
    const fake = fakeWithUsers(
      [
        { id: "auth-com", email: "comercial@bp.com.br" },
        { id: "auth-gus", email: "gustavo@bpplaw.com.br" },
        { id: "auth-x", email: "outro@bp.com.br" },
      ],
      {
        app_users: {
          awaited: (() => {
            let n = 0;
            return () =>
              n++ === 0
                ? { data: [{ id: "app-com" }], error: null }
                : { data: [{ auth_user_id: "auth-com" }], error: null };
          })(),
        },
      },
    );
    const recipients = await resolveNotificationRecipients(fake.client as never, {
      roles: ["comercial"],
      emails: ["COMERCIAL@bp.com.br"],
      firmPartners: true,
    });
    const byId = new Map(recipients.map((r) => [r.authUserId, r]));
    expect([...byId.keys()].sort()).toEqual(["auth-com", "auth-gus"]);
    expect(byId.get("auth-gus")?.partnerOnly).toBe(true);
    expect(byId.get("auth-com")?.partnerOnly).toBe(false);
  });

  it("responsável do lead = criador e captador, sem quem só cadastrou nem a equipe", async () => {
    const fake = fakeWithUsers(
      [
        { id: "auth-criador", email: "criador@bp.com.br" },
        { id: "auth-captador", email: "captador@bp.com.br" },
        { id: "auth-cadastrou", email: "cadastrou@bp.com.br" },
      ],
      {
        oportunidades: {
          maybeSingle: { data: { criado_por: "app-criador", solicitante_email: "Captador@bp.com.br" }, error: null },
        },
        lead_intakes: { maybeSingle: { data: { cadastrado_por_email: "cadastrou@bp.com.br" }, error: null } },
        rd_deal_reconciliacao: { maybeSingle: { data: null, error: null } },
        app_users: { awaited: { data: [{ auth_user_id: "auth-criador" }], error: null } },
      },
    );
    const recipients = await resolveNotificationRecipients(fake.client as never, { leadOwnerOf: "lead-1" });
    expect(recipients.map((r) => r.authUserId).sort()).toEqual(["auth-captador", "auth-criador"]);
  });
});

describe("notifyInApp", () => {
  it("grava com chave de idempotência e caminho do sócio", async () => {
    const fake = createSupabaseFake({});
    await notifyInApp(
      fake.client as never,
      [
        { authUserId: "a", email: null, partnerOnly: false },
        { authUserId: "b", email: null, partnerOnly: true },
      ],
      { tipo: "venda_fechada", title: "t", preview: "p", path: "/crm/leads/1", idempotencyKey: "venda-fechada:1" },
    );
    const upsert = fake.calls.find((c) => c.method === "upsert");
    expect(upsert?.args[1]).toEqual({ onConflict: "user_id,idempotency_key", ignoreDuplicates: true });
    const rows = upsert?.args[0] as { user_id: string; payload: { path: string } }[];
    expect(rows.find((r) => r.user_id === "a")?.payload.path).toBe("/crm/leads/1");
    expect(rows.find((r) => r.user_id === "b")?.payload.path).toBe("/crm/assinar-contratos");
  });
});
