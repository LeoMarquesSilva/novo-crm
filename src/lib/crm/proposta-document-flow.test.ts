import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as previewProposal } from "@/app/api/crm/leads/[id]/document/preview/route";
import { POST as generateProposal } from "@/app/api/crm/leads/[id]/document/generate-docx/route";
import { POST as generatePdf } from "@/app/api/crm/leads/[id]/document/generate-pdf/route";
import { generatePropostaFile } from "./generate-proposta-file";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPropostaDocumentSnapshot, loadDocumentTemplateById, type PropostaDocumentSnapshot, type PropostaDocumentTemplate } from "./proposta-document-data";
import { readModeloPropostaTemplateBuffer, renderCanonicalProposalDocx } from "./render-proposta-docx";
import { convertProposalDocxToPdf, resolveProposalPdfProvider, ProposalPdfError } from "./convert-proposta-pdf";
import { PROPOSAL_DOCX_MIME } from "./proposta-render-request";

vi.mock("@/lib/crm/convert-proposta-pdf", async (importOriginal) => ({
  ...await importOriginal<typeof import("./convert-proposta-pdf")>(),
  convertProposalDocxToPdf: vi.fn(),
  resolveProposalPdfProvider: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/proposta-document-data", () => ({
  buildPropostaDocumentSnapshot: vi.fn(),
  loadDocumentTemplateById: vi.fn(),
  loadDefaultDocumentTemplate: vi.fn(),
  buildGeneratedDocxFilePath: vi.fn(() => "documentos/propostas/lead/v3.docx"),
  sanitizeFilenamePart: vi.fn(() => "ACME"),
}));
vi.mock("@/lib/crm/render-proposta-docx", () => ({
  readModeloPropostaTemplateBuffer: vi.fn(),
  renderCanonicalProposalDocx: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000000001";
const templateId = "00000000-0000-4000-8000-000000000002";
const generatedAt = "2026-09-02T16:00:00.000Z";
const wordBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 12, 34, 56]);
const templateBytes = Buffer.from("official-template-fixture");
const template: PropostaDocumentTemplate = {
  id: templateId, name: "Proposta BP", documentType: "proposta", templatePath: "private/bp.docx",
  isActive: true, version: 1, metadata: {}, fields: [],
};
const canonical: PropostaDocumentSnapshot["canonical"] = {
  generatedAt, templateData: { EMPRESA: "ACME", RESPONSAVEL: "Maria Silva" }, escopoSections: [],
};

type FakeDatabaseResult = { data: unknown; error: null };
type FakeDatabaseQuery = {
  select: () => FakeDatabaseQuery;
  eq: () => FakeDatabaseQuery;
  maybeSingle: () => Promise<FakeDatabaseResult>;
  single: () => Promise<FakeDatabaseResult>;
  insert: (value: unknown) => FakeDatabaseQuery;
  update: (value: unknown) => FakeDatabaseQuery;
  then: Promise<FakeDatabaseResult>["then"];
};
const mutations = vi.fn<(operation: string, table: string, value: unknown) => void>();
const from = vi.fn((table: string) => {
  const data = table === "oportunidades"
    ? { id: leadId, solicitante_nome: "ACME" }
    : table === "document_instances" ? { id: "instance-1", current_version: 2 } : null;
  const result = Promise.resolve({ data, error: null });
  const query: FakeDatabaseQuery = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => result),
    single: vi.fn(() => result),
    insert: vi.fn((value: unknown) => { mutations("insert", table, value); return query; }),
    update: vi.fn((value: unknown) => { mutations("update", table, value); return query; }),
    then: result.then.bind(result),
  };
  return query;
});
const supabase = { from } as unknown as ReturnType<typeof createSupabaseAdminClient>;

