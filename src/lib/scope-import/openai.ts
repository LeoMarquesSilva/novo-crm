import OpenAI from "openai";
import {
  SCOPE_IMPORT_CONSOLIDATION_MAX_TOKENS,
  SCOPE_IMPORT_EXTRACTION_MAX_TOKENS,
  SCOPE_IMPORT_INPUT_CHAR_CAP,
} from "./constants";

let client: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

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
): Promise<StructuredCallResult<T>> {
  const openai = getOpenAIClient();
  const truncatedUser = truncateInput(user);

  async function runOnce(): Promise<StructuredCallResult<T>> {
    const response = await openai.responses.create({
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
    });

    const outputText = response.output_text?.trim();
    if (!outputText) throw new Error("Resposta vazia da OpenAI.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new Error("JSON inválido retornado pela OpenAI.");
    }

    return {
      data: parse(parsed),
      model: response.model ?? model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }

  try {
    return await runOnce();
  } catch (firstError) {
    try {
      return await runOnce();
    } catch {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
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
  );
}

/** Permite injetar mock nos testes. */
export function resetOpenAIClientForTests() {
  client = null;
}

export function setOpenAIClientForTests(mock: OpenAI) {
  client = mock;
}
