import { NextResponse } from "next/server";

/** Erro cuja mensagem pode ir para o usuário como está. */
export class PublicError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export type IntegrationName = "evolution" | "sharepoint" | "rd" | "microsoft" | "openai" | "d4sign";

/**
 * Falha de integração externa: `publicMessage` vai para a tela; `detail` (corpo da
 * resposta, mensagem do provedor) fica só no log do servidor.
 */
export class IntegrationError extends Error {
  constructor(
    readonly integration: IntegrationName,
    readonly publicMessage: string,
    readonly detail: string,
    readonly httpStatus?: number,
  ) {
    super(`${publicMessage} ${detail}`.trim());
    this.name = "IntegrationError";
  }
}

/** Mensagem segura para devolver ao cliente. */
export function publicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof PublicError) return error.message;
  if (error instanceof IntegrationError) return error.publicMessage;
  return fallback;
}

/** Registra o erro no servidor e devolve uma referência curta para citar na tela. */
export function logServerError(
  scope: string,
  error: unknown,
  extra?: Record<string, unknown>,
): string {
  const ref = globalThis.crypto.randomUUID().slice(0, 8);
  const detail =
    error instanceof IntegrationError
      ? { integration: error.integration, status: error.httpStatus, detail: error.detail }
      : error instanceof Error
        ? { message: error.message }
        : { error };
  console.error(`[${scope}] ref=${ref}`, { ...detail, ...extra });
  return ref;
}

/** Resposta 500 genérica com referência do log; `PublicError` mantém mensagem e status. */
export function internalErrorResponse(
  scope: string,
  error: unknown,
  fallback = "Erro interno. Tente novamente.",
): NextResponse {
  if (error instanceof PublicError) {
    return NextResponse.json(
      { ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.status },
    );
  }
  const ref = logServerError(scope, error);
  return NextResponse.json(
    { ok: false, error: publicErrorMessage(error, fallback), ref },
    { status: 500 },
  );
}

/**
 * Texto para gravar em colunas `error_message` vistas na tela (importações):
 * mensagem pública da integração, ou a mensagem de erros próprios do CRM; erros
 * do banco (PostgREST) viram texto genérico.
 */
export function documentErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof IntegrationError) return error.publicMessage;
  if (error instanceof PublicError) return error.message;
  if (error && typeof error === "object" && "code" in error && "details" in error) {
    return fallback;
  }
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return fallback;
}
