export function contractPortfolioLabels(input: {
  groupName: string | null | undefined;
  legalName: string | null | undefined;
  fallbackTitle: string;
}): { title: string; clientName: string } {
  const groupName = input.groupName?.trim() ?? "";
  const legalName = input.legalName?.trim() ?? "";
  return {
    title: groupName || input.fallbackTitle,
    clientName: legalName || "Cliente pendente",
  };
}
