import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  buildReestruturacaoSystemPrompt,
  buildReestruturacaoUserPrompt,
  parseRespostaReestruturacao,
  recortarTrechos,
  reestruturacaoJsonSchema,
  REEST_IA_MAX_TOKENS,
  REEST_PDF_MAX_ARQUIVOS,
  REEST_PDF_MAX_BYTES,
  REEST_PDF_PASTA,
  REEST_RECORTE_CHAR_CAP,
  type DocumentoLido,
} from "@/lib/due-ppt/reestruturacao-ia";
import { internalErrorResponse, PublicError } from "@/lib/http/api-errors";
import { callStructured, getExtractionModel } from "@/lib/scope-import/openai";
import { extractDocumentText } from "@/lib/scope-import/text-extraction";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Lê PDFs da recuperação judicial e devolve sugestões para o formulário da
 * Reestruturação (nada é gravado aqui: o formulário mostra e o usuário confirma).
 *
 * Duas ações, como o upload de `due-documents` (o PDF não passa pelo corpo da
 * função — limite de ~4,5 MB na Vercel):
 * - `create-upload-url` { filename } → URL assinada em `due-documents/<lead>/reestruturacao-pdf/`;
 * - `extrair` { arquivos: [{ storagePath, nome }] } → texto (unpdf), recorte, IA
 *   (saída estruturada, validada por `reestruturacaoSchema`). Os PDFs saem do
 *   Storage depois da leitura, com ou sem sucesso.
 */

export const maxDuration = 300;

const BUCKET = "due-documents";
const IA_TIMEOUT_MS = 120_000;

function modeloIa(): string {
  return process.env.DUE_REESTRUTURACAO_OPENAI_MODEL?.trim() || getExtractionModel();
}

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-upload-url"), filename: z.string().trim().min(1).max(300) }),
  z.object({
    action: z.literal("extrair"),
    arquivos: z
      .array(z.object({ storagePath: z.string().trim().min(1).max(500), nome: z.string().trim().min(1).max(300) }))
      .min(1)
      .max(REEST_PDF_MAX_ARQUIVOS),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;
  if (!["admin", "comercial"].includes(String(auth.profile.role))) {
    return NextResponse.json({ ok: false, error: "Apenas comercial ou admin monta a apresentação." }, { status: 403 });
  }
  const { id } = await params;
  const oportunidadeId = decodeURIComponent(id);
  const supabase = createSupabaseAdminClient();
  const { data: op, error: opErr } = await supabase
    .from("oportunidades")
    .select("id")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opErr) return internalErrorResponse("due/reestruturacao-pdf", opErr);
  if (!op) return NextResponse.json({ ok: false, error: "Negociação não encontrada." }, { status: 404 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Pedido inválido." }, { status: 400 });
  }
  const body = parsed.data;
  const prefixo = `${oportunidadeId}/${REEST_PDF_PASTA}`;

  if (body.action === "create-upload-url") {
    if (!/\.pdf$/i.test(body.filename)) {
      return NextResponse.json({ ok: false, error: "Envie o arquivo em PDF." }, { status: 422 });
    }
    const storagePath = `${prefixo}${randomUUID()}.pdf`;
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
    if (error || !signed) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Não foi possível preparar o upload." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      uploadUrl: signed.signedUrl,
      token: signed.token,
      storagePath,
      contentType: "application/pdf",
    });
  }

  const arquivos = body.arquivos;
  if (arquivos.some((a) => !a.storagePath.startsWith(prefixo) || a.storagePath.includes("..") || !/\.pdf$/i.test(a.storagePath))) {
    return NextResponse.json({ ok: false, error: "Caminho de upload inválido." }, { status: 400 });
  }

  try {
    const lidos: DocumentoLido[] = [];
    const avisos: string[] = [];
    for (const a of arquivos) {
      const { data: info, error: infoErr } = await supabase.storage.from(BUCKET).info(a.storagePath);
      if (infoErr || !info) throw new PublicError(`${a.nome}: o arquivo não chegou ao Storage. Envie de novo.`, 422);
      if ((info.size ?? 0) > REEST_PDF_MAX_BYTES) {
        throw new PublicError(
          `${a.nome}: arquivo muito grande (máx. ${Math.round(REEST_PDF_MAX_BYTES / 1024 / 1024)} MB).`,
          422,
        );
      }
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(a.storagePath);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "Falha ao baixar o PDF.");

      let extraido: Awaited<ReturnType<typeof extractDocumentText>>;
      try {
        extraido = await extractDocumentText(Buffer.from(await blob.arrayBuffer()), "application/pdf");
      } catch {
        avisos.push(`${a.nome}: não foi possível ler o PDF; ficou de fora.`);
        continue;
      }
      if (!extraido.text.trim()) {
        avisos.push(`${a.nome}: sem texto (PDF digitalizado?); ficou de fora.`);
        continue;
      }
      if (extraido.isLikelyScanned) {
        avisos.push(`${a.nome}: pouco texto por página (pode ser digitalizado); a leitura pode sair incompleta.`);
      }
      lidos.push({ nome: a.nome, texto: extraido.text, paginas: extraido.pageCount });
    }
    if (!lidos.length) {
      throw new PublicError(
        "Nenhum dos PDFs tem texto legível (parecem digitalizados). Envie a versão pesquisável ou preencha à mão.",
        422,
      );
    }

    const recorte = recortarTrechos(lidos);
    const ia = await callStructured(
      modeloIa(),
      buildReestruturacaoSystemPrompt(),
      buildReestruturacaoUserPrompt(recorte.texto),
      reestruturacaoJsonSchema as unknown as Record<string, unknown>,
      "due_reestruturacao",
      REEST_IA_MAX_TOKENS,
      parseRespostaReestruturacao,
      REEST_RECORTE_CHAR_CAP + 1_000,
      { timeoutMs: IA_TIMEOUT_MS },
    );

    return NextResponse.json({
      ok: true,
      sugestao: ia.data,
      avisos,
      documentos: recorte.documentos,
      modelo: ia.model,
    });
  } catch (error) {
    return internalErrorResponse("due/reestruturacao-pdf", error, "Falha ao ler os PDFs. Tente novamente.");
  } finally {
    await limparPasta(supabase, prefixo, arquivos.map((a) => a.storagePath));
  }
}

/** Tira do Storage os PDFs lidos e sobras de envios interrompidos (mais de 1 h) da pasta temporária. */
async function limparPasta(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  prefixo: string,
  lidos: string[],
): Promise<void> {
  try {
    const { data } = await supabase.storage.from(BUCKET).list(prefixo.replace(/\/$/, ""), { limit: 100 });
    const limite = Date.now() - 60 * 60 * 1000;
    const sobras = (data ?? [])
      .filter((f) => {
        const criado = Date.parse(f.created_at ?? "");
        return Number.isFinite(criado) && criado < limite;
      })
      .map((f) => `${prefixo}${f.name}`);
    await supabase.storage.from(BUCKET).remove([...new Set([...lidos, ...sobras])]);
  } catch {
    // Limpeza é melhor esforço: a resposta ao usuário não depende dela.
  }
}
