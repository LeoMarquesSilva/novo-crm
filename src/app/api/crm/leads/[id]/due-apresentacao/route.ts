import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { parseEmpresasIntakeFromRecord } from "@/lib/crm/parse-lead-intake-empresas";
import { dueAreaFromCrmKey, type DueAreaId } from "@/lib/due-ppt/areas";
import { draftSchema, type DueApresentacaoDraft } from "@/lib/due-ppt/draft";
import { formatarDocumento } from "@/lib/due-ppt/format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Rascunho da apresentação automática da DUE.
 * GET  → rascunho salvo (ou vazio) + sugestões do cadastro (empresas, áreas da DUE).
 * PUT  → grava o rascunho.
 * PATCH { geradoDocumentoId } → registra a última geração (PPT já enviado em due_documents).
 */

function migrationPending(code?: string, message?: string): boolean {
  return code === "42P01" || code === "PGRST205" || /due_apresentacoes/.test(message ?? "");
}

const MIGRATION_MSG =
  "O banco ainda não tem a atualização da apresentação automática (migration 20261020120000). O rascunho não fica salvo até ela ser aplicada.";

async function guard(params: Promise<{ id: string }>) {
  const auth = await requireAuthApi();
  if (!auth.ok) return { error: auth.response } as const;
  if (!["admin", "comercial"].includes(String(auth.profile.role))) {
    return {
      error: NextResponse.json({ ok: false, error: "Apenas comercial ou admin monta a apresentação." }, { status: 403 }),
    } as const;
  }
  const { id } = await params;
  const oportunidadeId = decodeURIComponent(id);
  const supabase = createSupabaseAdminClient();
  const { data: op, error } = await supabase
    .from("oportunidades")
    .select("id, solicitante_nome, havera_due_diligence")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error) return { error: NextResponse.json({ ok: false, error: error.message }, { status: 500 }) } as const;
  if (!op) return { error: NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 }) } as const;
  return { auth, supabase, oportunidadeId, op } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const { supabase, oportunidadeId, op } = g;

  const { data: intake } = await supabase
    .from("lead_intakes")
    .select("empresas_json, areas_analise")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  const empresas = parseEmpresasIntakeFromRecord((intake ?? null) as Record<string, unknown> | null)
    .filter((e) => e.razao_social)
    .map((e) => ({ razaoSocial: e.razao_social.toUpperCase(), cnpj: formatarDocumento(e.documento) }));
  const areasCadastro = [
    ...new Set(
      (Array.isArray(intake?.areas_analise) ? intake!.areas_analise : [])
        .map((a) => dueAreaFromCrmKey(String(a)))
        .filter((a): a is DueAreaId => !!a),
    ),
  ];
  const sugestao = {
    razaoSocial: empresas[0]?.razaoSocial ?? String(op.solicitante_nome ?? "").toUpperCase(),
    cnpj: empresas[0]?.cnpj ?? "",
    empresas: empresas.slice(1, 4),
    areas: areasCadastro,
  };

  const { data: row, error } = await supabase
    .from("due_apresentacoes")
    .select("dados, atualizado_em, gerado_em, gerado_documento_id")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();
  if (error && !migrationPending(error.code, error.message)) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const parsed = row ? draftSchema.safeParse(row.dados) : null;
  return NextResponse.json({
    ok: true,
    draft: parsed?.success ? parsed.data : null,
    atualizadoEm: row?.atualizado_em ?? null,
    geradoEm: row?.gerado_em ?? null,
    geradoDocumentoId: row?.gerado_documento_id ?? null,
    sugestao,
    migrationPending: !!error,
    aviso: error ? MIGRATION_MSG : null,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const body = (await request.json().catch(() => null)) as { draft?: unknown } | null;
  const parsed = draftSchema.safeParse(body?.draft);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Rascunho inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const draft: DueApresentacaoDraft = parsed.data;
  const atualizadoEm = new Date().toISOString();
  const { error } = await g.supabase.from("due_apresentacoes").upsert(
    {
      oportunidade_id: g.oportunidadeId,
      dados: draft as unknown as Json,
      atualizado_em: atualizadoEm,
      atualizado_por_app_user_id: g.auth.profile.id,
    },
    { onConflict: "oportunidade_id" },
  );
  if (error) {
    if (migrationPending(error.code, error.message)) {
      return NextResponse.json({ ok: false, error: MIGRATION_MSG, migrationPending: true }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, atualizadoEm });
}

const patchSchema = z.object({ geradoDocumentoId: z.string().uuid() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if ("error" in g) return g.error;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  const { data: doc } = await g.supabase
    .from("due_documents")
    .select("id")
    .eq("id", parsed.data.geradoDocumentoId)
    .eq("oportunidade_id", g.oportunidadeId)
    .maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
  const geradoEm = new Date().toISOString();
  const { error } = await g.supabase
    .from("due_apresentacoes")
    .update({
      gerado_em: geradoEm,
      gerado_por_app_user_id: g.auth.profile.id,
      gerado_documento_id: doc.id,
    })
    .eq("oportunidade_id", g.oportunidadeId);
  if (error && !migrationPending(error.code, error.message)) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, geradoEm });
}
