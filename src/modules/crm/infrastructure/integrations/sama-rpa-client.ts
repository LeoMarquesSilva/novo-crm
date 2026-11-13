import { IntegrationError } from "@/lib/http/api-errors";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import type { ViosAberturaPedido } from "@/modules/crm/application/services/build-vios-abertura-payload";

const TIMEOUT_MS = 10_000;

export type SamaRpaEnfileirado = {
  /** O SAMA já tinha esse pedido (mesma chave): nada novo foi para a fila. */
  duplicado: boolean;
};

/**
 * Entrada do robô do SAMA no VIOS: Edge Function `enfileirar-abertura` (projeto Supabase do SAMA),
 * protegida por um segredo só dela (`CRM_SAMA_SECRET`). O CRM não conhece o banco do SAMA.
 * 201 = pedido novo na fila; 200 = mesma chave já recebida (idempotente).
 */
export class SamaRpaClient {
  constructor(
    private readonly url: string,
    private readonly secret: string,
  ) {}

  static fromEnv(env: Record<string, string | undefined> = process.env): SamaRpaClient {
    const url = env.SAMA_RPA_ENQUEUE_URL?.trim();
    const secret = env.CRM_SAMA_SECRET?.trim();
    if (!url || !secret) {
      throw new IntegrationError(
        "vios_rpa",
        "Abertura no VIOS não configurada.",
        "SAMA_RPA_ENQUEUE_URL ou CRM_SAMA_SECRET ausente.",
      );
    }
    return new SamaRpaClient(url, secret);
  }

  async enfileirar(pedido: ViosAberturaPedido): Promise<SamaRpaEnfileirado> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.url,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(pedido),
        },
        TIMEOUT_MS,
      );
    } catch (error) {
      throw new IntegrationError(
        "vios_rpa",
        "Robô do VIOS não respondeu.",
        error instanceof Error ? error.message : String(error),
      );
    }

    const texto = await res.text().catch(() => "");
    if (res.status !== 200 && res.status !== 201) {
      throw new IntegrationError(
        "vios_rpa",
        "O robô do VIOS recusou o pedido de abertura.",
        texto.slice(0, 500),
        res.status,
      );
    }
    return { duplicado: res.status === 200 };
  }
}
