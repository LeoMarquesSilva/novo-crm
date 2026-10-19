import { describe, expect, it, vi } from "vitest";

import { createSupabaseFake } from "@/test/supabase-fake";

import { convertRdMigration, saveRdMigration } from "./service";

const leadId = "00000000-0000-4000-8000-0000000000aa";
const admin = { appUserId: "u-admin", isAdmin: true, email: "admin@bismarchipires.com.br" };

const deal = {
  id: "68924d7526c1f50018dc039b",
  name: "RENATO MAROTTA STAREK",
  win: true,
  closed_at: "2026-10-15T18:00:00-03:00",
  deal_stage: { name: "Contrato Assinado (SOLICITANTE)" },
  user: { email: "operador.rd@bismarchipires.com.br" },
  deal_custom_fields: [
    ["Email Solicitante", "ana.souza@bismarchipires.com.br"],
    ["Razão Social [CP]", "RENATO MAROTTA STAREK"],
    ["CNPJ [CP]", "416.641.008-30"],
    ["Tipo de Lead", "Lead Ativa"],
    ["Haverá Due Diligence?", "Não"],
    ["Local da Reunião", "Escritório"],
    ["Áreas que serão objeto de análise", ["Cível"]],
    ["Data de assinatura do contrato [CA]", "15/10/2026"],
    ["Gestor do Contrato [CP]", "Ana Paula Souza"],
  ].map(([label, value]) => ({ value, custom_field: { label } })),
};

function setup(opportunity: Record<string, unknown>, migrationRows: unknown[] = []) {
  const fake = createSupabaseFake({
    tables: {
      oportunidades: {
        maybeSingle: {
          data: {
            id: leadId,
            etapa: "contrato_assinado",
            encerramento: "ganho",
            havera_due_diligence: false,
            solicitante_nome: "RENATO MAROTTA STAREK",
            solicitante_email: "ana.souza@bismarchipires.com.br",
            link_proposta: null,
            link_contrato: "https://bpplaw.sharepoint.com/contrato.docx",
            d4sign_document_uuid: null,
            venda_fechada_em: null,
            rd_migrado_em: null,
            cliente_id: "cli-1",
            ...opportunity,
          },
          error: null,
        },
      },
      rd_deal_reconciliacao: {
        awaited: {
          data: [{ oportunidade_id: leadId, reconciled_at: "2026-10-16", rd_deal_id: deal.id, detalhes: { deal } }],
          error: null,
        },
      },
      rd_migracoes: { awaited: { data: migrationRows, error: null } },
      app_users: {
        awaited: {
          data: [
            { id: "u-ana", full_name: "Ana Paula Souza", auth_user_id: "auth-ana" },
            { id: "u-admin", full_name: "Admin", auth_user_id: "auth-admin" },
          ],
          error: null,
        },
      },
      field_definitions: {
        awaited: {
          data: [
            {
              id: "def-gestor",
              field_code: "cp_gestor_contrato",
              label: "Gestor do Contrato [CP]",
              field_type: "user",
              is_required: true,
              is_active: true,
              pipeline_code: "vendas",
              stage_code: "confeccao_proposta",
              sort_order: 1,
            },
          ],
          error: null,
        },
      },
      lead_intakes: { maybeSingle: { data: null, error: null } },
      field_values: { awaited: { data: [], error: null } },
      lead_client_onboarding: { maybeSingle: { data: null, error: null } },
    },
    rpc: { ensure_contract_draft_for_opportunity: { data: "contrato-1", error: null } },
  });
  Object.assign(fake.client, {
    auth: {
      admin: {
        listUsers: vi.fn(async () => ({
          data: {
            users: [
              { id: "auth-ana", email: "ana.souza@bismarchipires.com.br" },
              { id: "auth-admin", email: "admin@bismarchipires.com.br" },
            ],
          },
          error: null,
        })),
      },
    },
  });
  return fake;
}

const writes = (fake: ReturnType<typeof setup>, table: string, method: string) =>
  fake.calls.filter((c) => c.table === table && c.method === method).map((c) => c.args[0] as Record<string, unknown>);

