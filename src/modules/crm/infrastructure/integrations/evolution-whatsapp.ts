import { IntegrationError } from "@/lib/http/api-errors";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

const NOT_CONFIGURED = "WhatsApp não configurado no servidor.";

interface SendTextInput {
  destination: string;
  text: string;
}

interface EvolutionApiResponse {
  key?: string;
  message?: string;
}

interface EvolutionContact {
  id?: string;
  pushName?: string;
  name?: string;
  verifiedName?: string;
}

interface EvolutionGroup {
  id?: string;
  subject?: string;
  name?: string;
}

function stringifyJsonAscii(value: unknown): string {
  return JSON.stringify(value).replace(/[^\x20-\x7E]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Ambiente de teste: com `WHATSAPP_REDIRECT_TO` todo envio vai só para esse número, com o destino
 * original no começo do texto, para um teste não mandar mensagem aos grupos e colegas reais.
 */
export function applyWhatsappRedirect(destination: string, text: string): SendTextInput {
  const redirect = process.env.WHATSAPP_REDIRECT_TO?.trim();
  if (!redirect) return { destination, text };
  return { destination: redirect, text: `[TESTE · destino original: ${destination}]\n${text}` };
}

export class EvolutionWhatsappConnector {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instance: string,
  ) {}

  private assertConfig() {
    if (!this.baseUrl) {
      throw new IntegrationError("evolution", NOT_CONFIGURED, "EVOLUTION_API_URL não configurado.");
    }

    if (!this.apiKey) {
      throw new IntegrationError("evolution", NOT_CONFIGURED, "EVOLUTION_API_KEY não configurado.");
    }

    if (!this.instance) {
      throw new IntegrationError("evolution", NOT_CONFIGURED, "EVOLUTION_INSTANCE não configurado.");
    }
  }

  private get instanceBaseUrl() {
    return this.baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    this.assertConfig();
    const response = await fetchWithTimeout(`${this.instanceBaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new IntegrationError(
        "evolution",
        `Evolution API recusou a consulta (HTTP ${response.status}).`,
        raw.slice(0, 500),
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  async sendText(input: SendTextInput) {
    this.assertConfig();
    const { destination, text } = applyWhatsappRedirect(input.destination, input.text);
    const response = await fetchWithTimeout(
      `${this.instanceBaseUrl}/message/sendText/${encodeURIComponent(this.instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          apikey: this.apiKey,
        },
        body: stringifyJsonAscii({
          number: destination,
          text,
        }),
      },
    );

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new IntegrationError(
        "evolution",
        `Evolution API recusou o envio do WhatsApp (HTTP ${response.status}).`,
        raw.slice(0, 500),
        response.status,
      );
    }

    const data = (await response.json()) as EvolutionApiResponse;
    return data;
  }

  async listContacts() {
    return this.request<EvolutionContact[] | { contacts?: EvolutionContact[] }>(
      `/chat/findContacts/${encodeURIComponent(this.instance)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: stringifyJsonAscii({ where: {} }),
      },
    );
  }

  async listGroups() {
    return this.request<EvolutionGroup[] | { groups?: EvolutionGroup[] }>(
      `/group/fetchAllGroups/${encodeURIComponent(this.instance)}?getParticipants=false`,
      { method: "GET" },
    );
  }
}
