import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuthApi } from "@/lib/auth/server";
import { montarNomesArquivoDueUpload } from "@/lib/crm/due-document-filename";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "due-documents";

const ALLOWED_TYPES = new Set([
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const docId = request.nextUrl.searchParams.get("documentId");
    if (docId) {
      const { data: doc, error: docErr } = await supabase
        .from("due_documents")
        .select("id, storage_bucket, storage_path, oportunidade_id")
        .eq("id", docId)
        .eq("oportunidade_id", oportunidadeId)
        .maybeSingle();
      if (docErr) throw docErr;
      if (!doc) return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });

      const { data: signed, error: signErr } = await supabase.storage
        .from(doc.storage_bucket || BUCKET)
        .createSignedUrl(doc.storage_path, 120);
      if (signErr || !signed?.signedUrl) {
        return NextResponse.json(
          { ok: false, error: signErr?.message ?? "Não foi possível gerar URL de download." },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, signedUrl: signed.signedUrl });
    }

    const { data: rows, error: listErr } = await supabase
      .from("due_documents")
      .select(
        "id, document_kind, original_filename, content_type, byte_size, uploaded_at, uploaded_by_app_user_id",
      )
      .eq("oportunidade_id", oportunidadeId)
      .order("uploaded_at", { ascending: false });
    if (listErr) throw listErr;

    return NextResponse.json({ ok: true, documents: rows ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar documentos DUE.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile || !["admin", "comercial"].includes(String(auth.profile.role))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial ou admin pode enviar arquivos." },
        { status: 403 },
      );
    }

    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const supabase = createSupabaseAdminClient();

    const { data: op, error: opErr } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", oportunidadeId)
      .maybeSingle();
    if (opErr) throw opErr;
    if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Envie o arquivo no campo \"file\"." }, { status: 400 });
    }

    const nomeOriginalUpload = file.name || "apresentacao.pptx";
    if (!/\.(ppt|pptx)$/i.test(nomeOriginalUpload.trim())) {
      return NextResponse.json(
        { ok: false, error: "Apenas arquivos .ppt ou .pptx são aceitos." },
        { status: 422 },
      );
    }
    const quandoSalvo = new Date();
    const { nomeExibicao, sufixoData, extensao } = montarNomesArquivoDueUpload(nomeOriginalUpload, quandoSalvo);
    if (extensao !== ".ppt" && extensao !== ".pptx") {
      return NextResponse.json(
        { ok: false, error: "Apenas arquivos .ppt ou .pptx são aceitos." },
        { status: 422 },
      );
    }

    const declaredType = (file.type || "").trim();
    if (declaredType && !ALLOWED_TYPES.has(declaredType)) {
      return NextResponse.json(
        { ok: false, error: "Tipo de arquivo não suportado para DUE." },
        { status: 422 },
      );
    }

    const maxBytes = 52 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: "Arquivo muito grande (máx. 52 MB)." },
        { status: 422 },
      );
    }

    const storagePath = `${oportunidadeId}/${randomUUID()}_${sufixoData}${extensao}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType:
        declaredType && ALLOWED_TYPES.has(declaredType)
          ? declaredType
          : extensao === ".pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/vnd.ms-powerpoint",
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    const contentType =
      declaredType && ALLOWED_TYPES.has(declaredType)
        ? declaredType
        : extensao === ".pptx"
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : "application/vnd.ms-powerpoint";

    const { data: inserted, error: insErr } = await supabase
      .from("due_documents")
      .insert({
        oportunidade_id: oportunidadeId,
        document_kind: "ppt_compilacao",
        storage_bucket: BUCKET,
        storage_path: storagePath,
        original_filename: nomeExibicao,
        content_type: contentType,
        byte_size: file.size,
        uploaded_by_app_user_id: auth.profile.id,
      })
      .select(
        "id, document_kind, original_filename, content_type, byte_size, uploaded_at, uploaded_by_app_user_id",
      )
      .single();

    if (insErr) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, document: inserted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
