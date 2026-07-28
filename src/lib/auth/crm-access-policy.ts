import type { Database } from "@/lib/supabase/database.types";

type CanPatchLeadDetailInput = {
  role: Database["public"]["Enums"]["user_role"];
  appArea: string | null;
  mutationKind: "intake" | "rd" | "pipeline";
  pipelineFieldCode: string | null;
};

export function canPatchLeadDetail(input: CanPatchLeadDetailInput): boolean {
  if (input.role === "admin" || input.role === "comercial") {
    return true;
  }

  return (
    input.mutationKind === "pipeline" &&
    input.pipelineFieldCode === "cp_escopo_detalhe_json" &&
    Boolean(input.appArea?.trim())
  );
}

type CanViewD4SignDocumentInput = {
  role: Database["public"]["Enums"]["user_role"];
};

export function canViewD4SignDocument(
  input: CanViewD4SignDocumentInput,
): boolean {
  return (
    input.role === "admin" ||
    input.role === "comercial" ||
    input.role === "controladoria" ||
    input.role === "financeiro"
  );
}

type CanViewD4SignDocumentRecordInput = CanViewD4SignDocumentInput & {
  oportunidadeId: string | null;
};

export function canViewD4SignDocumentRecord(
  input: CanViewD4SignDocumentRecordInput,
): boolean {
  if (!canViewD4SignDocument(input)) {
    return false;
  }

  return input.oportunidadeId !== null || input.role === "admin";
}
