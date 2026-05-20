/**
 * POST /api/crm/d4sign/import
 * @deprecated Use POST /api/crm/d4sign/vault-sync
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { runVaultSync } from "@/lib/d4sign/vault-sync";

export async function POST() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const result = await runVaultSync({ apiSource: "import" });
    if (!result.ok) {
      return NextResponse.json(
        { ...result, requests_used: result.quota?.used },
        { status: result.rateLimited ? 429 : 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      linked: result.linked,
      unlinked: result.unlinked,
      safe_name: result.safe_name,
      folders_total: result.folders_total,
      folders_walked_this_run: result.folders_walked_this_run,
      folders_remaining: result.folders_remaining,
      docs_with_name: result.docs_with_name,
      docs_with_folder: result.docs_with_folder,
      missing_names: result.missing_names,
      requests_used: result.quota?.used,
      enrich: result.enrich,
      quota: result.quota,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na importação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
