import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import { maskDocument } from "@/lib/crm/br-document-mask";

function parsePropostaEmpresasJsonMinimal(raw: string | undefined): { primaryIndex: number } {
  if (!raw?.trim()) return { primaryIndex: 0 };
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const primaryIndex =
      typeof o.primaryIndex === "number" && o.primaryIndex >= 0 ? Math.floor(o.primaryIndex) : 0;
    return { primaryIndex };
  } catch {
    return { primaryIndex: 0 };
  }
}

export type PropostaEmpresaPrincipal = {
  razaoSocial: string | null;
  /** CPF/CNPJ formatado para exibição */
  documentoFormatado: string | null;
};

/** Empresa principal na proposta (razão + documento do intake alinhado a `cp_proposta_empresas_json`). */
export function resolvePropostaEmpresaPrincipal(params: {
  empresasIntake: LeadIntakeEmpresaRow[];
  cpPropostaEmpresasJson: string | undefined;
}): PropostaEmpresaPrincipal {
  const { empresasIntake, cpPropostaEmpresasJson } = params;
  const payload = parsePropostaEmpresasJsonMinimal(
    typeof cpPropostaEmpresasJson === "string" ? cpPropostaEmpresasJson : undefined,
  );
  let primaryIdx = payload.primaryIndex;
  if (primaryIdx <= 0 && empresasIntake.length > 0) {
    primaryIdx = empresasIntake[0].index;
  }
  if (primaryIdx <= 0) {
    return { razaoSocial: null, documentoFormatado: null };
  }
  const em = empresasIntake.find((e) => e.index === primaryIdx);
  if (!em) {
    return { razaoSocial: null, documentoFormatado: null };
  }
  const razaoSocial = em.razao_social?.trim() || null;
  const rawDoc = em.documento?.trim() ?? "";
  const tipo = em.tipo_documento === "CPF" || em.tipo_documento === "CNPJ" ? em.tipo_documento : "CNPJ";
  const documentoFormatado =
    rawDoc.length > 0 ? maskDocument(rawDoc, tipo === "CPF" ? "CPF" : "CNPJ") : null;
  return { razaoSocial, documentoFormatado };
}

/** Razão social da empresa principal na proposta (`cp_proposta_empresas_json` + cadastro inicial). */
export function resolvePropostaEmpresaPrincipalNome(params: {
  empresasIntake: LeadIntakeEmpresaRow[];
  cpPropostaEmpresasJson: string | undefined;
}): string | null {
  return resolvePropostaEmpresaPrincipal(params).razaoSocial;
}
