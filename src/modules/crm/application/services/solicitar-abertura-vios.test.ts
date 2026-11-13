import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationError } from "@/lib/http/api-errors";
import { createSupabaseFake, type FakeTableConfig } from "@/test/supabase-fake";
import type { ViosAberturaPedido } from "./build-vios-abertura-payload";
import { solicitarAberturaVios, viosAberturaModo } from "./solicitar-abertura-vios";

vi.mock("@/modules/crm/application/services/send-lead-notification-email", () => ({
  buildLeadDetailUrl: vi.fn((id: string) => `https://crm.exemplo.com.br/crm/leads/${id}`),
}));

const OP = "11111111-2222-4333-8444-555555555555";

const intake = (extra: Record<string, unknown> = {}) => ({
  due_diligence: true,
  empresas_json: [
    { tipo_documento: "CNPJ", razao_social: "ACME Ltda", documento: "11.222.333/0001-81" },
    { tipo_documento: "CPF", razao_social: "Bruno Di Salvo", documento: "216.993.268-27" },
  ],
  areas_analise: ["Civel", "Trabalhista"],
  data_entrega_due: "2026-11-20",
  horario_entrega_due: "09:00",
  local_reuniao: "Online",
  data_reuniao: "2026-11-23",
  horario_reuniao: "10:00",
  tipo_lead: "Lead Passiva",
  tipo_indicacao: null,
  nome_indicacao: null,
  plataforma: null,
  ...extra,
});

function setup(tables: Record<string, FakeTableConfig> = {}) {
  const fake = createSupabaseFake({
    tables: {
      oportunidades: { maybeSingle: { data: { havera_due_diligence: true }, error: null } },
      lead_intakes: { maybeSingle: { data: intake(), error: null } },
      // Cível já tem tarefa com responsável trocado; Trabalhista cai no padrão da área.
      due_area_tasks: { awaited: { data: [{ area_key: "Cível", responsavel_app_user_id: "u-civel" }], error: null } },
      app_users: {
        maybeSingle: { data: { id: "u-trab" }, error: null },
        awaited: {
          data: [
            { id: "u-civel", auth_user_id: "a-civel", full_name: "Giancarlo Zotini" },
            { id: "u-trab", auth_user_id: "a-trab", full_name: "Daniel Pressatto Fernandes" },
          ],
          error: null,
        },
      },
      orqestrai_colaboradores: {
        awaited: {
          data: [
            {
              id: "1",
              full_name: "Giancarlo Murta Zotini",
              email: "giancarlo@bismarchipires.com.br",
              is_active: true,
            },
          ],
          error: null,
        },
      },
      ...tables,
    },
  });
  const emails: Record<string, string> = {
    "a-civel": "giancarlo@bpplaw.com.br",
    "a-trab": "daniel@bismarchipires.com.br",
  };
  Object.assign(fake.client, {
    auth: {
      admin: {
        getUserById: vi.fn(async (id: string) => ({ data: { user: { email: emails[id] ?? null } }, error: null })),
      },
    },
  });
  return fake;
}

const enfileirar = vi.fn<(pedido: ViosAberturaPedido) => Promise<{ duplicado: boolean }>>();

beforeEach(() => {
  vi.clearAllMocks();
  enfileirar.mockResolvedValue({ duplicado: false });
});

describe("viosAberturaModo", () => {
  it("desligado por padrão e para valor desconhecido", () => {
    expect(viosAberturaModo({})).toBe("desligado");
    expect(viosAberturaModo({ VIOS_ABERTURA_MODO: "talvez" })).toBe("desligado");
    expect(viosAberturaModo({ VIOS_ABERTURA_MODO: " Simular " })).toBe("simular");
    expect(viosAberturaModo({ VIOS_ABERTURA_MODO: "ativo" })).toBe("ativo");
  });
});

describe("solicitarAberturaVios", () => {
  it("desligado não lê nem envia nada", async () => {
    const fake = setup();
    await expect(solicitarAberturaVios(fake.client as never, OP, { modo: "desligado", enfileirar })).resolves.toEqual({
      status: "desligado",
    });
    expect(fake.client.from).not.toHaveBeenCalled();
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("monta pelo banco, usa os nomes do RH e envia no modo pedido", async () => {
    const fake = setup();
    const r = await solicitarAberturaVios(fake.client as never, OP, {
      modo: "simular",
      hojeYmd: "2026-11-13",
      enfileirar,
    });

    expect(r).toEqual({ status: "enviado", avisos: [] });
    const pedido = enfileirar.mock.calls[0]![0];
    expect(pedido.modo).toBe("simular");
    expect(pedido.chave_idempotencia).toBe(`crm:abertura_due:${OP}`);
    expect(pedido.crm_url).toBe(`https://crm.exemplo.com.br/crm/leads/${OP}`);
    expect(pedido.cliente).toMatchObject({ tipo_pessoa: "PJ", nome: "ACME Ltda", cpf_cnpj: "11222333000181" });
    expect(pedido.envolvidos).toEqual([{ nome: "Bruno Di Salvo", cpf_cnpj: "21699326827", tipo_parte: "Cliente" }]);
    // Nome do RH pelo local-part do login (bpplaw × bismarchipires); sem par no RH, fica o do CRM.
    expect(pedido.tarefas.find((t) => t.tarefa === "Protocolo")!.responsavel).toEqual([
      "Giancarlo Murta Zotini",
      "Daniel Pressatto Fernandes",
    ]);
    expect(
      fake.calls.some((c) => c.table === "due_area_tasks" && c.method === "eq" && c.args[1] === OP),
    ).toBe(true);
  });

  it("mesma chave já recebida no SAMA volta como duplicado", async () => {
    enfileirar.mockResolvedValueOnce({ duplicado: true });
    const r = await solicitarAberturaVios(setup().client as never, OP, { modo: "ativo", enfileirar });
    expect(r.status).toBe("duplicado");
  });

  it("lead sem DUE não envia", async () => {
    const fake = setup({
      oportunidades: { maybeSingle: { data: { havera_due_diligence: false }, error: null } },
      lead_intakes: { maybeSingle: { data: intake({ due_diligence: false }), error: null } },
    });
    await expect(solicitarAberturaVios(fake.client as never, OP, { modo: "ativo", enfileirar })).resolves.toEqual({
      status: "sem_due",
    });
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("sem data de entrega fica para depois (pulado)", async () => {
    const fake = setup({ lead_intakes: { maybeSingle: { data: intake({ data_entrega_due: null }), error: null } } });
    await expect(solicitarAberturaVios(fake.client as never, OP, { modo: "ativo", enfileirar })).resolves.toEqual({
      status: "pulado",
      motivo: "Lead sem data de entrega da due.",
    });
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("falha do SAMA não lança: volta a mensagem pública com a referência do log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    enfileirar.mockRejectedValueOnce(
      new IntegrationError("vios_rpa", "O robô do VIOS recusou o pedido de abertura.", "detalhe interno", 400),
    );
    const r = await solicitarAberturaVios(setup().client as never, OP, { modo: "ativo", enfileirar });
    expect(r.status).toBe("erro");
    expect(r.status === "erro" && r.mensagem).toMatch(/^O robô do VIOS recusou o pedido de abertura\. \(ref \w+\)$/);
    expect(r.status === "erro" && r.mensagem).not.toContain("detalhe interno");
    consoleError.mockRestore();
  });
});
