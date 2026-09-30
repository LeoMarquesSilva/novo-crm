import { callStructured, getExtractionModel } from "@/lib/scope-import/openai";
import { clipContractTextForExtraction } from "./clip-for-extraction";
import { CONTRACT_IMPORT_INPUT_CHAR_CAP, CONTRACT_IMPORT_MAX_TOKENS } from "./constants";
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
): Promise<{ data: ContractImportExtraction; model: string; clippedChars: number; originalChars: number }> {
  const clipped = clipContractTextForExtraction({ filename, text });
  const result = await callStructured(
    getContractImportModel(),
    buildContractImportSystemPrompt(),
    buildContractImportUserPrompt(filename, clipped.text),
    contractImportJsonSchema as unknown as Record<string, unknown>,
    "contract_import_extraction",
    CONTRACT_IMPORT_MAX_TOKENS,
    parseContractImportExtraction,
    CONTRACT_IMPORT_INPUT_CHAR_CAP,
  );
  return {
    data: result.data,
    model: result.model,
    clippedChars: clipped.clippedChars,
    originalChars: clipped.originalChars,
  };
}
