import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyAudience } from "@/lib/crm/notifications/crm-notify";
import { recordLeadActivityEvent } from "@/lib/crm/record-lead-activity";
import { createSupabaseFake } from "@/test/supabase-fake";
import { completeSignedContract } from "./complete-signed-contract";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/crm/notifications/crm-notify", () => ({ notifyAudience: vi.fn(async () => []) }));
vi.mock("@/lib/crm/record-lead-activity", () => ({ recordLeadActivityEvent: vi.fn() }));
vi.mock("@/lib/d4sign/signed-pdf-cache", () => ({ loadSignedContractPdf: vi.fn(async () => ({ ok: true })) }));

const leadId = "lead-1";

function fake(input: {
  rpcRow?: Record<string, unknown> | null;
  rpcError?: { code: string; message: string } | null;
  rdLead?: boolean;
}) {
  return createSupabaseFake({
    tables: {
      rd_deal_reconciliacao: {
        maybeSingle: { data: input.rdLead ? { detalhes: { deal: {} } } : null, error: null },
      },
    },
    rpc: {
      complete_contract_signature_atomic: { data: input.rpcRow ?? null, error: input.rpcError ?? null },
    },
  });
}

const run = (supabase: unknown) =>
  completeSignedContract({
    supabase: supabase as never,
    opportunityId: leadId,
    documentUuid: "doc-1",
    signers: [],
    source: "webhook",
    leadName: "ACME",
  });

beforeEach(() => vi.clearAllMocks());

describe("completeSignedContract", () => {
  it("assinatura nova: histórico, venda fechada, pós-venda e avisos para todos", async () => {
    const f = fake({
      rpcRow: {
        outcome: "completed",
        signed_transition_id: "t-1",
        postsale_transition_id: "t-2",
        sale_closed: true,
        contract_id: "c-1",
        stage: "aguardando_cadastro",
      },
    });
    const result = await run(f.client);
    expect(result).toMatchObject({ outcome: "completed", saleClosed: true, stage: "aguardando_cadastro" });
    expect(f.rpc).toHaveBeenCalledWith(
      "complete_contract_signature_atomic",
      expect.objectContaining({ p_auto_advance: true, p_document_uuid: "doc-1", p_source: "webhook" }),
    );
    const kinds = vi.mocked(recordLeadActivityEvent).mock.calls.map((c) => c[1].kind);
    expect(kinds).toEqual(["contrato_assinado", "etapa_alterada", "venda_fechada", "etapa_alterada"]);
    const [, audience, content] = vi.mocked(notifyAudience).mock.calls[0]!;
    expect(audience).toMatchObject({
      leadTeamOf: leadId,
      firmPartners: true,
      roles: ["admin", "comercial", "financeiro"],
      modules: ["operacoes_legais"],
    });
    expect(content).toMatchObject({ tipo: "venda_fechada", idempotencyKey: `venda-fechada:${leadId}` });
    expect(vi.mocked(notifyAudience).mock.calls[1]?.[2]).toMatchObject({ tipo: "cadastro_cliente_solicitado" });
  });

  it("segunda chamada (webhook × sync) não repete histórico nem aviso", async () => {
    const f = fake({
      rpcRow: {
        outcome: "already_completed",
        signed_transition_id: null,
        postsale_transition_id: null,
        sale_closed: false,
        contract_id: "c-1",
        stage: "aguardando_cadastro",
      },
    });
    const result = await run(f.client);
    expect(result.outcome).toBe("already_completed");
    expect(recordLeadActivityEvent).not.toHaveBeenCalled();
    expect(notifyAudience).not.toHaveBeenCalled();
  });

  it("documento que não é o atual do lead não altera nada", async () => {
    const f = fake({
      rpcRow: {
        outcome: "not_current_document",
        signed_transition_id: null,
        postsale_transition_id: null,
        sale_closed: false,
        contract_id: null,
        stage: "contrato_enviado",
      },
    });
    expect((await run(f.client)).outcome).toBe("not_current_document");
    expect(notifyAudience).not.toHaveBeenCalled();
  });

  it("lead do RD não avança para o pós-venda e só avisa a equipe do lead", async () => {
    const f = fake({
      rdLead: true,
      rpcRow: {
        outcome: "completed",
        signed_transition_id: "t-1",
        postsale_transition_id: null,
        sale_closed: true,
        contract_id: "c-1",
        stage: "contrato_assinado",
      },
    });
    await run(f.client);
    expect(f.rpc).toHaveBeenCalledWith(
      "complete_contract_signature_atomic",
      expect.objectContaining({ p_auto_advance: false }),
    );
    expect(vi.mocked(notifyAudience).mock.calls).toHaveLength(1);
    expect(vi.mocked(notifyAudience).mock.calls[0]?.[1]).toEqual({ leadTeamOf: leadId });
  });

  it("erro do banco que não é RPC ausente sobe (webhook tenta de novo)", async () => {
    const f = fake({ rpcError: { code: "40001", message: "conflito" } });
    await expect(run(f.client)).rejects.toMatchObject({ code: "40001" });
  });
});
