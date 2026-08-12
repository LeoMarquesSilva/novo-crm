import type { Database } from "@/lib/supabase/database.types";

export type ContractCapability =
  | "view"
  | "configure"
  | "prepare_closing"
  | "approve_closing"
  | "register_vios"
  | "manage_renewal"
  | "ensure_draft";

export function canEnsureContractDraft(
  role: Database["public"]["Enums"]["user_role"],
): boolean {
  return role === "admin" || role === "comercial" || role === "controladoria";
}

export function canAccessContractCapability(input: {
  role: Database["public"]["Enums"]["user_role"];
  capability: ContractCapability;
}): boolean {
  switch (input.capability) {
    case "view":
      return (
        input.role === "admin" ||
        input.role === "controladoria" ||
        input.role === "financeiro" ||
        input.role === "comercial"
      );
    case "configure":
    case "approve_closing":
    case "manage_renewal":
      return input.role === "admin" || input.role === "controladoria";
    case "ensure_draft":
      return canEnsureContractDraft(input.role);
    case "prepare_closing":
    case "register_vios":
      return (
        input.role === "admin" ||
        input.role === "controladoria" ||
        input.role === "financeiro"
      );
  }
}

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
