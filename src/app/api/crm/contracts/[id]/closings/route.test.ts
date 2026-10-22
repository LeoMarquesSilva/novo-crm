import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

const contractId = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id: contractId }) });
const prepare = (competency: string) =>
  POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify({ competency, expectedRevision: 0 }) }),
    ctx(),
  );

const component = (row: Record<string, unknown>) => ({
  area_id: null, periodo_inicio: null, periodo_fim: null, valor_fixo: null, valor_unitario: null,
  quantidade_incluida: null, percentual: null, modo_cobranca_variavel: null, tratamento_tributario: null,
  liberacao_manual_necessaria: false, condicao_liberacao: null,
  elegivel_rateio: false, elegivel_participacao: false, elegivel_comissao: false,
  ...row,
});

/**
 * Contrato do teste E2E: vigência desde 18/10/2026, SPOT de R$ 12.000 em 5x de R$ 2.400 e êxito;
 * `monthlyFee` acrescenta uma mensalidade de R$ 1.000 desde 18/10 com a escolha do Financeiro.
 */
function setupDb(monthlyFee?: { startMonthBilling: "mes_cheio" | "mes_seguinte" | null }) {
  const version = {
    id: "version-1",
    vigente_de: "2026-10-18",
    vigente_ate: null,
    cobranca_mes_inicio: monthlyFee?.startMonthBilling ?? null,
  };
  const fake = createSupabaseFake({
    tables: {
      contratos: { maybeSingle: { data: { status: "ativo" }, error: null } },
      // Simula o filtro do banco: a versão só volta se começa antes do limite pedido pela rota.
      contrato_versoes: {
        maybeSingle: () => {
          const limit = fake.calls.findLast((call) => call.table === "contrato_versoes" && call.method === "lt")?.args[1];
          return { data: typeof limit === "string" && version.vigente_de < limit ? version : null, error: null };
        },
      },
      contrato_componentes_cobranca: {
        awaited: {
          data: [
            component({ id: "spot", tipo: "mensal_preco_fechado", descricao: "SPOT R$ 12.000 em 5x", valor_fixo: "12000.00" }),
            component({ id: "exito", tipo: "exito_percentual", descricao: "Êxito", percentual: "10.00", liberacao_manual_necessaria: true }),
            ...(monthlyFee ? [component({ id: "mensal", tipo: "mensal_fixo", descricao: "Mensalidade", valor_fixo: "1000.00" })] : []),
          ],
          error: null,
        },
      },
      contrato_parcelas: {
        awaited: {
          data: ["2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"].map((competencia, index) => ({
            componente_id: "spot",
            numero: index + 1,
            competencia,
            valor: "2400.00",
          })),
          error: null,
        },
      },
      contrato_rateios_area: { awaited: { data: [], error: null } },
      contrato_participacoes_socios: { awaited: { data: [], error: null } },
      contrato_comissoes: { awaited: { data: [], error: null } },
      contrato_areas: { awaited: { data: [], error: null } },
      contrato_consumos_mensais: { awaited: { data: [], error: null } },
      contrato_resolucoes_mensais: { awaited: { data: [], error: null } },
    },
    rpc: {
      create_contract_closing_revision: {
        data: [{ closing_id: "closing-1", revision_id: "revision-1", revision_number: 1 }],
        error: null,
      },
    },
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCrmSession({ role: "financeiro" });
});

describe("POST /api/crm/contracts/[id]/closings", () => {
  it("fecha a competência do mês em que a vigência começa, com a 1ª parcela", async () => {
    const fake = setupDb();

    const res = await prepare("2026-10-01");

    expect(res.status).toBe(201);
    expect(fake.calls).toContainEqual({ table: "contrato_versoes", method: "lt", args: ["vigente_de", "2026-11-01"] });
    expect(fake.rpc).toHaveBeenCalledWith(
      "create_contract_closing_revision",
      expect.objectContaining({
        p_competencia: "2026-10-01",
        p_version_id: "version-1",
        p_totals: expect.objectContaining({ honorariosCents: "240000", totalCents: "240000" }),
        p_items: expect.arrayContaining([
          expect.objectContaining({ kind: "memory", componentId: "spot", amountCents: "240000" }),
          expect.objectContaining({ kind: "blocker", componentId: "exito", blockerCode: "manual_release_required" }),
        ]),
      }),
    );
  });

  it.each([
    ["mes_cheio", "340000"],
    ["mes_seguinte", "240000"],
    [null, "240000"],
  ] as const)("mensalidade desde 18/10 segue a escolha gravada na versão (%s)", async (startMonthBilling, total) => {
    const fake = setupDb({ startMonthBilling });

    const res = await prepare("2026-10-01");

    expect(res.status).toBe(201);
    expect(fake.rpc).toHaveBeenCalledWith(
      "create_contract_closing_revision",
      expect.objectContaining({ p_totals: expect.objectContaining({ honorariosCents: total }) }),
    );
  });

  it("competência anterior ao início da vigência não acha versão", async () => {
    const fake = setupDb();

    const res = await prepare("2026-09-01");

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, code: "CONTRACT_VERSION_NOT_FOUND" });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});
