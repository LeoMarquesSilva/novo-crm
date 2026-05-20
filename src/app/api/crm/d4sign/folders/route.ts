/**
 * GET /api/crm/d4sign/folders
 * Lista todas as pastas do cofre D4Sign com nome + uuid.
 * Usa 1 req do endpoint /folders (cota separada dos /documents).
 * Objetivo: identificar quais UUIDs correspondem às pastas-área (Cível, Trabalhista…)
 * para testar se o walk recursivo de L1 retorna docs dos filhos.
 */
import { NextResponse } from "next/server";
import { requireAuthApi } from "@/lib/auth/server";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { D4SignConnector } from "@/modules/crm/infrastructure/integrations/d4sign-client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const env = getD4SignEnv();
    if (!env.tokenApi || !env.safeUuid) {
      return NextResponse.json({ ok: false, error: "D4SIGN não configurado." }, { status: 500 });
    }

    const connector = D4SignConnector.fromEnv(env);
    const folders   = await connector.getFoldersBySafe(env.safeUuid);

    // Busca quais folders já têm docs atribuídos no banco
    const supabase = createSupabaseAdminClient();
    const { data: walked } = await supabase
      .from("d4sign_documents")
      .select("folder_uuid, folder_name")
      .not("folder_uuid", "is", null);

    const walkedUuids = new Set((walked ?? []).map((r) => r.folder_uuid));

    const result = folders
      .map((f) => ({
        uuid:    f.uuid_folder,
        name:    f.name,
        walked:  walkedUuids.has(f.uuid_folder),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    return NextResponse.json({
      ok:      true,
      total:   folders.length,
      walked:  result.filter((f) => f.walked).length,
      folders: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
