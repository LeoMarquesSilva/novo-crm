import { beforeEach, describe, expect, it, vi } from "vitest";

import { syncDueAreaTasksForOpportunity } from "@/lib/crm/due-area-tasks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EvolutionWhatsappConnector } from "@/modules/crm/infrastructure/integrations/evolution-whatsapp";
import {
  solicitarAberturaVios,
  viosAberturaModo,
} from "@/modules/crm/application/services/solicitar-abertura-vios";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { createSupabaseFake } from "@/test/supabase-fake";
import { POST } from "./route";

// Nada sai de verdade: Evolution, robô do SAMA e e-mail são falsos.
const { sendText } = vi.hoisted(() => ({ sendText: vi.fn() }));
vi.mock("@/modules/crm/infrastructure/integrations/evolution-whatsapp", () => ({
  EvolutionWhatsappConnector: vi.fn(function EvolutionWhatsappConnectorFake() {
    return { sendText };
  }),
  createEvolutionConnectorFromEnv: vi.fn(() => ({ sendText })),
}));
vi.mock("@/lib/crm/due-area-tasks", () => ({ syncDueAreaTasksForOpportunity: vi.fn() }));
vi.mock("@/modules/crm/application/services/solicitar-abertura-vios", () => ({
  viosAberturaModo: vi.fn(() => "desligado"),
  solicitarAberturaVios: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/modules/crm/application/services/send-lead-notification-email", () => ({
  sendLeadNotificationEmail: vi.fn().mockResolvedValue({ ok: true }),
  buildLeadDetailUrl: vi.fn((id: string) => `https://crm.exemplo.com.br/crm/leads/${id}`),
}));

const DESTINO = "120363000000000000@g.us";

const payload = (extra: Record<string, unknown> = {}) => ({
  solicitante: "Pessoa Comercial",
  email: "contato@cliente.com.br",
  cadastrado_por: "comercial@bp.com.br",
  due_diligence: "Nao",
  empresas: [{ tipo_documento: "CNPJ", razao_social: "ACME Ltda", documento: "11.222.333/0001-81" }],
  areas_analise: ["Cível"],
  local_reuniao: "Online",
  tipo_de_lead: "Lead Ativa",
  ...extra,
});

