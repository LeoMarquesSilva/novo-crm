import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const leadId = "00000000-0000-4000-8000-000000000001";

function setupLead(etapa: string) {
  const fake = createSupabaseFake({
    tables: {
      oportunidades: {
        maybeSingle: {
          data: { id: leadId, etapa, criado_por: "outro", solicitante_email: "x@bp.com.br" },
          error: null,
        },
      },
      rd_deal_reconciliacao: { maybeSingle: { data: null, error: null } },
    },
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
  return fake;
}

const move = (nextStage: string) =>
  POST(
    new Request("http://localhost/api/crm/leads/transition", {
      method: "POST",
      body: JSON.stringify({ opportunityId: leadId, nextStage }),
    }),
  );

beforeEach(() => vi.clearAllMocks());

describe("POST /api/crm/leads/transition — permissão por etapa", () => {
  it("financeiro não move etapa de venda", async () => {
    mockCrmSession({ role: "financeiro" });
    const fake = setupLead("reuniao");
    const res = await move("confeccao_proposta");
    expect(res.status).toBe(403);
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("contrato elaborado → enviado aponta para o diálogo de envio", async () => {
    mockCrmSession({ role: "comercial" });
    setupLead("contrato_elaborado");
    const res = await move("contrato_enviado");
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.transitionBlocker).toMatchObject({ code: "use_dedicated_action", actionKind: "open_send_dialog" });
  });

  it("comercial não conclui o cadastro (time Operações Legais)", async () => {
    mockCrmSession({ role: "comercial" });
    setupLead("cadastro_novo_cliente");
    const res = await move("inclusao_faturamento");
    expect(res.status).toBe(403);
  });
});
