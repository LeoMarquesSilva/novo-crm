/**
 * POST /api/crm/d4sign/link-lead
 * Vincula (ou desvincula) um documento do cofre a uma oportunidade do CRM.
 * Body: { uuid_doc, oportunidade_id | null }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  uuid_doc: z.string().uuid(),
  oportunidade_id: z.string().uuid().nullable(),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Apenas admin/comercial." }, { status: 403 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
    }

    const { uuid_doc, oportunidade_id } = parsed.data;
    const supabase = createSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    const { data: doc } = await supabase
      .from("d4sign_documents")
      .select("uuid_doc, name_document")
      .eq("uuid_doc", uuid_doc)
      .maybeSingle();

    if (!doc) {
      return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
    }

    if (oportunidade_id) {
      const { data: opp, error: oppErr } = await supabase
        .from("oportunidades")
        .select("id, solicitante_nome, d4sign_document_uuid")
        .eq("id", oportunidade_id)
        .maybeSingle();
      if (oppErr) throw oppErr;
      if (!opp) {
        return NextResponse.json({ ok: false, error: "Oportunidade não encontrada." }, { status: 404 });
      }

      await supabase
        .from("d4sign_documents")
        .update({ oportunidade_id, updated_at: nowIso })
        .eq("uuid_doc", uuid_doc);

      await supabase
        .from("oportunidades")
        .update({
          d4sign_document_uuid: uuid_doc,
          d4sign_updated_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", oportunidade_id);

      return NextResponse.json({
        ok: true,
        uuid_doc,
        oportunidade_id,
        solicitante_nome: opp.solicitante_nome,
      });
    }

    // Desvincular
    await supabase
      .from("d4sign_documents")
      .update({ oportunidade_id: null, updated_at: nowIso })
      .eq("uuid_doc", uuid_doc);

    await supabase
      .from("oportunidades")
      .update({ d4sign_document_uuid: null, updated_at: nowIso })
      .eq("d4sign_document_uuid", uuid_doc);

    return NextResponse.json({ ok: true, uuid_doc, oportunidade_id: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao vincular.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * GET /api/crm/d4sign/link-lead?q=...
 * Busca oportunidades para vincular manualmente.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("oportunidades")
      .select("id, solicitante_nome, etapa, d4sign_document_uuid")
      .ilike("solicitante_nome", `%${q}%`)
      .order("updated_at", { ascending: false })
      .limit(15);

    if (error) throw error;

    return NextResponse.json({ ok: true, results: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na busca.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
