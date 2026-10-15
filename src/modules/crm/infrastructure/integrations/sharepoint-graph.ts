import { IntegrationError } from "@/lib/http/api-errors";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";

const SHAREPOINT_NOT_CONFIGURED = "SharePoint não configurado no servidor.";

function notConfigured(detail: string): IntegrationError {
  return new IntegrationError("sharepoint", SHAREPOINT_NOT_CONFIGURED, detail);
}

export interface SharePointGraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  /** Identificador composto do site no Graph, ex.: `host.sharepoint.com,{siteCollectionId},{siteId}` */
  siteId: string;
  /** GUID da lista (mesmo valor usado no N8N / SharePoint) */
  listId: string;
}

type GraphListItemFields = Record<string, string | number | boolean | null>;

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

export class SharePointGraphClient {
  constructor(private readonly config: SharePointGraphConfig) {}

  static fromEnv(): SharePointGraphClient {
    const tenantId = process.env.MICROSOFT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;
    const clientId = process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID;
    const clientSecret =
      process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET;
    const siteId = process.env.SHAREPOINT_SITE_ID;
    const listId = process.env.SHAREPOINT_AGENDAMENTOS_LIST_ID;

    if (!tenantId?.trim()) {
      throw notConfigured("Defina MICROSOFT_TENANT_ID (ou AZURE_AD_TENANT_ID).");
    }
    if (!clientId?.trim()) {
      throw notConfigured("Defina SHAREPOINT_CLIENT_ID (ou MICROSOFT_CLIENT_ID).");
    }
    if (!clientSecret?.trim()) {
      throw notConfigured("Defina SHAREPOINT_CLIENT_SECRET (ou MICROSOFT_CLIENT_SECRET).");
    }
    if (!siteId?.trim()) {
      throw notConfigured("Defina SHAREPOINT_SITE_ID (formato host,guid,guid do site no Graph).");
    }
    if (!listId?.trim()) {
      throw notConfigured("Defina SHAREPOINT_AGENDAMENTOS_LIST_ID (GUID da lista).");
    }

    return new SharePointGraphClient({
      tenantId: tenantId.trim(),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      siteId: siteId.trim(),
      listId: listId.trim(),
    });
  }

  private async getAppAccessToken(): Promise<string> {
    const url = `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const json = (await res.json()) as TokenResponse;
    if (!res.ok) {
      const msg = json.error_description ?? json.error ?? res.statusText;
      throw new IntegrationError(
        "sharepoint",
        `Falha ao autenticar no Microsoft Graph (HTTP ${res.status}).`,
        msg,
        res.status,
      );
    }
    if (!json.access_token) {
      throw new IntegrationError("sharepoint", "Falha ao autenticar no Microsoft Graph.", "sem access_token");
    }
    return json.access_token;
  }

  /**
   * Cria um item na lista. Use os nomes internos das colunas (como no N8N), ex.: PROCESSO, DATA_x002d_ENVIAR.
   * Datas: string ISO (yyyy-MM-dd ou completa); opções e textos: string.
   */
  async createListItem(fields: GraphListItemFields): Promise<{ id: string; webUrl?: string }> {
    const token = await this.getAppAccessToken();
    const pathSite = encodeURI(this.config.siteId);
    const pathList = encodeURIComponent(this.config.listId);
    const url = `https://graph.microsoft.com/v1.0/sites/${pathSite}/lists/${pathList}/items`;

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new IntegrationError(
        "sharepoint",
        `SharePoint respondeu de forma inválida (HTTP ${res.status}).`,
        text.slice(0, 400),
        res.status,
      );
    }

    if (!res.ok) {
      const err =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: { message?: string } }).error?.message === "string"
          ? (body as { error: { message: string } }).error.message
          : text.slice(0, 400);
      throw new IntegrationError("sharepoint", `SharePoint respondeu HTTP ${res.status}.`, err, res.status);
    }

    const o = body as { id?: string; webUrl?: string };
    if (!o.id) {
      throw new IntegrationError("sharepoint", "SharePoint não devolveu o item criado.", text.slice(0, 400));
    }
    return { id: o.id, webUrl: o.webUrl };
  }
}
