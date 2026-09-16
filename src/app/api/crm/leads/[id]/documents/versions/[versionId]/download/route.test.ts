import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuthApi } from "@/lib/auth/server";
import { generatedDocumentObjectExists } from "@/lib/crm/generated-document-storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

vi.mock("@/lib/auth/server", () => ({ requireAuthApi: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/crm/generated-document-storage", () => ({
  GENERATED_DOCUMENTS_BUCKET: "generated-documents",
  generatedDocumentObjectExists: vi.fn(),
}));

const leadId = "00000000-0000-4000-8000-000000000001";
const versionId = "00000000-0000-4000-8000-000000000002";
let instanceOpportunityId = leadId;
let versionPath: string | null = "documentos/propostas/lead/v1-proposta.docx";

function query(result: unknown) {
  const resolved = Promise.resolve({ data: result, error: null });
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(() => resolved),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

const createSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: "https://storage.example/signed" },
  error: null,
});
const supabase = {
  from: vi.fn((table: string) =>
    table === "document_versions"
      ? query({ id: versionId, instance_id: "instance-1", generated_file_path: versionPath })
      : query({ oportunidade_id: instanceOpportunityId }),
  ),
  storage: {
    from: vi.fn(() => ({ createSignedUrl })),
  },
} as unknown as ReturnType<typeof createSupabaseAdminClient>;

const context = () => ({
  params: Promise.resolve({ id: leadId, versionId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  instanceOpportunityId = leadId;
  versionPath = "documentos/propostas/lead/v1-proposta.docx";
  vi.mocked(requireAuthApi).mockResolvedValue({
    ok: true,
    profile: {
      id: "user-1",
      auth_user_id: "auth-1",
      role: "comercial",
      full_name: "Maria",
      avatar_url: null,
      area: null,
    },
  } as Awaited<ReturnType<typeof requireAuthApi>>);
  vi.mocked(createSupabaseAdminClient).mockReturnValue(supabase);
  vi.mocked(generatedDocumentObjectExists).mockResolvedValue(true);
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example/signed" },
    error: null,
  });
});

describe("download de versão documental", () => {
  it("emite URL assinada para uma versão existente do lead", async () => {
    const response = await GET(new Request("http://localhost"), context());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      signedUrl: "https://storage.example/signed",
    });
    expect(createSignedUrl).toHaveBeenCalledWith(versionPath, 120, {
      download: "v1-proposta.docx",
    });
  });

  it("não expõe versão pertencente a outro lead", async () => {
    instanceOpportunityId = "00000000-0000-4000-8000-000000000099";
    const response = await GET(new Request("http://localhost"), context());
    expect(response.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("marca arquivo histórico ausente sem emitir URL", async () => {
    vi.mocked(generatedDocumentObjectExists).mockResolvedValue(false);
    const response = await GET(new Request("http://localhost"), context());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "O arquivo desta versão não está disponível no Storage.",
    });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
