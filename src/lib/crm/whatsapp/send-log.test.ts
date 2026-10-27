import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { IntegrationError } from "@/lib/http/api-errors";
import { createSupabaseFake } from "@/test/supabase-fake";
import {
  claimWhatsappSend,
  findWhatsappSend,
  isTransientWhatsappError,
  withOneWhatsappRetry,
} from "./send-log";

const SEND = { oportunidadeId: "op-1", sourceId: "due-revisao-resultado:1", title: "WhatsApp: x", text: "texto" };

/** Insert devolve `insertError`; o update condicional (`.select("id")` no fim) devolve `reclaimed` linhas. */
function fakeLog(insertError: { code?: string; message: string } | null, reclaimed: number) {
  const fake = createSupabaseFake({
    tables: {
      lead_activity_events: {
        awaited: () => {
          const last = fake.calls.filter((c) => c.table === "lead_activity_events").at(-1);
          if (last?.method === "insert") return { data: null, error: insertError };
          return { data: Array.from({ length: reclaimed }, (_, i) => ({ id: `ev-${i}` })), error: null };
        },
      },
    },
  });
  return { fake, client: fake.client as unknown as SupabaseClient };
}

describe("claimWhatsappSend", () => {
  it("primeiro envio grava o registro e libera", async () => {
    const { fake, client } = fakeLog(null, 0);
    expect(await claimWhatsappSend(client, SEND)).toBe(true);
    expect(fake.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("mensagem que já saiu não sai de novo", async () => {
    const { client } = fakeLog({ code: "23505", message: "duplicate" }, 0);
    expect(await claimWhatsappSend(client, SEND)).toBe(false);
  });

  it("envio anterior que falhou volta a ser tentado (só o registro com falhou = true)", async () => {
    const { fake, client } = fakeLog({ code: "23505", message: "duplicate" }, 1);
    expect(await claimWhatsappSend(client, { ...SEND, text: "texto novo" })).toBe(true);
    const update = fake.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toMatchObject({ title: "WhatsApp: x", detail: "texto novo" });
    expect(fake.calls).toContainEqual({ table: "lead_activity_events", method: "eq", args: ["metadata->>falhou", "true"] });
  });
});

describe("findWhatsappSend", () => {
  it("diz o texto enviado e se falhou", async () => {
    const fake = createSupabaseFake({
      tables: {
        lead_activity_events: { maybeSingle: { data: { detail: "msg", metadata: { canal: "whatsapp", falhou: true } }, error: null } },
      },
    });
    expect(await findWhatsappSend(fake.client as unknown as SupabaseClient, SEND)).toEqual({ text: "msg", failed: true });
  });

  it("sem registro devolve null", async () => {
    const fake = createSupabaseFake({ tables: { lead_activity_events: { maybeSingle: { data: null, error: null } } } });
    expect(await findWhatsappSend(fake.client as unknown as SupabaseClient, SEND)).toBeNull();
  });
});

describe("withOneWhatsappRetry", () => {
  const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });

  it("erro passageiro (5xx, rede): tenta mais uma vez", async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new IntegrationError("evolution", "fora", "HTTP 503", 503))
      .mockResolvedValueOnce("ok");
    await expect(withOneWhatsappRetry(send, 0)).resolves.toBe("ok");
    expect(send).toHaveBeenCalledTimes(2);

    const network = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce("ok");
    await expect(withOneWhatsappRetry(network, 0)).resolves.toBe("ok");
  });

  it("só uma nova tentativa: a segunda falha sobe", async () => {
    const send = vi.fn().mockRejectedValue(new IntegrationError("evolution", "fora", "HTTP 502", 502));
    await expect(withOneWhatsappRetry(send, 0)).rejects.toThrow("fora");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("4xx, não configurado e tempo esgotado não repetem", async () => {
    expect(isTransientWhatsappError(new IntegrationError("evolution", "recusou", "HTTP 400", 400))).toBe(false);
    expect(isTransientWhatsappError(new IntegrationError("evolution", "não configurado", "sem URL"))).toBe(false);
    expect(isTransientWhatsappError(timeout)).toBe(false);
    const send = vi.fn().mockRejectedValue(timeout);
    await expect(withOneWhatsappRetry(send, 0)).rejects.toBe(timeout);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
