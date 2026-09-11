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

const MAX_BYTES = 52 * 1024 * 1024;

function contentTypeForExtension(extensao: string, declaredType: string): string {
  if (declaredType && ALLOWED_TYPES.has(declaredType)) return declaredType;
  return extensao === ".pptx"
    ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    : "application/vnd.ms-powerpoint";
}

function validateFilename(nomeOriginalUpload: string): { extensao: string } | { error: string } {
  if (!/\.(ppt|pptx)$/i.test(nomeOriginalUpload.trim())) {
    return { error: "Apenas arquivos .ppt ou .pptx são aceitos." };
  }
  const { extensao } = montarNomesArquivoDueUpload(nomeOriginalUpload);
  if (extensao !== ".ppt" && extensao !== ".pptx") {
    return { error: "Apenas arquivos .ppt ou .pptx são aceitos." };
  }
  return { extensao };
}

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

/**
 * Upload em duas etapas (URL assinada + confirmação), em vez de mandar os bytes
 * pela própria função serverless: funções Node no Vercel têm limite de corpo de
 * requisição de ~4,5 MB — um PPT de compilação passa disso fácil. O navegador
 * envia o arquivo direto pro Storage; esta rota só emite a URL assinada e, depois,
 * confirma o que realmente chegou lá (nunca confia em tamanho/tipo que o cliente
 * diga — relê do próprio Storage antes de gravar `due_documents`).
 */
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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
    }
    const body = (json ?? {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "create-upload-url") {
      const filename = typeof body.filename === "string" ? body.filename.trim() : "";
      if (!filename) {
        return NextResponse.json({ ok: false, error: "Informe o nome do arquivo." }, { status: 400 });
      }
      const validated = validateFilename(filename);
      if ("error" in validated) {
        return NextResponse.json({ ok: false, error: validated.error }, { status: 422 });
      }
      const declaredType = typeof body.contentType === "string" ? body.contentType.trim() : "";
      if (declaredType && !ALLOWED_TYPES.has(declaredType)) {
        return NextResponse.json(
          { ok: false, error: "Tipo de arquivo não suportado para DUE." },
          { status: 422 },
        );
      }
      const storagePath = `${oportunidadeId}/${randomUUID()}${validated.extensao}`;
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath);
      if (signErr || !signed) {
        return NextResponse.json(
          { ok: false, error: signErr?.message ?? "Não foi possível preparar o upload." },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        uploadUrl: signed.signedUrl,
        token: signed.token,
        storagePath,
        contentType: contentTypeForExtension(validated.extensao, declaredType),
      });
    }

    if (action === "confirm") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
      const originalFilename =
        typeof body.originalFilename === "string" ? body.originalFilename.trim() : "";
      if (!storagePath || !storagePath.startsWith(`${oportunidadeId}/`)) {
        return NextResponse.json({ ok: false, error: "Caminho de upload inválido." }, { status: 400 });
      }
      if (!originalFilename) {
        return NextResponse.json({ ok: false, error: "Informe o nome do arquivo." }, { status: 400 });
      }
      const validated = validateFilename(originalFilename);
      if ("error" in validated) {
        return NextResponse.json({ ok: false, error: validated.error }, { status: 422 });
      }

      const { data: info, error: infoErr } = await supabase.storage.from(BUCKET).info(storagePath);
      if (infoErr || !info) {
        return NextResponse.json(
          { ok: false, error: "Upload não encontrado no Storage. Tente novamente." },
          { status: 422 },
        );
      }
      const byteSize = info.size ?? 0;
      if (byteSize <= 0 || byteSize > MAX_BYTES) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return NextResponse.json({ ok: false, error: "Arquivo muito grande (máx. 52 MB)." }, { status: 422 });
      }

      const { nomeExibicao } = montarNomesArquivoDueUpload(originalFilename);
      const contentType = contentTypeForExtension(validated.extensao, info.contentType ?? "");

      const { data: inserted, error: insErr } = await supabase
        .from("due_documents")
        .insert({
          oportunidade_id: oportunidadeId,
          document_kind: "ppt_compilacao",
          storage_bucket: BUCKET,
          storage_path: storagePath,
          original_filename: nomeExibicao,
          content_type: contentType,
          byte_size: byteSize,
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
    }

    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no upload.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
