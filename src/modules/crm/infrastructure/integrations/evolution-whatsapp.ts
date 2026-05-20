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

export class EvolutionWhatsappConnector {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instance: string,
  ) {}

  private assertConfig() {
    if (!this.baseUrl) {
      throw new Error("EVOLUTION_API_URL não configurado.");
    }

    if (!this.apiKey) {
      throw new Error("EVOLUTION_API_KEY não configurado.");
    }

    if (!this.instance) {
      throw new Error("EVOLUTION_INSTANCE não configurado.");
    }
  }

  private get instanceBaseUrl() {
    return this.baseUrl.replace(/\/$/, "");
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    this.assertConfig();
    const response = await fetch(`${this.instanceBaseUrl}${path}`, {
      ...init,
      headers: {
        apikey: this.apiKey,
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Falha ao consultar Evolution API: ${raw}`);
    }
    return (await response.json()) as T;
  }

  async sendText({ destination, text }: SendTextInput) {
    this.assertConfig();
    const response = await fetch(
      `${this.instanceBaseUrl}/message/sendText/${this.instance}`,
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
      const raw = await response.text();
      throw new Error(`Falha ao enviar WhatsApp pela Evolution API: ${raw}`);
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
