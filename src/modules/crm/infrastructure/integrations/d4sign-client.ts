import type { D4SignEnv } from "@/lib/d4sign/env";
import { logD4SignApiCall } from "@/lib/d4sign/api-usage";
import {
  resolvePinsToLastPage,
  SIGNATURE_PAGE_LAST,
  type ContratoSignaturePin,
} from "@/lib/crm/contrato-signature-pins";

// ─── Tipos de resposta D4Sign ──────────────────────────────────────────────

export interface D4SignDocumentSummary {
  // D4Sign retorna estes campos em snake_case OU camelCase dependendo do endpoint
  uuid_doc?: string;
  uuidDoc?: string;
  /** Nome do arquivo no cofre */
  name_document?: string;
  nameDocument?: string;
  /**
   * statusId: 1=Processando, 2=Aguardando Signatários,
   * 3=Em Assinatura, 4=Finalizado, 5=Cancelado
   */
  statusId?: number | string;
  status_id?: number | string;
  statusName?: string;
  status_name?: string;
  /** Texto adicional ao status (ex.: motivo de cancelamento). */
  statusComment?: string;
  /** Data de criação (string livre vinda da API) */
  created_at?: string;
  createdAt?: string;
  /** Data de finalização */
  finalized_at?: string;
  finalizedAt?: string;
  /** Mime type do arquivo. */
  type?: string;
  mimeType?: string;
  /** Tamanho em bytes (string ou número). */
  size?: string | number;
  /** Quantidade de páginas. */
  pages?: string | number;
  /** UUID/nome do cofre (presente na listagem em alguns retornos). */
  uuidSafe?: string;
  uuid_safe?: string;
  safeName?: string;
  safe_name?: string;
  /** Quem cancelou (objeto JSON livre). */
  whoCanceled?: unknown;
  who_canceled?: unknown;
  /** UUID da pasta (presente na listagem geral). */
  uuidFolder?: string;
  uuid_folder?: string;
}

export interface D4SignSafeInfo {
  uuid_safe?: string;
  uuidSafe?: string;
  name_safe?: string;
  nameSafe?: string;
  total_doc?: number;
}

/** Pasta dentro de um cofre (D4Sign organiza por safe → folder). */
export interface D4SignFolderInfo {
  uuid_folder: string;
  name: string;
  /** UUID da pasta-pai (se houver árvore). */
  parent_uuid?: string | null;
}

/**
 * Normaliza um documento bruto da API para campos canônicos snake_case.
 *
 * CONFIRMADO pela documentação oficial D4Sign (https://docapi.d4sign.com.br/reference/listar-todos-os-documentos-de-um-cofre-ou-pasta):
 * a listagem retorna campos camelCase como: `uuidDoc`, `nameDoc`, `type`, `size`,
 * `pages`, `uuidSafe`, `safeName`, `statusId`, `statusName`, `statusComment`, `whoCanceled`.
 * O endpoint de detalhes (GET /documents/{uuid}) usa snake_case (name_document, etc.).
 */
function normalizeDocSummary(raw: Record<string, unknown>): D4SignDocumentSummary {
  const pickStr = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim().length > 0) return v;
    }
    return undefined;
  };
  return {
    // Listagem usa `uuidDoc`; endpoint de detalhes usa `uuid_doc`. Manter ambos + kebab-case.
    uuid_doc: pickStr("uuidDoc", "uuid_doc", "uuid-doc", "uuid") ?? "",
    // Listagem usa `nameDoc`; detalhes usa `name_document`. AMBOS são oficiais.
    // Adicionei `name-doc` (kebab) por consistência com `name-safe`.
    name_document: pickStr(
      "nameDoc",          // ← listagem oficial D4Sign
      "name-doc",         // ← kebab-case (defensivo)
      "name_document",    // ← detalhes oficial D4Sign
      "nameDocument",
      "name",
      "nome",
      "subject",
      "assunto",
      "title",
      "titulo",
      "filename",
      "file_name",
      "fileName",
      "original_filename",
      "originalFileName",
      "documento",
    ),
    uuidFolder: pickStr("uuidFolder", "uuid_folder", "uuid-folder"),
    statusId: (raw.statusId ?? raw.status_id ?? null) as number | string | undefined,
    statusName: pickStr("statusName", "status_name"),
    statusComment: pickStr("statusComment", "status_comment"),
    created_at: pickStr("created_at", "createdAt", "uploaded_at", "uploadedAt"),
    finalized_at: pickStr("finalized_at", "finalizedAt"),
    type: pickStr("type", "mimeType", "mime_type"),
    size: (raw.size ?? raw.size_original ?? raw.sizeOriginal ?? undefined) as
      | string
      | number
      | undefined,
    pages: (raw.pages ?? raw.totalPages ?? raw.total_pages ?? undefined) as
      | string
      | number
      | undefined,
    uuidSafe: pickStr("uuidSafe", "uuid_safe"),
    safeName: pickStr("safeName", "safe_name"),
    whoCanceled: raw.whoCanceled ?? raw.who_canceled ?? undefined,
  };
}

