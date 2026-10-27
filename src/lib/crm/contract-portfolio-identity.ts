export function contractPortfolioLabels(input: {
  groupName: string | null | undefined;
  legalName: string | null | undefined;
  fallbackTitle: string;
}): { title: string; clientName: string } {
  const groupName = withoutRepeatedNames(input.groupName);
  const legalName = withoutRepeatedNames(input.legalName);
  return {
    title: groupName || withoutRepeatedNames(input.fallbackTitle) || input.fallbackTitle,
    clientName: legalName || "Cliente pendente",
  };
}

/**
 * Nome com várias partes iguais (matriz e filial gravadas juntas: "EXTRUTECH S/A, EXTRUTECH S/A")
 * aparece uma vez só. Só a exibição muda; o valor gravado continua o mesmo.
 */
export function withoutRepeatedNames(value: string | null | undefined): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of (value ?? "").split(/[,;]/)) {
    const part = raw.trim().replace(/\s+/g, " ");
    const key = part.toLocaleLowerCase("pt-BR");
    if (!part || seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  return parts.join(", ");
}

/** Título (grupo) e razão social iguais — contrato sem grupo: a tela mostra o nome uma vez só. */
export function sameContractLabel(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined) =>
    (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return normalize(a) !== "" && normalize(a) === normalize(b);
}
