import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFake } from "@/test/supabase-fake";
import { mockCrmSession } from "@/test/mock-crm-auth";
import { POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/auth/module-access", () => ({ listUserModules: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/proposta-document-data", () => ({
  loadDefaultContratoTemplate: vi.fn(async () => ({ id: "tpl-1", name: "Contrato" })),
  loadDocumentTemplateById: vi.fn(),
  buildContratoDocumentSnapshot: vi.fn(),
  buildGeneratedContratoDocxFilePath: vi.fn(),
  sanitizeFilenamePart: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000000001";
const ctx = () => ({ params: Promise.resolve({ id: leadId }) });
const send = (body: unknown) =>
  POST(new NextRequest("http://localhost", { method: "POST", body: JSON.stringify(body) }), ctx());

function setup(input: { etapa: string; documentUuid?: string | null; documentStatus?: string | null }) {
  const fake = createSupabaseFake({
    tables: {
      oportunidades: {
        maybeSingle: {
          data: {
            id: leadId,
            solicitante_nome: "ACME",
            etapa: input.etapa,
            d4sign_document_uuid: input.documentUuid ?? null,
            d4sign_signers: [],
            cliente_id: null,
          },
          error: null,
        },
      },
      contract_review_tasks: {
        maybeSingle: { data: { status: "concluido", concluido_em: "2026-10-10T00:00:00Z", prazo_revisao: null }, error: null },
      },
      d4sign_documents: {
        maybeSingle: {
          data: input.documentUuid ? { uuid_doc: input.documentUuid, d4sign_status: input.documentStatus, signers: [] } : null,
          error: null,
        },
      },
    },
  });
  vi.mocked(createSupabaseAdminClient).mockReturnValue(fake.client as never);
  return fake;
}

const client = { email: "diretor@cliente.com", role: "CONTRATANTE" };

beforeEach(() => {
  vi.clearAllMocks();
  mockCrmSession({ role: "comercial" });
});

describe("POST send-d4sign — regras de envio", () => {
  it("financeiro não envia", async () => {
    mockCrmSession({ role: "financeiro" });
    setup({ etapa: "contrato_elaborado" });
    expect((await send({ signers: [client] })).status).toBe(403);
  });

  it("fora de Contrato Elaborado/Enviado → 422", async () => {
    setup({ etapa: "confeccao_contrato" });
    const res = await send({ signers: [client] });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("STAGE_NOT_SENDABLE");
  });

  it("e-mail de sócio na lista do cliente → 422", async () => {
    setup({ etapa: "contrato_elaborado" });
    const res = await send({ signers: [{ email: "gustavo@bpplaw.com.br" }] });
    expect(res.status).toBe(422);
  });

  it("e-mail que não é de sócio entre os sócios → 422", async () => {
    setup({ etapa: "contrato_elaborado" });
    const res = await send({ signers: [client], firmSigners: [{ email: "alguem@bpplaw.com.br" }] });
    expect(res.status).toBe(422);
  });

  it("reenvio com documento pendente exige confirmação", async () => {
    setup({ etapa: "contrato_enviado", documentUuid: "doc-1", documentStatus: "3" });
    const res = await send({ signers: [client] });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("RESEND_CONFIRMATION_REQUIRED");
  });

  it("documento já assinado por todos → 409", async () => {
    setup({ etapa: "contrato_enviado", documentUuid: "doc-1", documentStatus: "1" });
    const res = await send({ signers: [client], resend: { confirmCancelPrevious: true } });
    expect((await res.json()).code).toBe("ALREADY_SIGNED");
  });

  it("etapa vista pela tela diferente da atual → 409", async () => {
    setup({ etapa: "contrato_enviado" });
    const res = await send({ signers: [client], expectedStage: "contrato_elaborado" });
    expect(res.status).toBe(409);
  });
});
