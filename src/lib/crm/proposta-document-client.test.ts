import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProposalPdfPreviewController, persistProposalDraft, PROPOSAL_DOCX_MIME, readProposalDocxResponse, readProposalPdfResponse, selectProposalDraftValues, type ProposalPdfPreviewState } from "./proposta-document-client";

const success = () => Response.json({ ok: true });
const draft = () => ({
  leadId: "lead-1", templateId: "template-1", responsavel: "Maria Silva",
  draftValues: { cp_cliente_cidade: "Curitiba", cp_cliente_uf: "PR" },
  savedValues: { cp_cliente_cidade: "São Paulo", cp_cliente_uf: "SP" },
  definitionIds: new Map([["cp_cliente_cidade", "cidade-id"], ["cp_cliente_uf", "uf-id"]]),
});

it("envia só campos cp_ ao preview, preservando campos vazios e o snapshot original", () => {
  const values = { nome_focal: "Outra etapa", cp_cliente_cidade: "", cp_escopo_detalhe_json: "{}", EMPRESA: "não é override permitido" };
  expect(selectProposalDraftValues(values)).toEqual({ cp_cliente_cidade: "", cp_escopo_detalhe_json: "{}" });
  expect(values.nome_focal).toBe("Outra etapa");
});

describe("persistProposalDraft", () => {
  it("preserva os endpoints por campo e só confirma após salvar todos os campos e o responsável", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => success());
    const result = await persistProposalDraft(draft(), request);
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "/api/crm/leads/lead-1", "/api/crm/leads/lead-1", "/api/crm/leads/lead-1/document",
    ]);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({ pipelineField: { fieldDefinitionId: "cidade-id", value: "Curitiba" } });
    expect(JSON.parse(String(request.mock.calls[2][1]?.body))).toEqual({ templateId: "template-1", status: "draft", data: { responsavel: "Maria Silva" } });
    expect(result.draftValues).toEqual(draft().draftValues);
  });

  it.each([
    () => Response.json({ ok: false, error: "Área não autorizada" }, { status: 403 }),
    () => Response.json({ ok: false, error: "Falha na persistência" }),
    () => new Response("<html>Gateway</html>", { status: 502 }),
    () => Response.json({}),
  ])("propaga falhas HTTP, de negócio ou de formato e não libera a geração", async (failure) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(success()).mockResolvedValueOnce(failure());
    const generate = vi.fn();
    const input = draft();
    await expect(persistProposalDraft(input, request).then(generate)).rejects.toThrow("cp_cliente_uf");
    expect(generate).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(2);
    expect(input.savedValues).toEqual({ cp_cliente_cidade: "São Paulo", cp_cliente_uf: "SP" });
  });

  it("propaga falha no documento mesmo quando os campos já foram persistidos", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(success()).mockResolvedValueOnce(success())
      .mockResolvedValueOnce(Response.json({ ok: false, error: "Falha no documento" }));
    await expect(persistProposalDraft(draft(), request)).rejects.toThrow("Falha no documento");
  });

  it("detecta definição ausente antes da primeira escrita", async () => {
    const request = vi.fn<typeof fetch>();
    const input = draft();
    input.definitionIds.delete("cp_cliente_uf");
    await expect(persistProposalDraft(input, request)).rejects.toThrow("definição do campo ausente");
    expect(request).not.toHaveBeenCalled();
  });

  it("congela valores antes do primeiro await para não confirmar edições feitas durante a requisição", async () => {
    const input = draft();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => {
      input.draftValues.cp_cliente_uf = "SC";
      return success();
    });
    const saved = await persistProposalDraft(input, request);
    expect(saved.draftValues.cp_cliente_uf).toBe("PR");
    expect(JSON.parse(String(request.mock.calls[1][1]?.body)).pipelineField.value).toBe("PR");
    expect(input.draftValues.cp_cliente_uf).toBe("SC");
  });
});

describe("readProposalDocxResponse", () => {
  it("aceita bytes DOCX e o nome fornecido pelo servidor", async () => {
    const { blob, filename } = await readProposalDocxResponse(new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1]), {
      headers: { "Content-Type": PROPOSAL_DOCX_MIME, "Content-Disposition": 'attachment; filename="Prévia.docx"' },
    }));
    expect(blob.size).toBe(5);
    expect(filename).toBe("Prévia.docx");
  });
  it("rejeita JSON com HTTP 200 para evitar baixar erro como .docx", async () => {
    await expect(readProposalDocxResponse(Response.json({ ok: false }))).rejects.toThrow("Word válido");
  });
  it.each(["", "error"])('rejeita DOCX vazio ou sem assinatura ZIP: "%s"', async (body) => {
    await expect(readProposalDocxResponse(new Response(body, { headers: { "Content-Type": PROPOSAL_DOCX_MIME } })))
      .rejects.toThrow("vazio ou inválido");
  });
  it("expõe a mensagem de falha do servidor", async () => {
    await expect(readProposalDocxResponse(Response.json({ error: "Campos pendentes" }, { status: 422 })))
      .rejects.toThrow("Campos pendentes");
  });
});

const pdfResponse = (body = "%PDF-1.7\nfixture", hash = "docx-source-sha") => new Response(body, {
  headers: { "Content-Type": "application/pdf", "X-Document-SHA256": hash, "Content-Disposition": 'attachment; filename="Proposta.pdf"' },
});

