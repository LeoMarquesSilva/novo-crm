/**
 * Leitura do POSTback da D4Sign nas duas versões.
 *
 * 1.0: form-data com `uuid`, `type_post`, `message` e `email` (tipos 2 e 4).
 * 2.0: JSON com `event_datetime`, `document_name` e, conforme o tipo:
 *   1 → `signers[]` completos (email, name, signed_at, identification_number)
 *   2 → `signer` + `error_details`
 *   3 → `cancellation_message`
 *   4 → `signer` (email, identification_number)
 * @see https://docapi.d4sign.com.br/v2.0/docs/webhook-postback
 */

export type D4SignWebhookSigner = {
  email: string;
  name: string | null;
  signed_at: string | null;
  identification_number: string | null;
};

export type D4SignWebhookEvent = {
  version: 1 | 2;
  uuid: string;
  typePost: string;
  message: string | null;
  /** ISO; null na 1.0. */
  eventAt: string | null;
  documentName: string | null;
  /** E-mail do signatário do evento (tipos 2 e 4). */
  signerEmail: string | null;
  /** Lista completa (2.0, tipo 1). */
  signers: D4SignWebhookSigner[] | null;
  cancellationMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  raw: Record<string, unknown>;
};

function str(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function iso(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readSigners(value: unknown): D4SignWebhookSigner[] | null {
  if (!Array.isArray(value)) return null;
  const out: D4SignWebhookSigner[] = [];
  for (const item of value) {
    const row = record(item);
    const email = str(row?.email);
    if (!row || !email) continue;
    out.push({
      email,
      name: str(row.name),
      signed_at: iso(row.signed_at),
      identification_number: str(row.identification_number),
    });
  }
  return out;
}

/** Monta o evento a partir do corpo já decodificado (JSON ou form-data). */
export function parseD4SignWebhookBody(
  raw: Record<string, unknown>,
  version: 1 | 2,
): D4SignWebhookEvent | null {
  const uuid = str(raw.uuid);
  const typePost = str(raw.type_post);
  if (!uuid || !typePost) return null;
  const signer = record(raw.signer);
  return {
    version,
    uuid,
    typePost,
    message: str(raw.message),
    eventAt: iso(raw.event_datetime),
    documentName: str(raw.document_name),
    signerEmail: str(signer?.email) ?? str(raw.email),
    signers: readSigners(raw.signers),
    cancellationMessage: str(raw.cancellation_message),
    errorDetails: record(raw.error_details),
    raw,
  };
}

/** Lê o corpo da requisição: JSON (2.0) ou form-data (1.0). */
export async function readD4SignWebhookRequest(
  request: Request,
): Promise<D4SignWebhookEvent | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await request.text();

  if (contentType.includes("json") || /^\s*\{/.test(text)) {
    try {
      const body = record(JSON.parse(text));
      return body ? parseD4SignWebhookBody(body, 2) : null;
    } catch {
      return null;
    }
  }

  const raw: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(text)) raw[key] = value;
  if (Object.keys(raw).length > 0 && raw.uuid) return parseD4SignWebhookBody(raw, 1);

  // multipart/form-data
  try {
    const form = await new Response(text, { headers: { "content-type": contentType } }).formData();
    const multipart: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      multipart[key] = typeof value === "string" ? value : "";
    }
    return parseD4SignWebhookBody(multipart, 1);
  } catch {
    return null;
  }
}

/** Signatário como gravado em `d4sign_documents.signers`. */
export type StoredWebhookSigner = {
  email: string;
  key_signer?: string | null;
  signed: boolean;
  signed_at: string | null;
  name?: string | null;
  user_document?: string | null;
  email_sent_status?: string | null;
  [key: string]: unknown;
};

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function latest(dates: Array<string | null | undefined>): string | null {
  const valid = dates.filter((d): d is string => Boolean(d) && !Number.isNaN(new Date(d as string).getTime()));
  return valid.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
}

/**
 * Aplica o evento aos signatários já gravados. Mantém `key_signer`, papel e
 * demais campos; acrescenta quem ainda não estava na lista (documento
 * criado direto na D4Sign chega aqui sem signatários).
 */
export function applyWebhookToSigners(
  current: StoredWebhookSigner[],
  event: D4SignWebhookEvent,
  nowIso: string,
): { signers: StoredWebhookSigner[]; finalizedAt: string | null } {
  const when = event.eventAt ?? nowIso;
  const upsert = (
    list: StoredWebhookSigner[],
    email: string,
    patch: Partial<StoredWebhookSigner>,
  ): StoredWebhookSigner[] => {
    const index = list.findIndex((s) => typeof s.email === "string" && sameEmail(s.email, email));
    if (index === -1) {
      return [...list, { email, key_signer: null, signed: false, signed_at: null, ...patch }];
    }
    return list.map((s, i) => (i === index ? { ...s, ...patch } : s));
  };

  if (event.typePost === "4" && event.signerEmail) {
    const prev = current.find((s) => sameEmail(s.email, event.signerEmail as string));
    return {
      signers: upsert(current, event.signerEmail, { signed: true, signed_at: prev?.signed_at ?? when }),
      finalizedAt: null,
    };
  }

  if (event.typePost === "2" && event.signerEmail) {
    const reason = event.errorDetails
      ? [event.errorDetails.category, event.errorDetails.reason].filter((v) => typeof v === "string").join(": ")
      : "";
    return {
      signers: upsert(current, event.signerEmail, { email_sent_status: reason || "Bounce" }),
      finalizedAt: null,
    };
  }

  if (event.typePost === "1") {
    let signers = current;
    for (const s of event.signers ?? []) {
      const prev = signers.find((row) => sameEmail(row.email, s.email));
      signers = upsert(signers, s.email, {
        signed: true,
        signed_at: s.signed_at ?? prev?.signed_at ?? when,
        ...(s.name ? { name: prev?.name ?? s.name } : {}),
        ...(s.identification_number ? { user_document: prev?.user_document ?? s.identification_number } : {}),
      });
    }
    // Documento finalizado: todos assinaram, inclusive quem não veio no evento (1.0).
    signers = signers.map((s) => ({ ...s, signed: true, signed_at: s.signed_at ?? when }));
    return { signers, finalizedAt: latest(signers.map((s) => s.signed_at)) ?? when };
  }

  return { signers: current, finalizedAt: null };
}
