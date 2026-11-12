import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationError, publicErrorMessage } from "@/lib/http/api-errors";
import {
  DEFAULT_EVOLUTION_INSTANCE,
  EvolutionWhatsappConnector,
  describeWhatsappError,
  evolutionConfigFromEnv,
} from "./evolution-whatsapp";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("EvolutionWhatsappConnector", () => {
  it("falha da API não leva o corpo da resposta para a mensagem pública", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"apikey":"segredo-vazado"}', { status: 500 })));
    const connector = new EvolutionWhatsappConnector("https://evo.example", "key", "BP");
    const error = await connector.sendText({ destination: "x", text: "oi" }).catch((e) => e);
    expect(error).toBeInstanceOf(IntegrationError);
    expect(publicErrorMessage(error, "x")).not.toContain("segredo-vazado");
    expect((error as IntegrationError).detail).toContain("segredo-vazado");
  });

  it("WHATSAPP_REDIRECT_TO manda tudo para o número de teste, com o destino original no texto", async () => {
    vi.stubEnv("WHATSAPP_REDIRECT_TO", "5535988754584");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const connector = new EvolutionWhatsappConnector("https://evo.example", "key", "BP");
    await connector.sendText({ destination: "120363000000000000@g.us", text: "Nova DUE" });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.number).toBe("5535988754584");
    expect(body.text).toBe("[TESTE · destino original: 120363000000000000@g.us]\nNova DUE");
  });

  it("sem configuração: mensagem pública não cita variável de ambiente", async () => {
    const connector = new EvolutionWhatsappConnector("", "", "");
    const error = await connector.sendText({ destination: "x", text: "oi" }).catch((e) => e);
    expect(publicErrorMessage(error, "x")).not.toContain("EVOLUTION_");
  });
});

describe("configuração da Evolution", () => {
  it("sem EVOLUTION_INSTANCE usa a instância do escritório, não \"BP\" (que não existe)", () => {
    vi.stubEnv("EVOLUTION_INSTANCE", "");
    vi.stubEnv("EVOLUTION_INSTANCE_NAME", "");
    expect(evolutionConfigFromEnv().instance).toBe(DEFAULT_EVOLUTION_INSTANCE);
    expect(DEFAULT_EVOLUTION_INSTANCE).toBe("COMERCIAL BP");
  });

  it("a variável continua valendo", () => {
    vi.stubEnv("EVOLUTION_INSTANCE", "OUTRA");
    expect(evolutionConfigFromEnv().instance).toBe("OUTRA");
  });

  it("o motivo da falha leva só a mensagem da Evolution, não o corpo inteiro", () => {
    const error = new IntegrationError(
      "evolution",
      "Evolution API recusou o envio do WhatsApp (HTTP 404).",
      JSON.stringify({ status: 404, apikey: "segredo-vazado", response: { message: [`The "BP" instance does not exist`] } }),
      404,
    );
    const motivo = describeWhatsappError(error);
    expect(motivo).toContain(`The "BP" instance does not exist`);
    expect(motivo).not.toContain("segredo-vazado");
  });
});
