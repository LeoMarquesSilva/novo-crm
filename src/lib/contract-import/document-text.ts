export function stripD4SignCertificate(text: string): { body: string; d4signUuid: string | null } {
  const uuidMatch = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  const fromUrl = text.match(/d4sign\.com\.br\/verificar[^\n]*?([0-9a-f-]{36})/i);
  const d4signUuid = (fromUrl?.[1] ?? uuidMatch?.[0] ?? null)?.toLowerCase() ?? null;

  const markers = [
    /Certificado de assinaturas gerado em/i,
    /Esse log pertence única e exclusivamente/i,
    /9 páginas - Datas e horários/i,
    /\d+ páginas - Datas e horários/i,
    /\d+ páginas - Datas e horarios/i,
  ];
  let cut = text.length;
  for (const marker of markers) {
    const match = marker.exec(text);
    if (match?.index != null && match.index < cut) cut = match.index;
  }
  return { body: text.slice(0, cut).trim(), d4signUuid };
}

export function extractDocumentIdentifiers(text: string): string[] {
  const found = new Set<string>();
  const cnpj = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;
  const cpf = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
  for (const match of text.matchAll(cnpj)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length === 14) found.add(digits);
  }
  for (const match of text.matchAll(cpf)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length === 11) found.add(digits);
  }
  return [...found];
}
