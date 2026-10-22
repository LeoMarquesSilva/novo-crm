import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Modelos da apresentação automática da DUE (bucket due-documents, pasta modelos/).
 *
 * GET               → lista (o ativo primeiro). Sem nenhum modelo, sobe o padrão do
 *                     repositório (templates/due/MODELO-DUE-CRM.pptx) e o marca como ativo.
 * GET ?download=ID  → URL assinada do modelo (ID ou "ativo").
 * POST (admin)      → { action: "create-upload-url", filename } | { action: "confirm", storagePath, originalFilename, observacao? }
 * PATCH (admin)     → { id } ativa um modelo anterior.
 */

export const maxDuration = 60;

const BUCKET = "due-documents";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const MAX_BYTES = 80 * 1024 * 1024;
const PADRAO_ARQUIVO = "MODELO-DUE-CRM.pptx";
const PADRAO_PATH_SEM_TABELA = "modelos/padrao-crm.pptx";

type Modelo = {
  id: string;
  nomeArquivo: string;
  byteSize: number | null;
  observacao: string | null;
  ativo: boolean;
  enviadoEm: string;
  enviadoPor: string | null;
  storagePath: string;
};

function tabelaAusente(code?: string, message?: string): boolean {
  return code === "42P01" || code === "PGRST205" || /due_modelos_apresentacao/.test(message ?? "");
}

async function lerPadraoDoRepositorio(): Promise<Buffer> {
  return readFile(path.join(process.cwd(), "templates", "due", PADRAO_ARQUIVO));
}

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function listar(supabase: Admin): Promise<{ modelos: Modelo[]; semTabela: boolean }> {
  const { data, error } = await supabase
    .from("due_modelos_apresentacao")
    .select("id, nome_arquivo, byte_size, observacao, ativo, enviado_em, storage_path, enviado_por:app_users!due_modelos_apresentacao_enviado_por_app_user_id_fkey ( full_name )")
    .order("ativo", { ascending: false })
    .order("enviado_em", { ascending: false })
    .limit(30);
  if (error) {
    if (tabelaAusente(error.code, error.message)) return { modelos: [], semTabela: true };
    throw error;
  }
  return {
    semTabela: false,
    modelos: (data ?? []).map((r) => {
      const por = r.enviado_por as { full_name: string | null } | { full_name: string | null }[] | null;
      const nome = Array.isArray(por) ? por[0]?.full_name : por?.full_name;
      return {
        id: r.id,
        nomeArquivo: r.nome_arquivo,
        byteSize: r.byte_size != null ? Number(r.byte_size) : null,
        observacao: r.observacao,
        ativo: r.ativo,
        enviadoEm: r.enviado_em,
        enviadoPor: nome ?? null,
        storagePath: r.storage_path,
      };
    }),
  };
}

/** Primeira vez: o modelo padrão do repositório vira o modelo ativo. */
async function semearPadrao(supabase: Admin, semTabela: boolean): Promise<Modelo> {
  const bytes = await lerPadraoDoRepositorio();
  const storagePath = semTabela ? PADRAO_PATH_SEM_TABELA : `modelos/${randomUUID()}.pptx`;
  if (semTabela) {
    const { data: existe } = await supabase.storage.from(BUCKET).list("modelos", { search: "padrao-crm.pptx" });
    if (!existe?.some((f) => f.name === "padrao-crm.pptx")) {
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: PPTX, upsert: true });
      if (error) throw error;
    }
    return {
      id: "padrao",
      nomeArquivo: PADRAO_ARQUIVO,
      byteSize: bytes.byteLength,
      observacao: "Modelo padrão do CRM",
      ativo: true,
      enviadoEm: new Date(0).toISOString(),
      enviadoPor: null,
      storagePath,
    };
  }
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: PPTX });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("due_modelos_apresentacao")
    .insert({
      nome_arquivo: PADRAO_ARQUIVO,
      storage_path: storagePath,
      byte_size: bytes.byteLength,
      observacao: "Modelo padrão do CRM",
      ativo: true,
    })
    .select("id, enviado_em")
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    // Outra aba semeou ao mesmo tempo (índice de um ativo só): usa o que ficou.
    if (error.code === "23505") {
      const again = await listar(supabase);
      const ativo = again.modelos.find((m) => m.ativo);
      if (ativo) return ativo;
    }
    throw error;
  }
  return {
    id: data.id,
    nomeArquivo: PADRAO_ARQUIVO,
    byteSize: bytes.byteLength,
    observacao: "Modelo padrão do CRM",
    ativo: true,
    enviadoEm: data.enviado_em,
    enviadoPor: null,
    storagePath,
  };
}

