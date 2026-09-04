import { stripInvestimentoSectionHeading, type CanonicalProposalData } from "./proposta-docx-data";

/** Only semantic style references live here; typography lives in the Word template. */
function escapeXml(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function run(text: string, style?: string): string {
  return `<w:r>${style ? `<w:rPr><w:rStyle w:val="${style}"/></w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(style: string, content: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${content}</w:p>`;
}

export function buildPropostaWordBlocks(data: CanonicalProposalData): { scope: string; investment: string } {
  const scope: string[] = [];
  let lastArea = "";
  for (const section of data.escopoSections) {
    if (section.areaLabel !== lastArea) {
      scope.push(paragraph("BPScopeArea", run(section.areaLabel)));
      lastArea = section.areaLabel;
    }
    const blocks = section.text.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
    blocks.forEach((text, i) => scope.push(paragraph("BPScopeBody",
      (i === 0 && section.scopeTypeLabel ? run(`${section.scopeTypeLabel}: `, "BPScopeItem") : "") + run(text))));
  }
  const text = stripInvestimentoSectionHeading(data.templateData.INVESTIMENTO ?? "");
  const investment = text ? [
    paragraph("BPInvestmentTitle", run("Investimento")),
    ...text.split(/\n\s*\n/).map(p => paragraph("BPInvestmentBody", run(p.trim()))),
  ].join("") : "";
  return { scope: scope.join(""), investment };
}
