import { beforeEach, describe, expect, it, vi } from "vitest";

import { storeGeneratedDocument } from "./generated-document-storage";
import { persistGeneratedDocumentVersion } from "./persist-generated-document-version";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

vi.mock("./generated-document-storage", () => ({
  storeGeneratedDocument: vi.fn(),
}));

const mutations: string[] = [];
const versionResult = Promise.resolve({ data: { id: "version-1" }, error: null });
const instanceResult = Promise.resolve({ data: null, error: null });
const from = vi.fn((table: string) => {
  const result = table === "document_versions" ? versionResult : instanceResult;
  const query = {
    insert: vi.fn(() => {
      mutations.push(`insert:${table}`);
      return query;
    }),
    select: vi.fn(() => query),
    single: vi.fn(() => result),
    update: vi.fn(() => {
      mutations.push(`update:${table}`);
      return query;
    }),
    eq: vi.fn(() => result),
  };
  return query;
});
const supabase = { from } as unknown as ReturnType<typeof createSupabaseAdminClient>;

const input = {
  supabase,
  instanceId: "instance-1",
  versionNumber: 2,
  dataSnapshot: {},
  filePath: "documentos/contratos/lead/v2.docx",
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  generatedBy: "user-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mutations.length = 0;
  vi.mocked(storeGeneratedDocument).mockResolvedValue();
});

describe("persistGeneratedDocumentVersion", () => {
  it("grava o arquivo antes de registrar a versão", async () => {
    vi.mocked(storeGeneratedDocument).mockImplementation(async () => {
      mutations.push("storage");
    });

    await expect(persistGeneratedDocumentVersion(input)).resolves.toEqual({
      versionId: "version-1",
    });
    expect(mutations).toEqual([
      "storage",
      "insert:document_versions",
      "update:document_instances",
    ]);
  });

  it("não registra versão quando o Storage falha", async () => {
    vi.mocked(storeGeneratedDocument).mockRejectedValue(new Error("storage indisponível"));

    await expect(persistGeneratedDocumentVersion(input)).rejects.toThrow(
      "storage indisponível",
    );
    expect(from).not.toHaveBeenCalled();
  });
});
