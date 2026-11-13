import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationError } from "@/lib/http/api-errors";
import type { ViosAberturaPedido } from "@/modules/crm/application/services/build-vios-abertura-payload";
import { SamaRpaClient } from "./sama-rpa-client";

const pedido = { chave_idempotencia: "crm:abertura_due:x1234567" } as ViosAberturaPedido;
const URL_SAMA = "https://sama.exemplo.supabase.co/functions/v1/enfileirar-abertura";

afterEach(() => vi.unstubAllGlobals());

function respondeCom(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SamaRpaClient", () => {
  it("sem URL ou segredo não monta o cliente", () => {
    expect(() => SamaRpaClient.fromEnv({ CRM_SAMA_SECRET: "s" })).toThrow(IntegrationError);
    expect(() => SamaRpaClient.fromEnv({ SAMA_RPA_ENQUEUE_URL: URL_SAMA })).toThrow(
      "Abertura no VIOS não configurada.",
    );
  });

  it("manda o pedido com o segredo no Bearer; 201 é pedido novo", async () => {
    const fetchMock = respondeCom(201, { ok: true });
    const cliente = SamaRpaClient.fromEnv({
      SAMA_RPA_ENQUEUE_URL: URL_SAMA,
      CRM_SAMA_SECRET: "segredo-de-teste",
    });

    await expect(cliente.enfileirar(pedido)).resolves.toEqual({ duplicado: false });
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(URL_SAMA);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer segredo-de-teste");
    expect(JSON.parse(String(init.body))).toEqual(pedido);
  });

  it("200 é a mesma chave já recebida", async () => {
    respondeCom(200, { ok: true, duplicado: true });
    await expect(new SamaRpaClient(URL_SAMA, "s").enfileirar(pedido)).resolves.toEqual({ duplicado: true });
  });

  it("recusa vira IntegrationError com o status; o detalhe não vai para a mensagem pública", async () => {
    respondeCom(400, { ok: false, erro: "cliente.cpf_cnpj inválido para PF." });
    const erro = await new SamaRpaClient(URL_SAMA, "s").enfileirar(pedido).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(IntegrationError);
    expect((erro as IntegrationError).httpStatus).toBe(400);
    expect((erro as IntegrationError).publicMessage).toBe("O robô do VIOS recusou o pedido de abertura.");
    expect((erro as IntegrationError).detail).toContain("cpf_cnpj inválido");
  });

  it("falha de rede vira IntegrationError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    await expect(new SamaRpaClient(URL_SAMA, "s").enfileirar(pedido)).rejects.toThrow("Robô do VIOS não respondeu.");
  });
});
