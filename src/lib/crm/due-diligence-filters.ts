export function matchesDueDiligenceTextQuery(
  lead: {
    leadName: string;
    solicitanteNome: string;
    oportunidadeId: string;
    documents: Array<{ originalFilename: string }>;
  },
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return true;

  return (
    lead.leadName.toLocaleLowerCase("pt-BR").includes(normalized) ||
    lead.solicitanteNome.toLocaleLowerCase("pt-BR").includes(normalized) ||
    lead.oportunidadeId.toLocaleLowerCase("pt-BR").includes(normalized) ||
    lead.documents.some((document) =>
      document.originalFilename.toLocaleLowerCase("pt-BR").includes(normalized),
    )
  );
}