export interface D4SignSignerDetail {
  email?: string;
  act?: string;
  /** 0 = não assinou, 1 = assinou */
  signed?: number | string;
  signed_at?: string;
  key_signer?: string;
}

export interface D4SignDocumentDetail extends D4SignDocumentSummary {
  signers?: D4SignSignerDetail[];
  message?: string;
  /** URL do cofre */
  uuidSafe?: string;
}

/**
 * Valores do campo `act` — ação do signatário (confirmado D4Sign, 13 tipos):
 *  "1"  Assinar (padrão para contratos)
 *  "2"  Aprovar
 *  "3"  Reconhecer
 *  "4"  Assinar como parte
 *  "5"  Assinar como testemunha
 *  "6"  Assinar como interveniente
 *  "7"  Acusar recebimento
 *  "8"  Assinar como Emissor, Endossante e Avalista
 *  "9"  Assinar como Emissor, Endossante, Avalista e Fiador
 *  "10" Assinar como fiador
 *  "11" Assinar como parte e fiador
 *  "12" Assinar como responsável solidário
 *  "13" Assinar como parte e responsável solidário
 */
export type D4SignActType =
  | "1" | "2" | "3" | "4" | "5" | "6" | "7"
  | "8" | "9" | "10" | "11" | "12" | "13";

export interface D4SignSignerInput {
  email: string;
  /**
   * Tipo de ação. Default: "1" (Assinar).
   * Ver D4SignActType para todos os valores possíveis.
   */
  act?: D4SignActType | string;
  /** foreign: "0" = com CPF nacional, "1" = sem CPF / estrangeiro */
  foreign?: string;
  /**
   * Método de autenticação no Embed.
   * "email" (padrão) | "password" | "sms" | "whatse" (WhatsApp)
   */
  embed_methodauth?: "email" | "password" | "sms" | "whatse";
  /** Telefone para SMS/WhatsApp (ex: "+5511953020202") */
  embed_smsnumber?: string;
}

export interface D4SignPinInput {
  /** E-mail do signatário (deve estar entre os signers do documento) */
  email: string;
  /** Página onde o pin será posicionado (começa em 1) */
  page: number;
  /** Distância da borda esquerda em pixels */
  position_x: number;
  /** Distância do topo em pixels */
  position_y: number;
  /** Largura da página em pixels (A4 portrait: 794) */
  page_width: number;
  /** Altura da página em pixels (A4 portrait: 1123) */
  page_height: number;
  /** Tipo de pin: 0 = assinatura, 1 = rubrica, 2 = carimbo. Default: 0 */
  type?: 0 | 1 | 2;
}

export interface D4SignSendDocumentInput {
  safeUuid: string;
  file: Blob;
  fileName: string;
  signers: D4SignSignerInput[];
  /** Mensagem aos signatários (se skip_email=0) */
  message?: string;
  /** skip_email 1 = não enviar e-mail (ex.: embed); 0 = enviar */
  skipEmail?: "0" | "1";
  /** workflow sendtosigner: 0 paralelo, 1 sequencial */
  signingWorkflow?: "0" | "1";
  /** upload workflow: 1 ordem after_position, 2 sem ordem — alinhar com signingWorkflow */
  uploadWorkflow?: "1" | "2";
  /**
   * Pins de assinatura/rubrica/carimbo a posicionar.
   * Chamados via `addpins` ANTES do `sendtosigner`.
   */
  pins?: D4SignPinInput[];
}

