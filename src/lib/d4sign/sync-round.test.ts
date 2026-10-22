import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SYNC_ROUND_ENDPOINT,
  runD4SignSyncRound,
  runD4SignSyncRoundIfStale,
} from "./sync-round";

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/d4sign/env", () => ({
  getD4SignEnv: () => ({ tokenApi: "token", safeUuid: "cofre" }),
}));
vi.mock("@/lib/d4sign/webhook-registration", () => ({ ensureSafeWebhookV2: vi.fn(async () => null) }));
vi.mock("@/lib/d4sign/api-usage", () => ({ getD4SignQuotaStatus: vi.fn(async () => ({ remaining: 0 })) }));
vi.mock("@/lib/d4sign/vault-folder-walk", () => ({
  peekVaultFolderWalk: vi.fn(async () => ({ catalogued: true, folders: [] })),
  runVaultFolderWalk: vi.fn(),
}));
vi.mock("@/lib/d4sign/vault-folder-walk-plan", () => ({ foldersLeftInWalk: () => 0 }));
// Cota zerada: a rodada que ganha a marca para logo depois, sem chamar a D4Sign.
vi.mock("@/lib/d4sign/sync-budget", () => ({
  D4SIGN_HUMAN_RESERVE: { safe: 2 },
  planD4SignSyncBudget: () => ({ phases: 0, enrich: 0, listing: 0, folders: 0, pdfLogs: 0 }),
}));
vi.mock("@/lib/d4sign/enrich-documents", () => ({ enrichDocuments: vi.fn(), pickDocumentsToEnrich: vi.fn() }));
vi.mock("@/lib/d4sign/pending-backfill", () => ({ runPendingSignatureBackfill: vi.fn() }));
vi.mock("@/lib/d4sign/pdf-log-sync", () => ({ collectD4SignPdfLogs: vi.fn() }));
vi.mock("@/lib/d4sign/signed-pdf-cache", () => ({ cacheSignedOpportunityPdfs: vi.fn() }));
vi.mock("@/lib/d4sign/vault-listing", () => ({ runVaultSafeListing: vi.fn() }));

type UsageRow = { id: number; endpoint: string; source: string | null; created_at: string };

/** `d4sign_api_usage` em memória, só com o que a rodada usa do supabase-js. */
function fakeUsageTable(seed: Array<Omit<UsageRow, "id">> = []) {
  const rows: UsageRow[] = seed.map((row, i) => ({ id: i + 1, ...row }));
  let nextId = rows.length + 1;

  function query() {
    let op: "select" | "insert" | "delete" = "select";
    let inserted: UsageRow | null = null;
    const filters: Array<(row: UsageRow) => boolean> = [];
    let orderBy: { col: keyof UsageRow; ascending: boolean } | null = null;
    let limit = Infinity;

    const run = () => {
      if (op === "insert") return { data: inserted, error: null };
      const matched = rows.filter((row) => filters.every((f) => f(row)));
      if (op === "delete") {
        for (const row of matched) rows.splice(rows.indexOf(row), 1);
        return { data: null, error: null };
      }
      if (orderBy) {
        const { col, ascending } = orderBy;
        const key = (row: UsageRow) => row[col] as string | number;
        matched.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (ascending ? 1 : -1));
      }
      return { data: matched.slice(0, limit), error: null };
    };

    const builder = {
      insert(payload: { endpoint: string; source: string | null }) {
        op = "insert";
        inserted = { id: nextId++, endpoint: payload.endpoint, source: payload.source, created_at: new Date().toISOString() };
        rows.push(inserted);
        return builder;
      },
      select() {
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(col: keyof UsageRow, value: unknown) {
        filters.push((row) => row[col] === value);
        return builder;
      },
      gt(col: keyof UsageRow, value: string) {
        filters.push((row) => String(row[col]) > value);
        return builder;
      },
      order(col: keyof UsageRow, opts: { ascending: boolean }) {
        orderBy = { col, ascending: opts.ascending };
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      async single() {
        return run();
      },
      async maybeSingle() {
        const { data, error } = run();
        return { data: Array.isArray(data) ? (data[0] ?? null) : data, error };
      },
      then(resolve: (value: ReturnType<typeof run>) => unknown) {
        return Promise.resolve(run()).then(resolve);
      },
    };
    return builder;
  }

  vi.mocked(createSupabaseAdminClient).mockReturnValue({ from: () => query() } as never);
  return rows;
}

const minutesAgo = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

beforeEach(() => vi.clearAllMocks());

describe("trava da rodada do sync D4Sign", () => {
  it("duas rodadas ao mesmo tempo: só a primeira roda e a outra apaga a própria marca", async () => {
    const rows = fakeUsageTable();

    const [a, b] = await Promise.all([
      runD4SignSyncRound("crm-navigation"),
      runD4SignSyncRound("crm-navigation"),
    ]);

    expect(a.skipped).toBeUndefined();
    expect(b.skipped).toBe(true);
    expect(rows.filter((row) => row.endpoint === SYNC_ROUND_ENDPOINT)).toHaveLength(1);
  });

  it("rodada marcada há 3 min: o cron não roda outra", async () => {
    const rows = fakeUsageTable([{ endpoint: SYNC_ROUND_ENDPOINT, source: "crm-navigation", created_at: minutesAgo(3) }]);

    const result = await runD4SignSyncRound("github-actions");

    expect(result.skipped).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("rodada marcada há 5 min: roda", async () => {
    const rows = fakeUsageTable([{ endpoint: SYNC_ROUND_ENDPOINT, source: "crm-navigation", created_at: minutesAgo(5) }]);

    const result = await runD4SignSyncRound("github-actions");

    expect(result.skipped).toBeUndefined();
    expect(rows).toHaveLength(2);
  });

  it("navegação com rodada recente nem grava marca", async () => {
    const rows = fakeUsageTable([{ endpoint: SYNC_ROUND_ENDPOINT, source: "crm-navigation", created_at: minutesAgo(1) }]);

    await runD4SignSyncRoundIfStale("crm-navigation");

    expect(rows).toHaveLength(1);
  });
});