describe("conversão do negócio do RD", () => {
  it("Contrato Assinado vira lead do CRM em Aguardando Cadastro, sem perder o RD", async () => {
    const fake = setup({});
    const result = await convertRdMigration(fake.client as never, { opportunityId: leadId, actor: admin });

    expect(result).toMatchObject({ outcome: "converted", stage: "aguardando_cadastro", status: "concluida" });

    const [oppUpdate] = writes(fake, "oportunidades", "update");
    expect(oppUpdate).toMatchObject({
      etapa: "aguardando_cadastro",
      encerramento: "ganho",
      venda_fechada_em: "2026-10-15T21:00:00.000Z",
      link_contrato: "https://bpplaw.sharepoint.com/contrato.docx",
      solicitante_email: "ana.souza@bismarchipires.com.br",
    });
    expect(typeof oppUpdate.rd_migrado_em).toBe("string");

    expect(writes(fake, "lead_intakes", "insert")[0]).toMatchObject({
      oportunidade_id: leadId,
      solicitante_nome: "Ana Paula Souza",
      tipo_lead: "Lead Ativa",
      local_reuniao: "Escritório",
      areas_analise: ["Cível"],
      empresas_json: [{ tipo_documento: "CPF", razao_social: "RENATO MAROTTA STAREK", documento: "41664100830" }],
    });
    expect(writes(fake, "field_values", "insert")).toEqual(
      expect.arrayContaining([expect.objectContaining({ field_definition_id: "def-gestor", value_json: "u-ana" })]),
    );
    expect(writes(fake, "transicoes_etapa", "insert")[0]).toMatchObject({
      etapa_origem: "contrato_assinado",
      etapa_destino: "aguardando_cadastro",
      observacao: "Migração do RD Station (virada)",
    });
    expect(fake.rpc).toHaveBeenCalledWith("ensure_contract_draft_for_opportunity", expect.objectContaining({ p_opportunity_id: leadId }));
    expect(writes(fake, "contratos", "update")[0]).toEqual({ data_assinatura: "2026-10-15" });
    expect(writes(fake, "lead_client_onboarding", "insert")[0]).toMatchObject({ oportunidade_id: leadId, status: "rascunho" });

    // A fila nasce como rascunho e só vira concluída depois do lead gravado.
    expect(writes(fake, "rd_migracoes", "insert")[0]).toMatchObject({ oportunidade_id: leadId, rd_deal_id: deal.id });
    expect(writes(fake, "rd_migracoes", "update").at(-1)).toMatchObject({
      status: "concluida",
      etapa_destino: "aguardando_cadastro",
      convertida_por: "u-admin",
    });
    const events = writes(fake, "lead_activity_events", "insert").map((e) => e.kind);
    expect(events).toEqual(["rd_migrado", "rd_migracao_concluida"]);
    // O snapshot do RD não é regravado.
    expect(writes(fake, "rd_deal_reconciliacao", "upsert")).toEqual([]);
  });

  it("não converte de novo nem quem está fora da migração", async () => {
    const already = setup({ rd_migrado_em: "2026-10-25T12:00:00.000Z", etapa: "aguardando_cadastro" });
    expect(await convertRdMigration(already.client as never, { opportunityId: leadId, actor: admin })).toMatchObject({
      outcome: "skipped",
      reason: "já convertido",
    });
    expect(writes(already, "oportunidades", "update")).toEqual([]);

    const fora = setup({}, [
      {
        oportunidade_id: leadId,
        rd_deal_id: deal.id,
        status: "fora",
        responsavel_app_user_id: null,
        payload: {},
        etapa_rd: null,
        etapa_destino: null,
        motivo_fora: "parado desde março",
        convertida_em: null,
        concluida_em: null,
        updated_at: "2026-10-19T10:00:00Z",
      },
    ]);
    expect(await convertRdMigration(fora.client as never, { opportunityId: leadId, actor: admin })).toMatchObject({
      outcome: "skipped",
      reason: "fora da migração",
    });
  });

  it("só o admin converte", async () => {
    const fake = setup({});
    await expect(
      convertRdMigration(fake.client as never, {
        opportunityId: leadId,
        actor: { appUserId: "u-ana", isAdmin: false, email: "ana.souza@bismarchipires.com.br" },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("antes da virada, salvar só grava o rascunho na fila", async () => {
    const fake = setup({});
    await saveRdMigration(fake.client as never, {
      opportunityId: leadId,
      actor: { appUserId: "u-ana", isAdmin: false, email: "ana.souza@bismarchipires.com.br" },
      values: { cadastro: { decisor: "Renato (sócio)" } },
    });
    expect(writes(fake, "rd_migracoes", "insert")[0]).toMatchObject({
      oportunidade_id: leadId,
      status: "pendente",
      atualizado_por: "u-ana",
    });
    expect(writes(fake, "oportunidades", "update")).toEqual([]);
    expect(writes(fake, "lead_intakes", "insert")).toEqual([]);
  });

  it("quem não é responsável nem admin não preenche", async () => {
    const fake = setup({});
    await expect(
      saveRdMigration(fake.client as never, {
        opportunityId: leadId,
        actor: { appUserId: "u-outro", isAdmin: false, email: "outro@bismarchipires.com.br" },
        values: {},
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
