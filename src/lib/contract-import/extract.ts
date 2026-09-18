import { callStructured, getExtractionModel } from "@/lib/scope-import/openai";
import { CONTRACT_IMPORT_MAX_TOKENS } from "./constants";
import { buildContractImportSystemPrompt, buildContractImportUserPrompt } from "./prompts";
import {
  contractImportJsonSchema,
  parseContractImportExtraction,
  type ContractImportExtraction,
} from "./schemas";

export function getContractImportModel(): string {
  return process.env.CONTRACT_IMPORT_OPENAI_MODEL?.trim() || getExtractionModel();
}

export async function extractContractFromText(
  filename: string,
  text: string,
): Promise<{ data: ContractImportExtraction; model: string }> {
  const result = await callStructured(
    getContractImportModel(),
    buildContractImportSystemPrompt(),
    buildContractImportUserPrompt(filename, text),
    contractImportJsonSchema as unknown as Record<string, unknown>,
    "contract_import_extraction",
    CONTRACT_IMPORT_MAX_TOKENS,
    parseContractImportExtraction,
  );
  return { data: result.data, model: result.model };
}
