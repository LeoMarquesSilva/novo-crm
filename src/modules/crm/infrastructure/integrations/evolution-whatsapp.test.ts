import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationError, publicErrorMessage } from "@/lib/http/api-errors";
import { EvolutionWhatsappConnector } from "./evolution-whatsapp";

afterEach(() => vi.unstubAllGlobals());

describe("EvolutionWhatsappConnector", () => {
  it("falha da API não leva o corpo da resposta para a mensagem pública", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"apikey":"segredo-vazado"}', { status: 500 })));
    const connector = new EvolutionWhatsappConnector("https://evo.example", "key", "BP");
    const error = await connector.sendText({ destination: "x", text: "oi" }).catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(publicErrorMessage(error, "x")).not.toContain("segredo-vazado");
    expect((error as IntegrationError).detail).toContain("segredo-vazado");
  });

  it("sem configuração: mensagem pública não cita variável de ambiente", async () => {
    const connector = new EvolutionWhatsappConnector("", "", "");
    const error = await connector.sendText({ destination: "x", text: "oi" }).catch((e) => e);
    expect(publicErrorMessage(error, "x")).not.toContain("EVOLUTION_");
  });
});
