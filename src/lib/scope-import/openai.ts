import OpenAI from "openai";
import { IntegrationError } from "@/lib/http/api-errors";
import {
  OPENAI_CONSOLIDATION_TIMEOUT_MS,
  OPENAI_MAX_RETRIES,
  OPENAI_TIMEOUT_MS,
  SCOPE_IMPORT_CONSOLIDATION_MAX_TOKENS,
  SCOPE_IMPORT_EXTRACTION_MAX_TOKENS,
  SCOPE_IMPORT_INPUT_CHAR_CAP,
} from "./constants";

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new IntegrationError("openai", "Leitura por IA não configurada no servidor.", "OPENAI_API_KEY ausente");
  }
  client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
  return client;
}

/** Converte erro do SDK em mensagem segura para a tela (o corpo fica no log). */
export function toOpenAIIntegrationError(error: unknown): IntegrationError | null {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new IntegrationError("openai", "A IA não respondeu a tempo. Tente novamente.", error.message);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new IntegrationError("openai", "Não foi possível falar com a IA. Tente novamente.", error.message);
  }
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    const publicMessage =
      status === 429
        ? "Limite de uso da IA atingido. Tente de novo em alguns minutos."
        : status === 401 || status === 403
          ? "Chave da IA inválida no servidor."
          : `A IA recusou a leitura (HTTP ${status ?? "?"}).`;
    return new IntegrationError("openai", publicMessage, error.message, status);
  }
  return null;
}

/** Resposta da IA vazia, sem JSON válido ou fora do schema: vale uma nova tentativa. */
class OpenAIOutputError extends Error {}

export function getExtractionModel(): string {
  return process.env.SCOPE_IMPORT_OPENAI_MODEL_EXTRACTION?.trim() || "gpt-4.1-mini";
}

export function getConsolidationModel(): string {
  return process.env.SCOPE_IMPORT_OPENAI_MODEL_CONSOLIDATION?.trim() || "gpt-4.1";
}

export function truncateInput(text: string, cap = SCOPE_IMPORT_INPUT_CHAR_CAP): string {
  if (text.length <= cap) return text;
  const head = Math.floor(cap * 0.7);
  const tail = cap - head - 40;
  return `${text.slice(0, head)}\n\n[... texto truncado ...]\n\n${text.slice(-tail)}`;
}

export type StructuredCallResult<T> = {
  data: T;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function callStructured<T>(
  model: string,
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  schemaName: string,
  maxOutputTokens: number,
  parse: (raw: unknown) => T,
  inputCap?: number,
  requestOptions?: { timeoutMs?: number; maxRetries?: number },
): Promise<StructuredCallResult<T>> {
  const openai = getOpenAIClient();
  const truncatedUser = truncateInput(user, inputCap);

  async function runOnce(): Promise<StructuredCallResult<T>> {
    let response: Awaited<ReturnType<typeof openai.responses.create>>;
    try {
      response = await openai.responses.create(
        {
          model,
          max_output_tokens: maxOutputTokens,
          input: [
            { role: "system", content: system },
            { role: "user", content: truncatedUser },
          ],
          text: {
            format: {
              type: "json_schema",
              name: schemaName,
              strict: true,
              schema: jsonSchema,
            },
          },
        },
        {
          timeout: requestOptions?.timeoutMs ?? OPENAI_TIMEOUT_MS,
          maxRetries: requestOptions?.maxRetries ?? OPENAI_MAX_RETRIES,
        },
      );
    } catch (error) {
      throw toOpenAIIntegrationError(error) ?? error;
    }

    const outputText = response.output_text?.trim();
    if (!outputText) throw new OpenAIOutputError("Resposta vazia da OpenAI.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new OpenAIOutputError("JSON inválido retornado pela OpenAI.");
    }

    let data: T;
    try {
      data = parse(parsed);
    } catch (error) {
      throw new OpenAIOutputError(error instanceof Error ? error.message : "Resposta fora do formato esperado.");
    }

    return {
      data,
      model: response.model ?? model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }

  // Falhas de rede/HTTP já foram tentadas de novo pelo SDK; aqui só se repete
  // quando a resposta veio vazia ou fora do formato.
  try {
    return await runOnce();
  } catch (firstError) {
    if (!(firstError instanceof OpenAIOutputError)) throw firstError;
    try {
      return await runOnce();
    } catch {
      throw firstError;
    }
  }
}

export async function callExtractionStructured<T>(
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  parse: (raw: unknown) => T,
): Promise<StructuredCallResult<T>> {
  return callStructured(
    getExtractionModel(),
    system,
    user,
    jsonSchema,
    "scope_import_extraction",
    SCOPE_IMPORT_EXTRACTION_MAX_TOKENS,
    parse,
  );
}

export async function callConsolidationStructured<T>(
  system: string,
  user: string,
  jsonSchema: Record<string, unknown>,
  parse: (raw: unknown) => T,
): Promise<StructuredCallResult<T>> {
  return callStructured(
    getConsolidationModel(),
    system,
    user,
    jsonSchema,
    "scope_import_consolidation",
    SCOPE_IMPORT_CONSOLIDATION_MAX_TOKENS,
    parse,
    undefined,
    { timeoutMs: OPENAI_CONSOLIDATION_TIMEOUT_MS },
  );
}

/** Permite injetar mock nos testes. */
export function resetOpenAIClientForTests() {
  client = null;
}

export function setOpenAIClientForTests(mock: OpenAI) {
  client = mock;
}