export interface D4SignSendDocumentResult {
  documentUuid: string;
  /** Keys retornadas pelo createlist (sempre disponíveis após cadastro). */
  signerKeys: { email: string; keySigner: string }[];
  /** Link do primeiro signatário (após envio), se disponível */
  primarySignatureLink: string | null;
  /** Todos os links obtidos via API signaturelink */
  signatureLinks: { email: string; keySigner: string; link: string }[];
}

export class D4SignConnector {
  constructor(
    private readonly tokenApi: string,
    private readonly cryptKey: string | undefined,
    private readonly apiBaseUrl: string,
  ) {}

  static fromEnv(env: D4SignEnv): D4SignConnector {
    return new D4SignConnector(env.tokenApi, env.cryptKey, env.apiBaseUrl);
  }

  private authSearchParams(): string {
    const q = new URLSearchParams();
    q.set("tokenAPI", this.tokenApi);
    if (this.cryptKey) {
      q.set("cryptKey", this.cryptKey);
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }

  /** Wrapper de fetch com log de quota (10 req/h global D4Sign). */
  private async d4Fetch(
    url: string,
    init?: RequestInit,
    endpoint = "unknown",
    source = "connector",
  ): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      logD4SignApiCall({ endpoint, method, source, httpStatus: null });
      throw err;
    }
    logD4SignApiCall({ endpoint, method, source, httpStatus: res.status });
    return res;
  }

  private async parseJsonResponse(res: Response): Promise<unknown> {
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Resposta D4Sign não é JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      const msg =
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof (body as { message: unknown }).message === "string"
          ? (body as { message: string }).message
          : text.slice(0, 300);
      throw new Error(`D4Sign HTTP ${res.status}: ${msg}`);
    }
    return body;
  }

  /** Upload multipart do documento principal para o cofre (safe). */
  async uploadMainDocument(
    safeUuid: string,
    file: Blob,
    fileName: string,
    options?: { uuidFolder?: string; workflow?: "1" | "2" },
  ): Promise<string> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(safeUuid)}/upload${this.authSearchParams()}`;
    const form = new FormData();
    form.append("file", file, fileName);
    if (options?.uuidFolder) {
      form.append("uuid_folder", options.uuidFolder);
    }
    if (options?.workflow) {
      form.append("workflow", options.workflow);
    }

    const res = await this.d4Fetch(url, { method: "POST", body: form }, "documents/upload", "send");
    const body = (await this.parseJsonResponse(res)) as { uuid?: string };
    const uuid = body.uuid;
    if (!uuid || typeof uuid !== "string") {
      throw new Error("Resposta de upload D4Sign sem uuid.");
    }
    return uuid;
  }

  /** Cadastra signatários (createlist). */
  async createSignersList(documentUuid: string, signers: D4SignSignerInput[]): Promise<unknown> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/createlist${this.authSearchParams()}`;
    const payload = {
      signers: signers.map((s) => ({
        email: s.email,
        act: s.act ?? "1",
        foreign: s.foreign ?? "0",      // "0" = CPF brasileiro (default correto)
        certificadoicpbr: "0",
        assinatura_presencial: "0",
        docauth: "0",
        docauthandselfie: "0",
        embed_methodauth: s.embed_methodauth ?? "email",
        embed_smsnumber: s.embed_smsnumber ?? "",
        upload_allow: "0",
      })),
    };
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      },
      "documents/createlist",
      "send",
    );
    return this.parseJsonResponse(res);
  }

  /**
   * Interpreta a resposta do createlist e devolve pares email + key_signer.
   * Formatos reais: `{ message: [{ key_signer, email, ... }] }`, `{ list: [...] }`, array direto, etc.
   */
  static extractSignerKeysFromCreateListResponse(data: unknown): { email: string; keySigner: string }[] {
    type Row = {
      email?: unknown;
      key_signer?: unknown;
      keySigner?: unknown;
      "key-signer"?: unknown;
    };
    const isSignerRow = (m: unknown): m is Row =>
      typeof m === "object" &&
      m !== null &&
      (typeof (m as Row).key_signer === "string" || typeof (m as Row).email === "string");

    const rows: Row[] = [];
    const pushRow = (item: unknown) => {
      if (typeof item !== "object" || item === null) return;
      const o = item as Record<string, unknown>;
      if (Array.isArray(o.message) && o.message.some(isSignerRow)) {
        rows.push(...(o.message.filter(isSignerRow) as Row[]));
      } else if (Array.isArray(o.list)) {
        rows.push(...(o.list as Row[]));
      } else if (Array.isArray(o.signers)) {
        rows.push(...(o.signers as Row[]));
      } else {
        rows.push(o as Row);
      }
    };
    if (Array.isArray(data)) {
      for (const item of data) pushRow(item);
    } else {
      pushRow(data);
    }
    const out: { email: string; keySigner: string }[] = [];
    for (const r of rows) {
      const email = typeof r.email === "string" ? r.email.trim() : "";
      const key =
        typeof r.key_signer === "string"
          ? r.key_signer
          : typeof r.keySigner === "string"
            ? r.keySigner
            : typeof r["key-signer"] === "string"
              ? r["key-signer"]
              : "";
      if (email && key) {
        out.push({ email, keySigner: key });
      }
    }
    return out;
  }

  /**
   * Obtém key_signer após createlist. Se a resposta não trouxer todas as keys
   * (ex.: `{ message: "success" }` em batch antigo), usa GET /documents/{uuid}/list.
   */
  async resolveSignerKeysAfterCreateList(
    documentUuid: string,
    createlistResponse: unknown,
    expectedSigners: D4SignSignerInput[],
  ): Promise<{ email: string; keySigner: string }[]> {
    const expectedEmails = expectedSigners.map((s) => s.email.trim().toLowerCase());
    const keyByEmail = new Map<string, string>();

    for (const row of D4SignConnector.extractSignerKeysFromCreateListResponse(createlistResponse)) {
      keyByEmail.set(row.email.trim().toLowerCase(), row.keySigner);
    }

    const missingEmails = () => expectedEmails.filter((e) => !keyByEmail.has(e));

    if (missingEmails().length > 0) {
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
        try {
          const listed = await this.listSignersByDocument(documentUuid, { source: "send" });
          for (const s of listed.signers) {
            if (s.key_signer && s.email) {
              keyByEmail.set(s.email.trim().toLowerCase(), s.key_signer);
            }
          }
        } catch {
          // retry após breve espera (doc pode ainda estar processando)
        }
        if (missingEmails().length === 0) break;
      }
    }

    const stillMissing = missingEmails();
    if (stillMissing.length > 0) {
      const preview = JSON.stringify(createlistResponse)?.slice(0, 400) ?? "null";
      throw new Error(
        `A D4Sign não devolveu key_signer para: ${stillMissing.join(", ")}. Resposta createlist: ${preview}`,
      );
    }

    return expectedSigners.map((s) => {
      const normalized = s.email.trim().toLowerCase();
      return { email: s.email, keySigner: keyByEmail.get(normalized)! };
    });
  }

  async sendToSigner(
    documentUuid: string,
    options: { message?: string; skipEmail: "0" | "1"; workflow: "0" | "1" },
  ): Promise<void> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/sendtosigner${this.authSearchParams()}`;
    const body = {
      message: options.message ?? "",
      skip_email: options.skipEmail,
      workflow: options.workflow,
      tokenAPI: this.tokenApi,
    };
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      },
      "documents/sendtosigner",
      "send",
    );
    await this.parseJsonResponse(res);
  }

  /** Obtém o link público de assinatura para um signatário (após sendtosigner). */
  async getSignatureLink(documentUuid: string, keySigner: string): Promise<string> {
    const pathKey = encodeURIComponent(keySigner);
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/signaturelink/${pathKey}${this.authSearchParams()}`;
    const headers = { Accept: "application/json", "Content-Type": "application/json" };
    let res = await this.d4Fetch(url, { method: "GET", headers }, "documents/signaturelink", "send");
    if (!res.ok) {
      res = await this.d4Fetch(url, { method: "POST", headers, body: "{}" }, "documents/signaturelink", "send");
    }
    const data = (await this.parseJsonResponse(res)) as { link?: string };
    if (!data.link || typeof data.link !== "string") {
      throw new Error("Resposta signaturelink sem campo link.");
    }
    return data.link;
  }

  async registerWebhook(documentUuid: string, webhookUrl: string): Promise<void> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/webhooks${this.authSearchParams()}`;
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      },
      "documents/webhooks",
      "send",
    );
    await this.parseJsonResponse(res);
  }

  async addPinsToDocument(
    documentUuid: string,
    pins: Array<{
      email: string;
      page: number;
      position_x: number;
      position_y: number;
      page_width: number;
      page_height: number;
      type?: 0 | 1 | 2;
    }>,
  ): Promise<void> {
    if (pins.length === 0) return;
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/addpins${this.authSearchParams()}`;
    const payload = {
      pins: pins.map((p) => ({
        document:    documentUuid,
        email:       p.email,
        page_width:  p.page_width,
        page_height: p.page_height,
        page:        p.page,
        position_x:  p.position_x,
        position_y:  p.position_y,
        type:        p.type ?? 0, // default: assinatura
      })),
    };
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      },
      "documents/addpins",
      "send",
    );
    await this.parseJsonResponse(res);
  }

  /**
   * Dimensões das páginas do PDF processado pela D4Sign.
   * `GET /documents/{uuid}/dimensions`
   */
  async getDocumentDimensions(documentUuid: string): Promise<{
    totalPages: number;
    pages: Array<{ width: number; height: number }>;
  }> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/dimensions${this.authSearchParams()}`;
    const res = await this.d4Fetch(
      url,
      { headers: { Accept: "application/json" } },
      "documents/dimensions",
      "send",
    );
    const body = (await this.parseJsonResponse(res)) as Record<string, unknown>;
    const raw = body.dimensions ?? body.pages ?? body.data ?? body;
    const list = Array.isArray(raw) ? raw : [];
    const pages = list.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        width: Number(row.width ?? row.page_width ?? 794) || 794,
        height: Number(row.height ?? row.page_height ?? 1123) || 1123,
      };
    });
    return { totalPages: Math.max(pages.length, 1), pages };
  }

  /**
   * Reenvia o link de assinatura para um signatário (caso ele perca o e-mail).
   * `POST /documents/{uuid}/resend`
   */
  async resendSignatureLink(
    documentUuid: string,
    keySigner: string,
    email?: string,
  ): Promise<void> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/resend${this.authSearchParams()}`;
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ key_signer: keySigner, email }),
      },
      "documents/resend",
      "connector",
    );
    await this.parseJsonResponse(res);
  }

  /**
   * Cancela um documento.
   * `POST /documents/{uuid}/cancel`
   */
  async cancelDocument(documentUuid: string, comment?: string): Promise<void> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/cancel${this.authSearchParams()}`;
    const res = await this.d4Fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(comment ? { comment } : {}),
      },
      "documents/cancel",
      "connector",
    );
    await this.parseJsonResponse(res);
  }

  /**
   * Status de documento retornado pela API da D4Sign.
   * `statusId`: 1=Processando, 2=Aguardando Signatários, 3=Em Assinatura, 4=Finalizado, 5=Cancelado
   */

  /**
   * Lista todos os cofres do usuário.
   * D4Sign retorna `name-safe` (com hífen) em alguns retornos, `name_safe` em outros.
   */
  async getSafes(): Promise<D4SignSafeInfo[]> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/safes${this.authSearchParams()}`;
    const res = await this.d4Fetch(url, { headers: { Accept: "application/json" } }, "safes", "import");
    const body = (await this.parseJsonResponse(res)) as unknown;
    const rows: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : [];
    return rows.map((r) => {
      const pickStr = (...keys: string[]): string => {
        for (const k of keys) {
          const v = r[k];
          if (typeof v === "string" && v.trim().length > 0) return v.trim();
        }
        return "";
      };
      return {
        uuid_safe: pickStr("uuid_safe", "uuidSafe", "uuid-safe"),
        name_safe: pickStr("name-safe", "name_safe", "nameSafe"),
        total_doc:
          typeof r.total_doc === "number"
            ? r.total_doc
            : typeof r.total_doc === "string"
              ? Number(r.total_doc) || undefined
              : undefined,
      };
    });
  }

  /** Lista documentos de um cofre (paginado, pg começa em 1). */
  async listDocumentsBySafe(
    safeUuid: string,
    options?: { pg?: number; statusId?: number; uuidFolder?: string | null; source?: string },
  ): Promise<D4SignDocumentSummary[]> {
    const q = new URLSearchParams();
    q.set("tokenAPI", this.tokenApi);
    if (this.cryptKey) q.set("cryptKey", this.cryptKey);
    if (options?.pg) q.set("pg", String(options.pg));
    if (options?.statusId !== undefined) q.set("typedoc", String(options.statusId));
    if (options?.uuidFolder) q.set("uuid_folder", options.uuidFolder);

    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(safeUuid)}/safe?${q.toString()}`;
    const res = await this.d4Fetch(
      url,
      { headers: { Accept: "application/json" } },
      "documents/safe",
      options?.source ?? "sync",
    );
    const body = (await this.parseJsonResponse(res)) as unknown;

    // Resposta pode ser array direto ou { documents: [...] }
    const rawDocs: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : Array.isArray((body as Record<string, unknown>)?.documents)
        ? ((body as { documents: Record<string, unknown>[] }).documents)
        : [];

    // CONFIRMADO pela docs D4Sign: o 1º elemento da array é metadata de paginação
    // (algo como `{ "totalOfPages": N }`), não um documento. Documentos têm `uuidDoc`.
    const onlyDocs = rawDocs.filter((r) => {
      return Boolean(r.uuidDoc ?? r.uuid_doc ?? r.uuid);
    });

    return onlyDocs.map(normalizeDocSummary);
  }

  /**
   * Lista pastas de um cofre. D4Sign endpoint: GET /folders/{safeUuid}/find
   * Retorna array (ou {folders:[...]}). Campos podem vir em snake_case ou camelCase.
   */
  async getFoldersBySafe(safeUuid: string): Promise<D4SignFolderInfo[]> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/folders/${encodeURIComponent(safeUuid)}/find${this.authSearchParams()}`;
    const res = await this.d4Fetch(url, { headers: { Accept: "application/json" } }, "folders/find", "import");
    const body = (await this.parseJsonResponse(res)) as unknown;

    const rows: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : Array.isArray((body as Record<string, unknown>)?.folders)
        ? ((body as { folders: Record<string, unknown>[] }).folders)
        : [];

    const out: D4SignFolderInfo[] = [];
    for (const r of rows) {
      const uuid =
        (r.uuid_folder ?? r.uuidFolder ?? r.uuid ?? "") as string;
      if (!uuid) continue;
      out.push({
        uuid_folder: String(uuid),
        name: String(r.name ?? r.name_folder ?? r.nameFolder ?? "(sem nome)"),
        parent_uuid:
          (r.parent_uuid ?? r.parentUuid ?? r.uuid_folder_parent ?? null) as string | null,
      });
    }
    return out;
  }

  /**
   * Lista documentos de uma pasta específica dentro de um cofre.
   *
   * Endpoint correto (documentado em https://docapi.d4sign.com.br/docs/endpoints):
   *   GET /documents/{uuid_safe}/safe/{uuid_folder}
   *
   * NÃO usar /documents/{uuid_folder}/folder — esse path não existe na D4Sign.
   * Compartilha a mesma cota de rate-limit que listDocumentsBySafe (10 req/h).
   */
  async listDocumentsByFolder(
    safeUuid: string,
    folderUuid: string,
    options?: { pg?: number },
  ): Promise<D4SignDocumentSummary[]> {
    const q = new URLSearchParams();
    q.set("tokenAPI", this.tokenApi);
    if (this.cryptKey) q.set("cryptKey", this.cryptKey);
    if (options?.pg) q.set("pg", String(options.pg));

    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(safeUuid)}/safe/${encodeURIComponent(folderUuid)}?${q.toString()}`;
    const res = await this.d4Fetch(url, { headers: { Accept: "application/json" } }, "documents/safe/folder", "import");
    const body = (await this.parseJsonResponse(res)) as unknown;

    const rawDocs: Record<string, unknown>[] = Array.isArray(body)
      ? (body as Record<string, unknown>[])
      : Array.isArray((body as Record<string, unknown>)?.documents)
        ? ((body as { documents: Record<string, unknown>[] }).documents)
        : [];

    const onlyDocs = rawDocs.filter((r) =>
      Boolean(r.uuidDoc ?? r.uuid_doc ?? r.uuid),
    );
    return onlyDocs.map(normalizeDocSummary);
  }

  /** Detalhes de um documento específico, incluindo signatários. */
  async getDocumentDetails(documentUuid: string): Promise<D4SignDocumentDetail> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}${this.authSearchParams()}`;
    const res = await this.d4Fetch(url, { headers: { Accept: "application/json" } }, "documents/detail", "enrich");
    const raw = (await this.parseJsonResponse(res)) as Record<string, unknown>;
    // Normaliza campos que podem vir em snake_case ou camelCase
    return {
      ...raw,
      uuid_doc:      String(raw.uuid_doc      ?? raw.uuidDoc      ?? raw.uuid      ?? documentUuid),
      name_document: String(raw.name_document ?? raw.nameDocument ?? raw.name      ?? ""),
      statusId:      raw.statusId ?? raw.status_id,
      statusName:    raw.statusName ?? raw.status_name,
      created_at:    String(raw.created_at    ?? raw.createdAt    ?? ""),
      finalized_at:  String(raw.finalized_at  ?? raw.finalizedAt  ?? ""),
    } as D4SignDocumentDetail;
  }

  /**
   * Lista signatários de um documento — endpoint dedicado.
   *
   * `GET /documents/{uuid}/list` — diferente de `GET /documents/{uuid}`.
   * Retorna `{ uuidDoc, nameDoc, statusId, list: [{ key_signer, user_name, email,
   *   signed, sign_info: { ip, geolocation, date_signed, date_signed_atom }, ... }] }`.
   *
   * Confirmado pela documentação oficial em https://docapi.d4sign.com.br/docs/endpoints-1.
   * Compartilha o mesmo rate-limit global de 10 req/h.
   */
  async listSignersByDocument(
    documentUuid: string,
    options?: { source?: string },
  ): Promise<{
    uuid_doc: string;
    name_document: string | null;
    statusId: number | string | null;
    statusName: string | null;
    signers: Array<{
      key_signer: string;
      email: string | null;
      user_name: string | null;
      user_document: string | null;
      signed: boolean;
      signed_at: string | null;
      act: string | null;
      foreign: string | null;
      sign_info: Record<string, unknown> | null;
    }>;
  }> {
    const url = `${this.apiBaseUrl.replace(/\/$/, "")}/documents/${encodeURIComponent(documentUuid)}/list${this.authSearchParams()}`;
    const res = await this.d4Fetch(
      url,
      { headers: { Accept: "application/json" } },
      "documents/list",
      options?.source ?? "enrich",
    );
    const raw = (await this.parseJsonResponse(res)) as Record<string, unknown>;

    // A D4Sign retorna o /list em 3 formatos possíveis:
    //   1. { list: [...signers] }                          — objeto com chave "list"
    //   2. [{ uuidDoc, nameDoc, list: [...signers] }]      — array de docs (formato real confirmado)
    //   3. [...signers]                                    — array direto de signatários
    const asArray = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : null;
    const firstDoc = asArray?.[0] as Record<string, unknown> | undefined;
    const listRaw: Record<string, unknown>[] =
      // Formato 1
      Array.isArray((raw as Record<string, unknown>).list)
        ? ((raw as Record<string, unknown>).list as Record<string, unknown>[])
      // Formato 2 — array de docs, cada doc tem .list de signatários
      : firstDoc && Array.isArray(firstDoc.list)
        ? (firstDoc.list as Record<string, unknown>[])
      // Formato 3 — array direto (fallback)
      : asArray?.every((s) => typeof s.key_signer !== "undefined" || typeof s.email !== "undefined")
        ? asArray
        : [];

    const signers = listRaw.map((s) => {
      const signInfo = (s.sign_info ?? s.signInfo ?? null) as Record<string, unknown> | null;
      const signedAt =
        signInfo && typeof signInfo === "object"
          ? String(signInfo.date_signed_atom ?? signInfo.date_signed ?? "") || null
          : (typeof s.signed_at === "string" ? s.signed_at : null);
      const signedRaw = s.signed;
      const signed =
        signedRaw === true ||
        signedRaw === 1 ||
        signedRaw === "1" ||
        signedRaw === "true";
      return {
        key_signer:    String(s.key_signer ?? s.keySigner ?? ""),
        // D4Sign usa nomes de campo diferentes em versões/endpoints distintos
        email: (
          typeof s.email       === "string" ? s.email       :
          typeof s.user_email  === "string" ? s.user_email  :
          typeof s.signerEmail === "string" ? s.signerEmail :
          typeof s.emailSigner === "string" ? s.emailSigner :
          null
        ),
        user_name: (
          typeof s.user_name  === "string" ? s.user_name  :
          typeof s.userName   === "string" ? s.userName   :
          typeof s.signer_name === "string" ? s.signer_name :
          null
        ),
        user_document: (typeof s.user_document === "string" ? s.user_document : null),
        signed,
        signed_at:     signedAt,
        act:           (typeof s.act === "string" ? s.act : null),
        foreign:       (typeof s.foreign === "string" ? s.foreign : null),
        sign_info:     signInfo,
      };
    });

    // Quando o raw é um array de docs (formato 2), os metadados estão em raw[0]
    const meta: Record<string, unknown> = firstDoc ?? (raw as Record<string, unknown>);
    return {
      uuid_doc:      String(meta.uuidDoc ?? meta.uuid_doc ?? documentUuid),
      name_document: (typeof meta.nameDoc === "string" ? meta.nameDoc : null) ??
                     (typeof meta.name_document === "string" ? meta.name_document : null),
      statusId:      (meta.statusId ?? meta.status_id ?? null) as number | string | null,
      statusName:    (typeof meta.statusName === "string" ? meta.statusName : null) ??
                     (typeof meta.status_name === "string" ? meta.status_name : null),
      signers,
    };
  }

  /**
   * Fluxo completo: upload → createlist → sendtosigner → signaturelink(s).
   */
  async sendDocumentForSignature(input: D4SignSendDocumentInput): Promise<D4SignSendDocumentResult> {
    const uploadWf = input.uploadWorkflow ?? (input.signingWorkflow === "1" ? "1" : "2");
    const documentUuid = await this.uploadMainDocument(
      input.safeUuid,
      input.file,
      input.fileName,
      { workflow: uploadWf },
    );

    const listResponse = await this.createSignersList(documentUuid, input.signers);
    const signerKeys = await this.resolveSignerKeysAfterCreateList(
      documentUuid,
      listResponse,
      input.signers,
    );

    // Posiciona pins na última página (folha de assinaturas) ANTES de enviar
    if (input.pins && input.pins.length > 0) {
      try {
        let pinsToApply = input.pins as ContratoSignaturePin[];
        const needsLastPage = pinsToApply.some(
          (p) => p.page === SIGNATURE_PAGE_LAST || p.page <= 0,
        );
        if (needsLastPage) {
          try {
            const dims = await this.getDocumentDimensions(documentUuid);
            pinsToApply = resolvePinsToLastPage(pinsToApply, dims.totalPages);
          } catch {
            // Fallback: corpo + folha dedicada = mínimo 2 páginas
            pinsToApply = resolvePinsToLastPage(pinsToApply, 2);
          }
        }
        await this.addPinsToDocument(documentUuid, pinsToApply);
      } catch (e) {
        console.warn("[D4Sign] addpins falhou (não bloqueia envio):", e instanceof Error ? e.message : e);
      }
    }

    await this.sendToSigner(documentUuid, {
      message: input.message,
      skipEmail: input.skipEmail ?? "0",
      workflow: input.signingWorkflow ?? "0",
    });

    const signatureLinks: D4SignSendDocumentResult["signatureLinks"] = [];
    for (const row of signerKeys) {
      try {
        const link = await this.getSignatureLink(documentUuid, row.keySigner);
        signatureLinks.push({ email: row.email, keySigner: row.keySigner, link });
      } catch {
        // Um signatário pode falhar se a API ainda estiver a processar; continuar com os outros
      }
    }

    const primarySignatureLink = signatureLinks[0]?.link ?? null;
    return { documentUuid, signerKeys, primarySignatureLink, signatureLinks };
  }
}
