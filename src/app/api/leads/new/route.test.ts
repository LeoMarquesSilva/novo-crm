import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { createSupabaseFake } from "@/test/supabase-fake";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/modules/crm/application/services/send-lead-notification-email", () => ({
  sendLeadNotificationEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/leads/new — permissão", () => {
  it.each(["controladoria", "financeiro"] as const)("%s não cria lead", async (role) => {
    mockCrmSession({ role });
    const res = await POST(new Request("http://localhost/api/leads/new", { method: "POST", body: "{}" }));
    expect(res.status).toBe(403);
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("comercial passa da permissão (payload inválido cai na validação)", async () => {
    mockCrmSession({ role: "comercial" });
    const res = await POST(new Request("http://localhost/api/leads/new", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/leads/new — campos sem coluna no banco", () => {
  const payload = (extra: Record<string, unknown>) => ({
    solicitante: "Pessoa Comercial",
    email: "contato@cliente.com.br",
    cadastrado_por: "comercial@bp.com.br",
    due_diligence: "Nao",
    empresas: [{ tipo_documento: "CNPJ", razao_social: "ACME Ltda", documento: "11.222.333/0001-81" }],
    areas_analise: ["Cível"],
    local_reuniao: "Online",
    tipo_de_lead: "Lead Digital",
    plataforma: "Instagram",
    ...extra,
  });

  function setupDb() {
    const fake = createSupabaseFake({
      tables: {
        oportunidades: { single: { data: { id: "op-1" }, error: null } },
        lead_intakes: {
          // O insert do intake grava; o update das colunas novas (`.update().eq()`) falha
          // como no remoto sem a migration.
          awaited: () => {
            const lastCall = fake.calls.filter((c) => c.table === "lead_intakes").at(-1);
            return lastCall?.method === "eq"
              ? { data: null, error: { code: "PGRST204", message: "Could not find the 'plataforma' column of 'lead_intakes' in the schema cache" } }
              : { data: null, error: null };
          },
        },
      },
    });
    vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
    return fake;
  }

  it("cria o lead e devolve aviso legível quando Plataforma e Decisor não gravam", async () => {
    mockCrmSession({ role: "comercial" });
    setupDb();
    const res = await POST(
      new Request("http://localhost/api/leads/new", {
        method: "POST",
        body: JSON.stringify(payload({ decisor: "Diretora Financeira" })),
      }),
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { warning: string | null };
    expect(json.warning).toContain("Plataforma e Decisor não foram gravados");
    expect(json.warning).toContain("20261008183000");
  });

  it("sem nada a gravar nessas colunas não tenta o update nem avisa", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = setupDb();
    const res = await POST(
      new Request("http://localhost/api/leads/new", {
        method: "POST",
        body: JSON.stringify(payload({ tipo_de_lead: "Lead Ativa", plataforma: null })),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).warning).toBeNull();
    expect(fake.calls.some((c) => c.table === "lead_intakes" && c.method === "update")).toBe(false);
  });

  it("recusa CPF/CNPJ com dígito errado e diz qual empresa, sem gravar nada", async () => {
    mockCrmSession({ role: "comercial" });
    const fake = setupDb();
    const res = await POST(
      new Request("http://localhost/api/leads/new", {
        method: "POST",
        body: JSON.stringify(
          payload({
            empresas: [
              { tipo_documento: "CNPJ", razao_social: "ACME Ltda", documento: "11.222.333/0001-81" },
              { tipo_documento: "CNPJ", razao_social: "LE BLOG LTDA", documento: "13.030.003/0001-11" },
            ],
          }),
        ),
      }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toContain('CNPJ inválido em "LE BLOG LTDA"');
    expect(fake.calls).toHaveLength(0);
  });
});
