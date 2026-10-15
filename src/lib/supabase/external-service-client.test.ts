import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { createExternalServiceClient } from "./external-service-client";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => ({})) }));

describe("createExternalServiceClient", () => {
  it("usa fetch com prazo e sem sessão", async () => {
    createExternalServiceClient("https://x.supabase.co", "key", { timeoutMs: 20 });
    const options = vi.mocked(createClient).mock.calls[0]?.[2] as {
      auth: { persistSession: boolean };
      global: { fetch: typeof fetch };
    };
    expect(options.auth.persistSession).toBe(false);

    const neverResolves = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal("fetch", neverResolves);
    await expect(options.global.fetch("https://x.supabase.co/rest/v1/t")).rejects.toBeDefined();
    vi.unstubAllGlobals();
  });
});
