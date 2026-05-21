/**
 * POST /api/crm/leads/sync-contract-signers
 * Sincroniza assinaturas D4Sign → oportunidades (fallback dev / sync manual).
 * Produção: preferir webhook POSTBack (0 quota) + Realtime em oportunidades.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { enrichDocuments, pickDocumentsToEnrich } from "@/lib/d4sign/enrich-documents";
import {
  getD4SignQuotaStatus,
  isD4SignQuotaExhausted,
} from "@/lib/d4sign/api-usage";
import { getD4SignEnv } from "@/lib/d4sign/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  oportunidadeIds: z.array(z.string().uuid()).max(5).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.issues[0]?.message ?? "Payload inválido." },
        { status: 400 },
      );
    }

    const quota = await getD4SignQuotaStatus();
    if (isD4SignQuotaExhausted(quota)) {
      return NextResponse.json(
        { ok: false, error: "Quota D4Sign esgotada.", quota, synced: 0 },
        { status: 429 },
      );
    }

    const env = getD4SignEnv();
    if (!env.tokenApi) {
      return NextResponse.json({ ok: false, error: "D4SIGN_TOKEN não configurado." }, { status: 500 });
    }

    const supabase = createSupabaseAdminClient();
    let oportunidadeIds = parsed.data.oportunidadeIds ?? [];

    if (oportunidadeIds.length === 0) {
      const { data: rows } = await supabase
        .from("oportunidades")
        .select("id")
        .eq("etapa", "contrato_enviado")
        .not("d4sign_document_uuid", "is", null)
        .order("d4sign_updated_at", { ascending: true })
        .limit(3);
      oportunidadeIds = (rows ?? []).map((r) => String(r.id));
    }

    if (oportunidadeIds.length === 0) {
      return NextResponse.json({ ok: true, synced: 0, items: [] });
    }

    const { data: opRows } = await supabase
      .from("oportunidades")
      .select("id, d4sign_document_uuid")
      .in("id", oportunidadeIds);

    const docsToSync: string[] = [];
    for (const row of opRows ?? []) {
      const uuid = row.d4sign_document_uuid?.trim();
      if (uuid) docsToSync.push(uuid);
    }

    const uniqueDocs = [...new Set(docsToSync)].slice(0, Math.min(3, quota.remaining));
    let synced = 0;
    const items: Array<{ oportunidade_id: string; uuid_doc: string; signers_count: number }> = [];

    for (const uuidDoc of uniqueDocs) {
      const picked = await pickDocumentsToEnrich({ limit: 1, uuidDoc });
      if (picked.length === 0) continue;
      const result = await enrichDocuments(env, picked, { apiSource: "kanban-sync" });
      if (result.enriched > 0) {
        synced += 1;
        const item = result.items[0];
        const oppId = (opRows ?? []).find((r) => r.d4sign_document_uuid === uuidDoc)?.id;
        if (oppId && item) {
          items.push({
            oportunidade_id: String(oppId),
            uuid_doc: item.uuid_doc,
            signers_count: item.signers_count,
          });
        }
      }
      if (isD4SignQuotaExhausted(await getD4SignQuotaStatus())) break;
    }

    return NextResponse.json({
      ok: true,
      synced,
      items,
      quota: await getD4SignQuotaStatus(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar assinaturas.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
