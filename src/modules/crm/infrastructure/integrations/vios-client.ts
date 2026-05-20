export interface ViosClientRecord {
  externalId: string;
  razaoSocial: string;
  documento: string;
}

export class ViosClientConnector {
  constructor(private readonly apiKey: string) {}

  async searchClientByDocument(document: string): Promise<ViosClientRecord | null> {
    if (!this.apiKey) {
      throw new Error("VIOS API key não configurada.");
    }

    // Stub inicial para onda 1.
    if (!document) return null;

    return {
      externalId: "vios_001",
      razaoSocial: "Cliente vindo da base VIOS",
      documento: document,
    };
  }
}