function setupDb(options: { destination?: string | null; semResponsavel?: string[] } = {}) {
  const fake = createSupabaseFake({
    tables: {
      oportunidades: { single: { data: { id: "op-1" }, error: null } },
      whatsapp_due_config: {
        maybeSingle: {
          data: options.destination === null ? null : { destination: options.destination ?? DESTINO, is_active: true },
          error: null,
        },
      },
      due_area_tasks: {
        awaited: { data: (options.semResponsavel ?? []).map((area_key) => ({ area_key })), error: null },
      },
    },
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
  return fake;
}

async function criar(body: Record<string, unknown>) {
  const res = await POST(new Request("http://localhost/api/leads/new", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as { ok: boolean; warning: string | null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  sendText.mockResolvedValue(undefined);
  vi.mocked(viosAberturaModo).mockReturnValue("desligado");
  vi.mocked(solicitarAberturaVios).mockResolvedValue({ status: "enviado", avisos: [] });
  mockCrmSession({ role: "comercial" });
});

describe("POST /api/leads/new — aviso no grupo da DUE", () => {
  it("lead sem DUE também avisa o grupo, com o modelo novo_lead, sem tarefas nem abertura no VIOS", async () => {
    const fake = setupDb();
    const { status, json } = await criar(payload());

    expect(status).toBe(201);
    expect(json.warning).toBeNull();
    expect(sendText).toHaveBeenCalledTimes(1);
    const { destination, text } = sendText.mock.calls[0]![0] as { destination: string; text: string };
    expect(destination).toBe(DESTINO);
    expect(text.startsWith("*NOVO LEAD*\n")).toBe(true);
    expect(text).not.toContain("DUE DILIGENCE");
    expect(text).not.toContain("Prazo de entrega");
    expect(text).toContain("*Due diligence:* Não");
    expect(text).toContain("- *ACME Ltda* · CNPJ 11.222.333/0001-81");
    expect(text).toContain("*Abrir no CRM:* https://crm.exemplo.com.br/crm/leads/op-1");
    // Modelo lido do banco pela chave do lead sem DUE.
    expect(
      fake.calls.some((c) => c.table === "whatsapp_message_templates" && c.method === "eq" && c.args[1] === "novo_lead"),
    ).toBe(true);
    expect(syncDueAreaTasksForOpportunity).not.toHaveBeenCalled();
    expect(solicitarAberturaVios).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.table === "due_area_tasks")).toBe(false);
  });

  it("lead com DUE segue com novo_lead_due, tarefas e alerta de área (modo desligado: sem abertura no VIOS)", async () => {
    setupDb({ semResponsavel: ["Recuperação de Créditos"] });
    const { status, json } = await criar(
      payload({
        due_diligence: "Sim",
        data_entrega_due: "2026-11-09",
        horario_entrega_due: "18:00",
        data_reuniao: "2026-11-10",
        horario_reuniao: "12:00",
      }),
    );

    expect(status).toBe(201);
    expect(json.warning).toBeNull();
    expect(syncDueAreaTasksForOpportunity).toHaveBeenCalledWith(expect.anything(), "op-1");
    expect(sendText).toHaveBeenCalledTimes(1);
    const { text } = sendText.mock.calls[0]![0] as { text: string };
    expect(text.startsWith("*NOVO LEAD · DUE DILIGENCE*\n")).toBe(true);
    expect(text).toContain("- *Prazo de entrega:* 09/11/2026 às 18:00");
    expect(text).toContain("> *Atenção:* nenhum usuário cadastrado na área Recuperação de Créditos");
    expect(solicitarAberturaVios).not.toHaveBeenCalled();
  });

  it("falha no WhatsApp não derruba o cadastro: volta como aviso", async () => {
    setupDb();
    sendText.mockRejectedValueOnce(new Error("Evolution fora do ar"));
    const { status, json } = await criar(payload());

    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    expect(json.warning).toMatch(/^WhatsApp DUE: .*\(ref /);
  });

  it("sem destino ativo: lead sem DUE não avisa na tela; lead com DUE avisa como antes", async () => {
    setupDb({ destination: null });
    const semDue = await criar(payload());
    expect(semDue.status).toBe(201);
    expect(semDue.json.warning).toBeNull();

    const comDue = await criar(
      payload({
        due_diligence: "Sim",
        data_entrega_due: "2026-11-09",
        horario_entrega_due: "18:00",
        data_reuniao: "2026-11-10",
      }),
    );
    expect(comDue.status).toBe(201);
    expect(comDue.json.warning).toContain("WhatsApp DUE: Configuração de destino WhatsApp não encontrada ou inativa.");
    expect(sendText).not.toHaveBeenCalled();
    expect(EvolutionWhatsappConnector).not.toHaveBeenCalled();
  });
});

describe("POST /api/leads/new — abertura no VIOS (VIOS_ABERTURA_MODO)", () => {
  const comDue = () =>
    payload({
      due_diligence: "Sim",
      data_entrega_due: "2026-11-09",
      horario_entrega_due: "18:00",
      data_reuniao: "2026-11-10",
    });

  it("simular: pede ao SAMA em simulação; falha do robô não vira aviso", async () => {
    setupDb();
    vi.mocked(viosAberturaModo).mockReturnValue("simular");
    vi.mocked(solicitarAberturaVios).mockResolvedValue({ status: "erro", mensagem: "Robô fora do ar. (ref abc)" });
    const { status, json } = await criar(comDue());

    expect(status).toBe(201);
    expect(solicitarAberturaVios).toHaveBeenCalledWith(expect.anything(), "op-1", { modo: "simular" });
    expect(json.warning).toBeNull();
  });

  it("ativo: pede ao SAMA gravando; falha vira aviso na tela", async () => {
    setupDb();
    vi.mocked(viosAberturaModo).mockReturnValue("ativo");
    vi.mocked(solicitarAberturaVios).mockResolvedValue({ status: "erro", mensagem: "Robô fora do ar. (ref abc)" });
    const { status, json } = await criar(comDue());

    expect(status).toBe(201);
    expect(solicitarAberturaVios).toHaveBeenCalledWith(expect.anything(), "op-1", { modo: "ativo" });
    expect(json.warning).toBe("Abertura no VIOS: Robô fora do ar. (ref abc)");
  });

  it("ativo e enviado: sem aviso", async () => {
    setupDb();
    vi.mocked(viosAberturaModo).mockReturnValue("ativo");
    const { json } = await criar(comDue());
    expect(solicitarAberturaVios).toHaveBeenCalledTimes(1);
    expect(json.warning).toBeNull();
  });

  it("lead sem DUE não pede abertura em nenhum modo", async () => {
    setupDb();
    vi.mocked(viosAberturaModo).mockReturnValue("ativo");
    await criar(payload());
    expect(solicitarAberturaVios).not.toHaveBeenCalled();
  });
});