function snapshot(pending: string[] = []): PropostaDocumentSnapshot {
  return { canonical, pending, responsavel: "Maria Silva", templateData: canonical.templateData,
    fieldByCode: { cp_cliente_cidade: "Curitiba" }, areas: [] };
}
function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/crm/leads/${leadId}/document`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const context = () => ({ params: Promise.resolve({ id: leadId }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveProposalPdfProvider).mockReturnValue({ kind: "word" });
  vi.mocked(convertProposalDocxToPdf).mockResolvedValue(Buffer.from("%PDF-1.7 fixture"));
  vi.mocked(requireAuthApi).mockResolvedValue({
    ok: true,
    profile: { id: "user-1", auth_user_id: "auth-1", role: "comercial", full_name: "Maria Silva", avatar_url: null, area: null },
  } as Awaited<ReturnType<typeof requireAuthApi>>);
  vi.mocked(createSupabaseAdminClient).mockReturnValue(supabase);
  vi.mocked(loadDocumentTemplateById).mockResolvedValue(template);
  vi.mocked(buildPropostaDocumentSnapshot).mockResolvedValue(snapshot());
  vi.mocked(readModeloPropostaTemplateBuffer).mockReturnValue(templateBytes);
  vi.mocked(renderCanonicalProposalDocx).mockReturnValue(Buffer.from(wordBytes));
});

describe("proposal document route and engine flow", () => {
  it("baixa a prévia com pendências, encaminha o draft ao snapshot e não persiste nada", async () => {
    vi.mocked(buildPropostaDocumentSnapshot).mockResolvedValue(snapshot(["Cidade"]));
    const draftValues = { cp_cliente_cidade: "Porto Alegre", cp_escopo_detalhe_json: "{}" };
    const response = await previewProposal(request({ templateId, generatedAt, responsavel: "Ana Souza", draftValues }), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(PROPOSAL_DOCX_MIME);
    expect(response.headers.get("X-Document-Pending")).toBe("1");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wordBytes);
    expect(buildPropostaDocumentSnapshot).toHaveBeenCalledWith({
      supabase, oportunidadeId: leadId, template, generatedAt: new Date(generatedAt), draftValues, responsavel: "Ana Souza",
    });
    expect(renderCanonicalProposalDocx).toHaveBeenCalledWith(canonical, templateBytes);
    expect(from.mock.calls.map(([table]) => table)).toEqual(["oportunidades"]);
    expect(mutations).not.toHaveBeenCalled();
  });

  it("gera oficialmente com o mesmo renderer, usando snapshot persistido e versionando só depois", async () => {
    const response = await generateProposal(request({ templateId, generatedAt, responsavel: "Nome do browser" }), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(PROPOSAL_DOCX_MIME);
    expect(response.headers.get("X-Document-Version")).toBe("3");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(wordBytes);
    expect(buildPropostaDocumentSnapshot).toHaveBeenCalledWith({ supabase, oportunidadeId: leadId, template, generatedAt: new Date(generatedAt) });
    expect(readModeloPropostaTemplateBuffer).toHaveBeenCalledWith(undefined, template.templatePath);
    expect(renderCanonicalProposalDocx).toHaveBeenCalledWith(canonical, templateBytes);
    expect(mutations.mock.calls.map(([operation, table]) => [operation, table])).toEqual([
      ["insert", "document_versions"], ["update", "document_instances"],
    ]);
    expect(mutations.mock.calls[0][2]).toMatchObject({ version_number: 3, data_snapshot: { canonical, generatedAt } });
    expect(vi.mocked(renderCanonicalProposalDocx).mock.invocationCallOrder[0]).toBeLessThan(mutations.mock.invocationCallOrder[0]);
  });

  it("bloqueia geração oficial com pendências antes de renderizar ou gravar versão", async () => {
    vi.mocked(buildPropostaDocumentSnapshot).mockResolvedValue(snapshot(["Enviado por"]));
    const response = await generateProposal(request({ templateId, generatedAt }), context());

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, pending: ["Enviado por"] });
    expect(renderCanonicalProposalDocx).not.toHaveBeenCalled();
    expect(from.mock.calls.map(([table]) => table)).toEqual(["oportunidades"]);
    expect(mutations).not.toHaveBeenCalled();
  });

  it("não cria nem altera instância ou versão quando o renderer falha", async () => {
    vi.mocked(renderCanonicalProposalDocx).mockImplementationOnce(() => { throw new Error("Template inválido"); });
    const response = await generateProposal(request({ templateId, generatedAt }), context());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "Template inválido" });
    expect(from.mock.calls.map(([table]) => table)).toEqual(["oportunidades"]);
    expect(mutations).not.toHaveBeenCalled();
  });

  it("prévia PDF converte os mesmos bytes DOCX sem mutações", async () => {
    const response = await previewProposal(request({ templateId, generatedAt, format: "pdf" }), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(await response.text()).toBe("%PDF-1.7 fixture");
    expect(convertProposalDocxToPdf).toHaveBeenCalledWith(Buffer.from(wordBytes), expect.any(AbortSignal));
    expect(mutations).not.toHaveBeenCalled();
  });

  it("gera PDF a partir do Word antes de criar versão e registra o formato correto", async () => {
    const response = await generatePdf(request({ templateId, generatedAt }), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain(".pdf");
    expect(await response.text()).toBe("%PDF-1.7 fixture");
    expect(convertProposalDocxToPdf).toHaveBeenCalledWith(Buffer.from(wordBytes), expect.any(AbortSignal));
    expect(mutations.mock.calls[0][2]).toMatchObject({ generated_file_path: "documentos/propostas/lead/v3.pdf", data_snapshot: { format: "pdf" } });
    expect(vi.mocked(convertProposalDocxToPdf).mock.invocationCallOrder[0]).toBeLessThan(mutations.mock.invocationCallOrder[0]);
  });

  it("falha do conversor não cria versão e retorna erro explicativo", async () => {
    vi.mocked(convertProposalDocxToPdf).mockRejectedValueOnce(new ProposalPdfError("Word local indisponível"));
    const response = await generatePdf(request({ templateId, generatedAt }), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "Word local indisponível" });
    expect(mutations).not.toHaveBeenCalled();
  });

  it("bloqueia PDF sem conversor configurado antes de tocar a persistência", async () => {
    vi.mocked(resolveProposalPdfProvider).mockImplementation(() => { throw new ProposalPdfError("Conversor não configurado"); });
    const result = await generatePropostaFile({ supabase, oportunidadeId: leadId, appUserId: "user-1", format: "pdf" });
    expect(result).toEqual({ ok: false, status: 503, error: "Conversor não configurado" });
    expect(from).not.toHaveBeenCalled();
    expect(mutations).not.toHaveBeenCalled();
  });
});
