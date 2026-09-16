import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

import { createSupabaseAdminClient } from "../src/lib/supabase/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, "..", ".env") });

type StorageFinding = {
  bucket: string;
  path: string;
  status: "available" | "missing" | "orphan";
  source: "due_documents" | "document_versions" | "storage";
  recordId: string | null;
};

async function listBucketFiles(bucket: string): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient();
  const files = new Set<string>();

  const visit = async (prefix: string): Promise<void> => {
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(`Falha ao listar ${bucket}/${prefix}: ${error.message}`);

      for (const item of data ?? []) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id) files.add(path);
        else await visit(path);
      }

      if ((data ?? []).length < limit) break;
      offset += limit;
    }
  };

  await visit("");
  return files;
}

function findingsForSource(
  bucket: string,
  rows: Array<{ id: string; path: string | null }>,
  objects: Set<string>,
  source: "due_documents" | "document_versions",
): StorageFinding[] {
  return rows
    .filter((row): row is { id: string; path: string } => Boolean(row.path?.trim()))
    .map((row) => ({
      bucket,
      path: row.path,
      status: objects.has(row.path) ? "available" : "missing",
      source,
      recordId: row.id,
    }));
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const [{ data: dueRows, error: dueError }, { data: versionRows, error: versionError }] =
    await Promise.all([
      supabase.from("due_documents").select("id, storage_bucket, storage_path"),
      supabase
        .from("document_versions")
        .select("id, generated_file_path")
        .not("generated_file_path", "is", null),
    ]);
  if (dueError) throw dueError;
  if (versionError) throw versionError;

  const dueBuckets = [
    ...new Set((dueRows ?? []).map((row) => row.storage_bucket || "due-documents")),
  ];
  const bucketNames = [...new Set([...dueBuckets, "generated-documents"])];
  const objectsByBucket = new Map<string, Set<string>>();
  for (const bucket of bucketNames) {
    objectsByBucket.set(bucket, await listBucketFiles(bucket));
  }

  const findings: StorageFinding[] = [];
  for (const bucket of dueBuckets) {
    findings.push(
      ...findingsForSource(
        bucket,
        (dueRows ?? [])
          .filter((row) => (row.storage_bucket || "due-documents") === bucket)
          .map((row) => ({ id: row.id, path: row.storage_path })),
        objectsByBucket.get(bucket) ?? new Set(),
        "due_documents",
      ),
    );
  }
  findings.push(
    ...findingsForSource(
      "generated-documents",
      (versionRows ?? []).map((row) => ({
        id: row.id,
        path: row.generated_file_path,
      })),
      objectsByBucket.get("generated-documents") ?? new Set(),
      "document_versions",
    ),
  );

  const referencedByBucket = new Map<string, Set<string>>();
  for (const finding of findings) {
    const paths = referencedByBucket.get(finding.bucket) ?? new Set<string>();
    paths.add(finding.path);
    referencedByBucket.set(finding.bucket, paths);
  }
  for (const [bucket, objects] of objectsByBucket) {
    const referenced = referencedByBucket.get(bucket) ?? new Set<string>();
    for (const path of objects) {
      if (!referenced.has(path)) {
        findings.push({
          bucket,
          path,
          status: "orphan",
          source: "storage",
          recordId: null,
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    destructiveChanges: false,
    summary: {
      available: findings.filter((finding) => finding.status === "available").length,
      missing: findings.filter((finding) => finding.status === "missing").length,
      orphan: findings.filter((finding) => finding.status === "orphan").length,
    },
    findings,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (outputArg) {
    const outputPath = resolve(process.cwd(), outputArg.slice("--output=".length));
    await writeFile(outputPath, json, "utf8");
    console.log(`Relatório salvo em ${outputPath}`);
  } else {
    process.stdout.write(json);
  }
  if (report.summary.missing > 0 || report.summary.orphan > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
