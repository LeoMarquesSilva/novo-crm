/**
 * O PostgREST leva o filtro `.in(col, [...])` na URL e devolve a mesma URL no cabeçalho
 * `Content-Location`. Com algumas centenas de UUIDs a resposta passa de 16 KB de cabeçalho e
 * o fetch do Node falha (`UND_ERR_HEADERS_OVERFLOW`). Aqui a lista é quebrada em lotes.
 */
export const IN_FILTER_CHUNK_SIZE = 150;
const IN_FILTER_CONCURRENCY = 4;

type ChunkResult<Row, E> = { data: Row[] | null; error: E | null };

export async function selectInChunks<Row, E = unknown>(
  values: readonly string[],
  run: (chunk: string[]) => PromiseLike<ChunkResult<Row, E>>,
  options: { chunkSize?: number; concurrency?: number } = {},
): Promise<{ data: Row[]; error: E | null }> {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length === 0) return { data: [], error: null };
  const chunkSize = Math.max(1, options.chunkSize ?? IN_FILTER_CHUNK_SIZE);
  const concurrency = Math.max(1, options.concurrency ?? IN_FILTER_CONCURRENCY);

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));

  const data: Row[] = [];
  for (let i = 0; i < chunks.length; i += concurrency) {
    const results = await Promise.all(chunks.slice(i, i + concurrency).map((chunk) => run(chunk)));
    for (const result of results) {
      if (result.error) return { data, error: result.error };
      data.push(...(result.data ?? []));
    }
  }
  return { data, error: null };
}