describe("readProposalPdfResponse", () => {
  it("valida a assinatura PDF e preserva o nome do arquivo", async () => {
    const result = await readProposalPdfResponse(pdfResponse());
    expect(await result.blob.text()).toBe("%PDF-1.7\nfixture");
    expect(result.filename).toBe("Proposta.pdf");
  });
  it.each(["", "{\"ok\":false}", "PK\u0003\u0004"])("rejeita respostas sem assinatura PDF: %s", async (body) => {
    await expect(readProposalPdfResponse(pdfResponse(body))).rejects.toThrow("vazio ou inválido");
  });
  it("rejeita Content-Type incorreto mesmo com bytes PDF", async () => {
    await expect(readProposalPdfResponse(new Response("%PDF-1.7", { headers: { "Content-Type": "application/json" } })))
      .rejects.toThrow("PDF válido");
  });
  it("preserva a mensagem detalhada de erro de conversão", async () => {
    await expect(readProposalPdfResponse(Response.json({ ok: false, error: "Word não concluiu a conversão: timeout." }, { status: 503 })))
      .rejects.toThrow("Word não concluiu a conversão: timeout.");
  });
});

describe("automatic PDF preview", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(request = vi.fn<typeof fetch>().mockImplementation(async () => pdfResponse())) {
    const onState = vi.fn<(state: ProposalPdfPreviewState) => void>();
    const createObjectURL = vi.fn<(blob: Blob) => string>().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.fn<(url: string) => void>();
    const controller = createProposalPdfPreviewController({ onState, request, createObjectURL, revokeObjectURL });
    return { controller, request, onState, createObjectURL, revokeObjectURL };
  }

  it("aguarda 600 ms e envia apenas o último draft capturado", async () => {
    const { controller, request, onState } = setup();
    controller.schedule("/preview", { draftValues: { cp_cliente_cidade: "Antiga" } });
    await vi.advanceTimersByTimeAsync(300);
    const values = { cp_cliente_cidade: "Atual" };
    controller.schedule("/preview", { draftValues: values, responsavel: "Maria", generatedAt: "2026-09-02T16:00:00Z" });
    values.cp_cliente_cidade = "Editada depois";
    await vi.advanceTimersByTimeAsync(599);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(request.mock.calls[0][1]?.body))).toEqual({
      format: "pdf", draftValues: { cp_cliente_cidade: "Atual" }, responsavel: "Maria", generatedAt: "2026-09-02T16:00:00Z",
    });
    expect(onState).toHaveBeenLastCalledWith({ url: "blob:first", sourceSha256: "docx-source-sha", updating: false, error: null });
    controller.dispose();
  });

  it("aborta a requisição anterior e descarta resposta antiga mesmo quando o fetch ignora o aborto", async () => {
    let resolveOld!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(pdfResponse("%PDF-1.7\nnew", "new-source"));
    const { controller, onState, createObjectURL } = setup(request);
    controller.schedule("/preview", { draftValues: { cp_cliente_cidade: "Antiga" } });
    await vi.advanceTimersByTimeAsync(600);
    const oldSignal = request.mock.calls[0][1]?.signal;
    controller.schedule("/preview", { draftValues: { cp_cliente_cidade: "Atual" } });
    expect(oldSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    resolveOld(pdfResponse("%PDF-1.7\nold", "old-source"));
    await vi.advanceTimersByTimeAsync(0);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenLastCalledWith({ url: "blob:first", sourceSha256: "new-source", updating: false, error: null });
    controller.dispose();
  });

  it("mantém o PDF durante atualização e falha; retry substitui e revoga o anterior", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(pdfResponse())
      .mockResolvedValueOnce(Response.json({ ok: false, error: "Conversor ocupado" }, { status: 503 }))
      .mockResolvedValueOnce(pdfResponse("%PDF-1.7\nretry", "retry-source"));
    const { controller, onState, revokeObjectURL } = setup(request);
    controller.schedule("/preview", {});
    await vi.advanceTimersByTimeAsync(600);
    controller.schedule("/preview", { draftValues: { cp_cliente_cidade: "Atual" } });
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ url: "blob:first", updating: true }));
    await vi.advanceTimersByTimeAsync(600);
    expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ url: "blob:first", updating: false, error: "Conversor ocupado" }));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    controller.schedule("/preview", { draftValues: { cp_cliente_cidade: "Atual" } });
    await vi.advanceTimersByTimeAsync(600);
    expect(onState).toHaveBeenLastCalledWith({ url: "blob:second", sourceSha256: "retry-source", updating: false, error: null });
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:first");
    controller.dispose();
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:second");
  });

  it("cancela timer e resposta pendente no unmount, sem criar URLs após dispose", async () => {
    const beforeRequest = setup();
    beforeRequest.controller.schedule("/preview", {});
    beforeRequest.controller.dispose();
    await vi.advanceTimersByTimeAsync(600);
    expect(beforeRequest.request).not.toHaveBeenCalled();

    let resolvePending!: (response: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((resolve) => { resolvePending = resolve; }));
    const active = setup(request);
    active.controller.schedule("/preview", {});
    await vi.advanceTimersByTimeAsync(600);
    active.controller.dispose();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
    resolvePending(pdfResponse());
    await vi.advanceTimersByTimeAsync(0);
    expect(active.createObjectURL).not.toHaveBeenCalled();
  });
});
