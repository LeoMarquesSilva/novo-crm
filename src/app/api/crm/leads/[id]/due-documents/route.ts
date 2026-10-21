import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAuthApi } from "@/lib/auth/server";
import { montarNomesArquivoDueUpload } from "@/lib/crm/due-document-filename";
import { DUE_AREAS, DUE_AREA_IDS, type DueAreaId } from "@/lib/due-ppt/areas";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "due-documents";

type DocumentKind = "ppt_compilacao" | "planilha_area" | "logo_cliente";

const KINDS: Record<
  DocumentKind,
  { extensions: Record<string, string>; maxBytes: number; folder: string; label: string }
> = {
  ppt_compilacao: {
    extensions: {
      ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".ppt": "application/vnd.ms-powerpoint",
    },
    maxBytes: 52 * 1024 * 1024,
    folder: "",
    label: "Apenas arquivos .ppt ou .pptx são aceitos.",
  },
  planilha_area: {
    extensions: { ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    maxBytes: 25 * 1024 * 1024,
    folder: "planilhas/",
    label: "Envie a planilha em .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel).",
  },
  logo_cliente: {
    extensions: { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" },
    maxBytes: 5 * 1024 * 1024,
    folder: "logo/",
    label: "O logo deve ser .png ou .jpg.",
  },
};

const SELECT_COLUMNS =
  "id, document_kind, area_key, original_filename, content_type, byte_size, uploaded_at, uploaded_by_app_user_id";

function parseKind(raw: unknown): DocumentKind | null {
  if (raw == null || raw === "") return "ppt_compilacao";
  return typeof raw === "string" && raw in KINDS ? (raw as DocumentKind) : null;
}

function parseArea(raw: unknown): DueAreaId | null {
  return typeof raw === "string" && (DUE_AREA_IDS as readonly string[]).includes(raw) ? (raw as DueAreaId) : null;
}

function extensionFor(kind: DocumentKind, filename: string): string | null {
  const m = /\.[A-Za-z0-9]+$/.exec(filename.trim());
  const ext = m ? m[0].toLowerCase() : "";
  return ext in KINDS[kind].extensions ? ext : null;
}

/** Erro de banco que indica a migration da apresentação automática ainda não aplicada. */
function isMigrationPending(message: string | undefined, code?: string): boolean {
  return (
    code === "23514" ||
    code === "42703" ||
    /area_key|document_kind_check/.test(message ?? "")
  );
}

type AuthOk = Extract<Awaited<ReturnType<typeof requireAuthApi>>, { ok: true }>;

/**
 * Comercial/admin enviam qualquer arquivo; o responsável pela área no levantamento
 * pode enviar (e tirar) a planilha da própria área.
 */
async function canHandleArea(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  auth: AuthOk,
  oportunidadeId: string,
  kind: DocumentKind,
  area: DueAreaId | null,
): Promise<boolean> {
  const role = String(auth.profile?.role ?? "");
  if (role === "admin" || role === "comercial") return true;
  if (kind !== "planilha_area" || !area || !auth.profile?.id) return false;
  const { data } = await supabase
    .from("due_area_tasks")
    .select("area_key, responsavel_app_user_id")
    .eq("oportunidade_id", oportunidadeId)
    .eq("responsavel_app_user_id", auth.profile.id);
  const crmKey = DUE_AREAS[area].crmAreaKey;
  return (data ?? []).some((t) => String(t.area_key) === crmKey);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
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

    const role = String(auth.profile.role);
    const isComercial = role === "admin" || role === "comercial";

    const docId = request.nextUrl.searchParams.get("documentId");
    if (docId) {
      const { data: doc, error: docErr } = await supabase
        .from("due_documents")
        .select("*")
        .eq("id", docId)
        .eq("oportunidade_id", oportunidadeId)
        .maybeSingle();
      if (docErr) throw docErr;
      if (!doc) return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
      const area = parseArea((doc as { area_key?: string | null }).area_key);
      if (!isComercial && !(await canHandleArea(supabase, auth, oportunidadeId, "planilha_area", area))) {
        return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
      }

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

    if (!isComercial) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    let { data: rows, error: listErr } = await supabase
      .from("due_documents")
      .select(SELECT_COLUMNS)
      .eq("oportunidade_id", oportunidadeId)
      .order("uploaded_at", { ascending: false });
    if (listErr && isMigrationPending(listErr.message, listErr.code)) {
      // Sem a coluna area_key ainda: lista sem ela.
      const fallback = await supabase
        .from("due_documents")
        .select("id, document_kind, original_filename, content_type, byte_size, uploaded_at, uploaded_by_app_user_id")
        .eq("oportunidade_id", oportunidadeId)
        .order("uploaded_at", { ascending: false });
      rows = (fallback.data ?? []).map((r) => ({ ...r, area_key: null }));
      listErr = fallback.error;
    }
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
 *
 * `kind`: `ppt_compilacao` (padrão), `planilha_area` (+ `areaKey`) ou `logo_cliente`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
    }
    const body = (json ?? {}) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    const kind = parseKind(body.kind);
    if (!kind) return NextResponse.json({ ok: false, error: "Tipo de documento inválido." }, { status: 400 });
    const area = kind === "planilha_area" ? parseArea(body.areaKey) : null;
    if (kind === "planilha_area" && !area) {
      return NextResponse.json({ ok: false, error: "Informe a área da planilha." }, { status: 400 });
    }
    if (!(await canHandleArea(supabase, auth, oportunidadeId, kind, area))) {
      return NextResponse.json(
        { ok: false, error: "Apenas comercial, admin ou o responsável da área pode enviar este arquivo." },
        { status: 403 },
      );
    }
    const spec = KINDS[kind];

    if (action === "create-upload-url") {
      const filename = typeof body.filename === "string" ? body.filename.trim() : "";
      if (!filename) {
        return NextResponse.json({ ok: false, error: "Informe o nome do arquivo." }, { status: 400 });
      }
      const ext = extensionFor(kind, filename);
      if (!ext) return NextResponse.json({ ok: false, error: spec.label }, { status: 422 });
      const storagePath = `${oportunidadeId}/${spec.folder}${randomUUID()}${ext}`;
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
        contentType: spec.extensions[ext],
      });
    }

    if (action === "confirm") {
      const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : "";
      const originalFilename =
        typeof body.originalFilename === "string" ? body.originalFilename.trim() : "";
      if (!storagePath || !storagePath.startsWith(`${oportunidadeId}/${spec.folder}`)) {
        return NextResponse.json({ ok: false, error: "Caminho de upload inválido." }, { status: 400 });
      }
      if (!originalFilename) {
        return NextResponse.json({ ok: false, error: "Informe o nome do arquivo." }, { status: 400 });
      }
      const ext = extensionFor(kind, originalFilename);
      if (!ext || !storagePath.toLowerCase().endsWith(ext)) {
        return NextResponse.json({ ok: false, error: spec.label }, { status: 422 });
      }

      const { data: info, error: infoErr } = await supabase.storage.from(BUCKET).info(storagePath);
      if (infoErr || !info) {
        return NextResponse.json(
          { ok: false, error: "Upload não encontrado no Storage. Tente novamente." },
          { status: 422 },
        );
      }
      const byteSize = info.size ?? 0;
      if (byteSize <= 0 || byteSize > spec.maxBytes) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return NextResponse.json(
          { ok: false, error: `Arquivo muito grande (máx. ${Math.round(spec.maxBytes / 1024 / 1024)} MB).` },
          { status: 422 },
        );
      }

      const nomeExibicao =
        kind === "ppt_compilacao" ? montarNomesArquivoDueUpload(originalFilename).nomeExibicao : originalFilename.slice(0, 240);

      const { data: inserted, error: insErr } = await supabase
        .from("due_documents")
        .insert({
          oportunidade_id: oportunidadeId,
          document_kind: kind,
          ...(area ? { area_key: area } : {}),
          storage_bucket: BUCKET,
          storage_path: storagePath,
          original_filename: nomeExibicao,
          content_type: spec.extensions[ext],
          byte_size: byteSize,
          uploaded_by_app_user_id: auth.profile.id,
        })
        .select(SELECT_COLUMNS)
        .single();

      if (insErr) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        if (kind !== "ppt_compilacao" && isMigrationPending(insErr.message, insErr.code)) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "O banco ainda não tem a atualização da apresentação automática (migration 20261020120000). Peça ao admin para aplicá-la.",
            },
            { status: 409 },
          );
        }
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

/** Remove planilha de área ou logo (o PPT de compilação fica como histórico). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    const { id: rawId } = await params;
    const oportunidadeId = decodeURIComponent(rawId);
    const docId = request.nextUrl.searchParams.get("documentId") ?? "";
    if (!docId) return NextResponse.json({ ok: false, error: "Informe o documento." }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: doc, error: docErr } = await supabase
      .from("due_documents")
      .select("id, document_kind, area_key, storage_bucket, storage_path")
      .eq("id", docId)
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (docErr) throw docErr;
    if (!doc) return NextResponse.json({ ok: false, error: "Documento não encontrado." }, { status: 404 });
    const kind = parseKind(doc.document_kind);
    if (kind !== "planilha_area" && kind !== "logo_cliente") {
      return NextResponse.json(
        { ok: false, error: "Só planilhas e logo podem ser removidos aqui." },
        { status: 422 },
      );
    }
    if (!(await canHandleArea(supabase, auth, oportunidadeId, kind, parseArea(doc.area_key)))) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }
    const { error: delErr } = await supabase.from("due_documents").delete().eq("id", doc.id);
    if (delErr) throw delErr;
    await supabase.storage.from(doc.storage_bucket || BUCKET).remove([doc.storage_path]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover o arquivo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
