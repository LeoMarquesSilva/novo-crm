const EXT_PPT = /\.(pptx|ppt)$/i;

/** Sanitiza segmento de nome de arquivo (Windows/macOS seguro). */
export function sanitizarNomeArquivoDue(base: string): string {
  const t = base
    .replace(EXT_PPT, "")
    .replace(/[^a-zA-ZÀ-ÿ0-9._\-\s]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .trim();
  return t.slice(0, 100) || "DUE";
}

/**
 * Padrão: `{nomeBase}_{dd-MM-aaaa_HH'h'mm}`.{ext}
 * Data/hora no fuso América/São_Paulo (pt-BR).
 */
export function montarNomesArquivoDueUpload(
  nomeOriginal: string,
  dataUpload: Date = new Date(),
): { nomeExibicao: string; sufixoData: string; extensao: string } {
  const m = nomeOriginal.trim().match(EXT_PPT);
  const extensao = m ? `.${m[1]!.toLowerCase()}` : "";
  const base = sanitizarNomeArquivoDue(nomeOriginal);

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(dataUpload);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "";
  const dd = get("day");
  const mm = get("month");
  const yy = get("year");
  const HH = get("hour");
  const min = get("minute");
  const sufixoData = `${dd}-${mm}-${yy}_${HH}h${min}`;
  const nomeExibicao = `${base}_${sufixoData}${extensao}`;

  return { nomeExibicao, sufixoData, extensao };
}
