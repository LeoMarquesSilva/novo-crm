import { createSupabaseClient } from "@/lib/supabase/client";
import { reestruturacaoSchema, type ReestruturacaoForm } from "./draft";
import { REEST_PDF_MAX_ARQUIVOS, REEST_PDF_MAX_BYTES, type DocumentoRecortado } from "./reestruturacao-ia";

export type LeituraPdfReestruturacao = {
  sugestao: ReestruturacaoForm;
  avisos: string[];
  documentos: DocumentoRecortado[];
};

/**
 * Sobe os PDFs da recuperação judicial direto para o Storage (URL assinada; não
 * passa pelo corpo da função da Vercel) e pede à rota que os leia com IA.
 * Devolve só a sugestão: quem decide o que entra no formulário é o usuário.
 */
export async function lerPdfsReestruturacao(
  leadId: string,
  files: File[],
  onEtapa?: (etapa: string) => void,
): Promise<LeituraPdfReestruturacao> {
  if (!files.length) throw new Error("Escolha ao menos um PDF.");
  if (files.length > REEST_PDF_MAX_ARQUIVOS) throw new Error(`Envie até ${REEST_PDF_MAX_ARQUIVOS} PDFs por vez.`);
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) throw new Error(`${f.name}: envie o arquivo em PDF.`);
    if (f.size > REEST_PDF_MAX_BYTES) {
      throw new Error(`${f.name}: arquivo muito grande (máx. ${Math.round(REEST_PDF_MAX_BYTES / 1024 / 1024)} MB).`);
    }
  }

  const base = `/api/crm/leads/${encodeURIComponent(leadId)}/due-apresentacao/reestruturacao-pdf`;
  const post = async (body: unknown) => {
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown> & { ok?: boolean; error?: string };
    return { res, payload };
  };

  const supabase = createSupabaseClient();
  const arquivos: Array<{ storagePath: string; nome: string }> = [];
  for (const [i, file] of files.entries()) {
    onEtapa?.(`Enviando ${file.name}${files.length > 1 ? ` (${i + 1} de ${files.length})` : ""}…`);
    const { res, payload } = await post({ action: "create-upload-url", filename: file.name });
    const token = typeof payload.token === "string" ? payload.token : "";
    const storagePath = typeof payload.storagePath === "string" ? payload.storagePath : "";
    if (!res.ok || !payload.ok || !token || !storagePath) {
      throw new Error(payload.error ?? "Não foi possível preparar o upload.");
    }
    const { error } = await supabase.storage
      .from("due-documents")
      .uploadToSignedUrl(storagePath, token, file, { contentType: "application/pdf" });
    if (error) throw new Error(error.message || "Falha ao enviar o PDF.");
    arquivos.push({ storagePath, nome: file.name });
  }

  onEtapa?.(files.length > 1 ? "Lendo os documentos com IA…" : "Lendo o documento com IA…");
  const { res, payload } = await post({ action: "extrair", arquivos });
  if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Falha ao ler os PDFs.");
  return {
    sugestao: reestruturacaoSchema.parse(payload.sugestao ?? {}),
    avisos: Array.isArray(payload.avisos) ? payload.avisos.map(String) : [],
    documentos: Array.isArray(payload.documentos) ? (payload.documentos as DocumentoRecortado[]) : [],
  };
}
