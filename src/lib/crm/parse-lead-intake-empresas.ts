import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";

export function parseEmpresasIntakeFromRecord(intake: Record<string, unknown> | null): LeadIntakeEmpresaRow[] {
  if (!intake) return [];
  const raw = intake.empresas_json;
  if (!Array.isArray(raw)) return [];
  const out: LeadIntakeEmpresaRow[] = [];
  raw.forEach((row, i) => {
    if (!row || typeof row !== "object") return;
    const e = row as Record<string, unknown>;
    const rs = typeof e.razao_social === "string" ? e.razao_social.trim() : "";
    const tipo =
      e.tipo_documento === "CPF" || e.tipo_documento === "CNPJ" ? e.tipo_documento : "CNPJ";
    const doc = typeof e.documento === "string" ? e.documento.trim() : "";
    out.push({
      index: i + 1,
      razao_social: rs,
      tipo_documento: tipo,
      documento: doc,
    });
  });
  return out;
}