async function auth(roles: string[]) {
  const a = await requireAuthApi();
  if (!a.ok) return { error: a.response } as const;
  if (!roles.includes(String(a.profile.role))) {
    return { error: NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 }) } as const;
  }
  return { profile: a.profile } as const;
}

export async function GET(request: NextRequest) {
  const a = await auth(["admin", "comercial", "controladoria"]);
  if ("error" in a) return a.error;
  try {
    const supabase = createSupabaseAdminClient();
    const listado = await listar(supabase);
    const semTabela = listado.semTabela;
    let modelos = listado.modelos;
    if (!modelos.some((m) => m.ativo)) {
      const padrao = await semearPadrao(supabase, semTabela);
      modelos = [padrao, ...modelos];
    }
    const download = request.nextUrl.searchParams.get("download");
    if (download) {
      const alvo = download === "ativo" ? modelos.find((m) => m.ativo) : modelos.find((m) => m.id === download);
      if (!alvo) return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });
      const asAttachment = request.nextUrl.searchParams.get("attachment") === "1";
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(alvo.storagePath, 300, asAttachment ? { download: alvo.nomeArquivo } : undefined);
      if (error || !data?.signedUrl) {
        return NextResponse.json({ ok: false, error: error?.message ?? "Falha ao gerar o link." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, signedUrl: data.signedUrl, modelo: { ...alvo, storagePath: undefined } });
    }
    return NextResponse.json({
      ok: true,
      semTabela,
      modelos: modelos.map((m) => ({ ...m, storagePath: undefined })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao carregar os modelos.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-upload-url"), filename: z.string().min(1).max(240) }),
  z.object({
    action: z.literal("confirm"),
    storagePath: z.string().min(1).max(300),
    originalFilename: z.string().min(1).max(240),
    observacao: z.string().max(500).optional(),
  }),
]);

export async function POST(request: NextRequest) {
  const a = await auth(["admin"]);
  if ("error" in a) return a.error;
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  const body = parsed.data;
  const supabase = createSupabaseAdminClient();
  try {
    if (body.action === "create-upload-url") {
      if (!/\.pptx$/i.test(body.filename)) {
        return NextResponse.json({ ok: false, error: "O modelo precisa ser .pptx." }, { status: 422 });
      }
      const storagePath = `modelos/${randomUUID()}.pptx`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
      if (error || !data) throw error ?? new Error("Falha ao preparar o upload.");
      return NextResponse.json({ ok: true, token: data.token, storagePath, contentType: PPTX });
    }
    if (!/^modelos\/[0-9a-f-]{36}\.pptx$/.test(body.storagePath)) {
      return NextResponse.json({ ok: false, error: "Caminho de upload inválido." }, { status: 400 });
    }
    const { data: info, error: infoErr } = await supabase.storage.from(BUCKET).info(body.storagePath);
    if (infoErr || !info) {
      return NextResponse.json({ ok: false, error: "Upload não encontrado. Tente de novo." }, { status: 422 });
    }
    const size = info.size ?? 0;
    if (size <= 0 || size > MAX_BYTES) {
      await supabase.storage.from(BUCKET).remove([body.storagePath]);
      return NextResponse.json({ ok: false, error: "Arquivo vazio ou maior que 80 MB." }, { status: 422 });
    }
    const { error: offErr } = await supabase.from("due_modelos_apresentacao").update({ ativo: false }).eq("ativo", true);
    if (offErr) {
      await supabase.storage.from(BUCKET).remove([body.storagePath]);
      if (tabelaAusente(offErr.code, offErr.message)) {
        return NextResponse.json(
          { ok: false, error: "Falta aplicar a migration 20261020120000 para trocar o modelo." },
          { status: 409 },
        );
      }
      throw offErr;
    }
    const { data, error } = await supabase
      .from("due_modelos_apresentacao")
      .insert({
        nome_arquivo: body.originalFilename.slice(0, 240),
        storage_path: body.storagePath,
        byte_size: size,
        observacao: body.observacao?.trim() || null,
        ativo: true,
        enviado_por_app_user_id: a.profile.id,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao salvar o modelo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const a = await auth(["admin"]);
  if ("error" in a) return a.error;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: alvo, error: findErr } = await supabase
    .from("due_modelos_apresentacao")
    .select("id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (findErr) return NextResponse.json({ ok: false, error: findErr.message }, { status: 500 });
  if (!alvo) return NextResponse.json({ ok: false, error: "Modelo não encontrado." }, { status: 404 });
  const { error: offErr } = await supabase.from("due_modelos_apresentacao").update({ ativo: false }).eq("ativo", true);
  if (offErr) return NextResponse.json({ ok: false, error: offErr.message }, { status: 500 });
  const { error } = await supabase.from("due_modelos_apresentacao").update({ ativo: true }).eq("id", alvo.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
