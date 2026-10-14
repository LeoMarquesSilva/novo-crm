import { vi } from "vitest";

type Result = { data: unknown; error: unknown };

export type FakeTableConfig = {
  /** Resultado de `.maybeSingle()`. */
  maybeSingle?: Result | (() => Result);
  /** Resultado de `.single()`. */
  single?: Result | (() => Result);
  /** Resultado quando a cadeia é aguardada direto (`await from(x).insert(...)`, listas). */
  awaited?: Result | (() => Result);
};

const OK: Result = { data: null, error: null };

function resolve(value: Result | (() => Result) | undefined): Result {
  if (!value) return OK;
  return typeof value === "function" ? value() : value;
}

/**
 * Cliente Supabase falso para testes de rota: toda chamada de filtro/escrita devolve a
 * própria cadeia; `maybeSingle`/`single`/`await` devolvem o configurado por tabela.
 * As chamadas ficam registradas em `calls` (tabela, método, argumentos).
 */
export function createSupabaseFake(config: {
  tables?: Record<string, FakeTableConfig>;
  rpc?: Record<string, Result | (() => Result)>;
}) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];

  function chainFor(table: string) {
    const tableConfig = config.tables?.[table] ?? {};
    const chain: Record<string, unknown> = {};
    const record =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    for (const method of [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "neq",
      "in",
      "is",
      "not",
      "or",
      "ilike",
      "gte",
      "lte",
      "gt",
      "lt",
      "order",
      "limit",
      "range",
      "contains",
    ]) {
      chain[method] = vi.fn(record(method));
    }
    chain.maybeSingle = vi.fn(() => {
      calls.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(resolve(tableConfig.maybeSingle));
    });
    chain.single = vi.fn(() => {
      calls.push({ table, method: "single", args: [] });
      return Promise.resolve(resolve(tableConfig.single));
    });
    chain.then = (onFulfilled: (value: Result) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve(tableConfig.awaited)).then(onFulfilled, onRejected);
    return chain;
  }

  const rpc = vi.fn((name: string, args?: unknown) => {
    calls.push({ table: `rpc:${name}`, method: "rpc", args: [args] });
    const result = resolve(config.rpc?.[name]);
    const promise = Promise.resolve(result);
    return Object.assign(promise, { single: () => promise, maybeSingle: () => promise });
  });

  const client = {
    from: vi.fn((table: string) => chainFor(table)),
    rpc,
    storage: { from: vi.fn(() => ({})) },
  };

  return { client, calls, rpc };
}
