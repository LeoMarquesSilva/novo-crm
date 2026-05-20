export function dedupeClientesByDocument<
  T extends { id: string; documento: string; razao_social: string },
>(clientes: T[]): T[] {
  const dedupedMap = new Map<string, T>();

  for (const client of clientes) {
    const normalizedDocument = client.documento.replace(/\D/g, "");
    const key = normalizedDocument || client.id;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, client);
    }
  }

  return Array.from(dedupedMap.values()).sort((a, b) =>
    a.razao_social.localeCompare(b.razao_social, "pt-BR"),
  );
}
