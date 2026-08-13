export function sanitizeFilenameForStorage(name: string): string {
  const base = (name || "documento").trim().replace(/[/\\?%*:|"<>]/g, "_");
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  const stem = ext ? base.slice(0, -ext.length) : base;
  const cleanedStem = stem
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  const cleanedExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
  return `${cleanedStem || "documento"}${cleanedExt}`;
}
