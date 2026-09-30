/**
 * PDF válido para cache e visualização: tem bytes e começa com `%PDF`.
 * Corpo vazio, HTML ou JSON da D4Sign não passam.
 */
export function isPdfBytes(data: ArrayBuffer | Uint8Array): boolean {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

type StorageDownloadResult = {
  data: Blob | null;
  error: { message?: string } | null;
};

/**
 * Lê o objeto do bucket. PDF válido é devolvido.
 * Objeto ausente não é apagado. Objeto vazio ou que não começa com `%PDF` é removido.
 */
export async function readCachedPdf(
  storage: {
    download: (path: string) => Promise<StorageDownloadResult>;
    remove: (paths: string[]) => Promise<{ error: { message?: string } | null }>;
  },
  filePath: string,
): Promise<ArrayBuffer | null> {
  const { data, error } = await storage.download(filePath);
  if (error || !data) return null;

  const bytes = await data.arrayBuffer();
  if (isPdfBytes(bytes)) return bytes;

  await storage.remove([filePath]);
  return null;
}
