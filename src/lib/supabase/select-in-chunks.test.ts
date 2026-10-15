import { describe, expect, it, vi } from "vitest";

import { selectInChunks } from "./select-in-chunks";

describe("selectInChunks", () => {
  it("não consulta quando a lista está vazia", async () => {
    const run = vi.fn();
    await expect(selectInChunks([], run)).resolves.toEqual({ data: [], error: null });
    expect(run).not.toHaveBeenCalled();
  });

  it("quebra em lotes, remove repetidos e junta as linhas", async () => {
    const ids = Array.from({ length: 7 }, (_, i) => `id-${i}`);
    const run = vi.fn(async (chunk: string[]) => ({ data: chunk.map((id) => ({ id })), error: null }));
    const result = await selectInChunks([...ids, "id-0", ""], run, { chunkSize: 3, concurrency: 2 });
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls.map(([chunk]) => chunk.length)).toEqual([3, 3, 1]);
    expect(result.error).toBeNull();
    expect(result.data.map((row) => row.id)).toEqual(ids);
  });

  it("para no primeiro erro", async () => {
    const error = { message: "falhou" };
    const run = vi.fn(async (chunk: string[]) =>
      chunk.includes("b") ? { data: null, error } : { data: chunk.map((id) => ({ id })), error: null },
    );
    const result = await selectInChunks(["a", "b", "c"], run, { chunkSize: 1, concurrency: 1 });
    expect(result.error).toBe(error);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
