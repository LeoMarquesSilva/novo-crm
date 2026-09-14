import type { InvestimentoTipoDef } from "@/data/proposta-investimento-catalog";
import type { PropostaTiposCatalog } from "@/data/proposta-tipos-catalog";
import { getEscopoEntriesForArea, isEscopoEntryCompleteWithCatalog } from "./proposta-escopo-entry";
import { parseAreasList, parseEscopoJsonWithMeta } from "./proposta-escopo-json";
import { isInvestimentoDocumentoComplete, resolveInvestimentoDocumento } from "./proposta-investimento-consolidado";
import { userFacingFieldLabel } from "./user-facing-field-label";

export type ProposalRequiredField = { fieldCode: string; label: string; isRequired: boolean };

/** Validates the current draft, never the pending list from an earlier saved snapshot. */
export function listProposalPendingFields(params: {
  templateFields: ProposalRequiredField[];
  fieldByCode: Record<string, string>;
  templateData: Record<string, string>;
  scopeCatalog: PropostaTiposCatalog;
  investmentCatalog: InvestimentoTipoDef[];
  responsavel: string;
}): string[] {
  const { fieldByCode, templateData, scopeCatalog, investmentCatalog } = params;
  const pending = new Set<string>();
  const areas = parseAreasList(fieldByCode.cp_areas_objeto ?? "");
  const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(fieldByCode.cp_escopo_detalhe_json ?? "");
  for (const field of params.templateFields) {
    if (!field.isRequired) continue;
    if (field.fieldCode === "cp_escopo_detalhe_json") {
      const complete = areas.length > 0 && areas.every((area) => {
        const entries = getEscopoEntriesForArea(escopo, area);
        return entries.length > 0 && entries.every((entry) =>
          isEscopoEntryCompleteWithCatalog(area, entry, scopeCatalog, investmentCatalog),
        );
      });
      if (!complete) pending.add(userFacingFieldLabel(field.label, field.fieldCode));
    } else if (!(fieldByCode[field.fieldCode] ?? templateData[field.fieldCode] ?? "").trim()) {
      pending.add(userFacingFieldLabel(field.label, field.fieldCode));
    }
  }
  const investment = resolveInvestimentoDocumento(escopo, areas, investimentoDocumento, investmentCatalog);
  if (areas.length > 0 && !isInvestimentoDocumentoComplete(investment, investmentCatalog)) {
    pending.add("Investimento da proposta");
  }
  const templatePendingLabels: Record<string, string> = {
    EMPRESA: "Empresa",
    DOCUMENTO: "CPF/CNPJ",
    ESCOPO_AREA: "Escopo da proposta",
    INVESTIMENTO: "Investimento da proposta",
  };
  for (const key of Object.keys(templatePendingLabels)) {
    if (!(templateData[key] ?? "").trim()) pending.add(templatePendingLabels[key]!);
  }
  if (!params.responsavel.trim()) pending.add("Enviado por");
  return [...pending];
}
