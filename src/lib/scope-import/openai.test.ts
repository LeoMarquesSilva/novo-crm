import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";

import { IntegrationError } from "@/lib/http/api-errors";
import { callStructured, resetOpenAIClientForTests, setOpenAIClientForTests } from "./openai";

function fakeClient(create: ReturnType<typeof vi.fn>) {
  return { responses: { create } } as unknown as OpenAI;
}

afterEach(() => resetOpenAIClientForTests());

const call = () =>
  callStructured("m", "sys", "user", {}, "schema", 100, (raw) => raw as { ok: boolean }, undefined, {
    timeoutMs: 1234,
  });

describe("callStructured", () => {
  it("passa prazo e tentativas por requisição", async () => {
    const create = vi.fn().mockResolvedValue({ output_text: '{"ok":true}', model: "m", usage: null });
    setOpenAIClientForTests(fakeClient(create));
    await expect(call()).resolves.toMatchObject({ data: { ok: true } });
    expect(create.mock.calls[0]?.[1]).toEqual({ timeout: 1234, maxRetries: 1 });
  });

  it("repete uma vez quando a resposta vem sem JSON", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ output_text: "nao é json", model: "m" })
      .mockResolvedValueOnce({ output_text: '{"ok":true}', model: "m" });
    setOpenAIClientForTests(fakeClient(create));
    await expect(call()).resolves.toMatchObject({ data: { ok: true } });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("erro de rede/HTTP não é repetido à mão e vira mensagem segura", async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.APIConnectionTimeoutError({ message: "timeout" }));
    setOpenAIClientForTests(fakeClient(create));
    const error = await call().catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect((error as IntegrationError).publicMessage).toContain("não respondeu a tempo");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
