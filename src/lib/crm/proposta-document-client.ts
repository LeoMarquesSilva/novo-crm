export const PROPOSAL_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Snapshots contain other pipeline stages; only proposal fields can override a preview. */
export function selectProposalDraftValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([code]) => /^cp_[a-z0-9_]+$/.test(code)));
}

export type ProposalDraftToSave = {
  leadId: string;
  templateId: string;
  responsavel: string;
  draftValues: Record<string, string>;
  savedValues: Record<string, string>;
  definitionIds: ReadonlyMap<string, string>;
};

async function requireSuccessfulSave(response: Response, context: string): Promise<void> {
  const body: unknown = await response.json().catch(() => null);
  const result = body && typeof body === "object" ? body as { ok?: unknown; error?: unknown } : null;
  if (!response.ok || result?.ok !== true) {
    const detail = typeof result?.error === "string" ? result.error : `Resposta inválida (HTTP ${response.status}).`;
    throw new Error(`${context}: ${detail}`);
  }
}

/** Keeps the existing per-field API permissions and side effects; this is not an atomic save. */
export async function persistProposalDraft(input: ProposalDraftToSave, request: typeof fetch = fetch) {
  const snapshot = { templateId: input.templateId, responsavel: input.responsavel, draftValues: { ...input.draftValues } };
  if (!snapshot.templateId) throw new Error("Selecione um modelo antes de salvar.");
  const changes = Object.entries(snapshot.draftValues).filter(([code, value]) => value !== (input.savedValues[code] ?? ""));
  const fields = changes.map(([code, value]) => {
    const fieldDefinitionId = input.definitionIds.get(code);
    if (!fieldDefinitionId) throw new Error(`Não foi possível salvar ${code}: definição do campo ausente.`);
    return { code, value, fieldDefinitionId };
  });
  const base = `/api/crm/leads/${encodeURIComponent(input.leadId)}`;
  for (const field of fields) {
    const response = await request(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipelineField: { fieldDefinitionId: field.fieldDefinitionId, value: field.value } }),
    });
    await requireSuccessfulSave(response, `Falha ao salvar ${field.code}`);
  }
  const response = await request(`${base}/document`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId: snapshot.templateId, status: "draft", data: { responsavel: snapshot.responsavel } }),
  });
  await requireSuccessfulSave(response, "Falha ao salvar documento");
  return snapshot;
}

export async function readProposalDocxResponse(response: Response): Promise<{ blob: Blob; filename: string }> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof error === "string" ? error : `Não foi possível gerar o Word (HTTP ${response.status}).`);
  }
  if (response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== PROPOSAL_DOCX_MIME) {
    throw new Error("O servidor não retornou um documento Word válido.");
  }
  const blob = await response.blob();
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (signature.length !== 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) {
    throw new Error("O documento Word retornado está vazio ou inválido.");
  }
  const disposition = response.headers.get("Content-Disposition");
  const filename = disposition?.match(/filename="([^"\r\n]+)"/)?.[1] ?? "Proposta.docx";
  return { blob, filename: filename.replace(/[\\/]/g, "_") };
}

export async function readProposalPdfResponse(response: Response): Promise<{ blob: Blob; filename: string }> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body ? body.error : null;
    throw new Error(typeof error === "string" ? error : `Não foi possível gerar o PDF (HTTP ${response.status}).`);
  }
  if (response.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") {
    throw new Error("O servidor não retornou um PDF válido.");
  }
  const blob = await response.blob();
  if (await blob.slice(0, 5).text() !== "%PDF-") {
    throw new Error("O PDF retornado está vazio ou inválido.");
  }
  const filename = response.headers.get("Content-Disposition")?.match(/filename="([^"\r\n]+)"/)?.[1] ?? "Proposta.pdf";
  return { blob, filename: filename.replace(/[\\/]/g, "_") };
}

export type ProposalPdfPreviewState = {
  url: string | null;
  sourceSha256: string | null;
  updating: boolean;
  error: string | null;
};

/** Debounces draft conversion and keeps the latest successful PDF through errors or slow updates. */
export function createProposalPdfPreviewController(options: {
  onState: (state: ProposalPdfPreviewState) => void;
  request?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}) {
  const request = options.request ?? fetch;
  const createUrl = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  let state: ProposalPdfPreviewState = { url: null, sourceSha256: null, updating: false, error: null };
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;

  function cancelPending() {
    generation += 1;
    clearTimeout(timer);
    abortController?.abort();
  }

  return {
    schedule(endpoint: string, payload: Record<string, unknown>) {
      cancelPending();
      const token = generation;
      const body = JSON.stringify({ ...payload, format: "pdf" });
      const controller = new AbortController();
      abortController = controller;
      state = { ...state, updating: true, error: null };
      options.onState(state);
      timer = setTimeout(async () => {
        try {
          const response = await request(endpoint, {
            method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal,
          });
          const { blob } = await readProposalPdfResponse(response);
          if (token !== generation || controller.signal.aborted) return;
          const previousUrl = state.url;
          state = {
            url: createUrl(blob), sourceSha256: response.headers.get("X-Document-SHA256"), updating: false, error: null,
          };
          options.onState(state);
          if (previousUrl) revokeUrl(previousUrl);
        } catch (error) {
          if (token !== generation || controller.signal.aborted) return;
          state = { ...state, updating: false, error: error instanceof Error ? error.message : "Falha ao atualizar a prévia." };
          options.onState(state);
        }
      }, 600);
    },
    cancelPending,
    dispose() {
      cancelPending();
      if (state.url) revokeUrl(state.url);
      state = { url: null, sourceSha256: null, updating: false, error: null };
    },
  };
}
