import { createSupabaseClient } from "@/lib/supabase/client";

type DueDocument = {
  id: string;
  document_kind: string;
  original_filename: string;
  content_type: string;
  byte_size: number;
  uploaded_at: string;
  uploaded_by_app_user_id: string | null;
};

/**
 * Envia o PPT de compilação DUE direto do navegador pro Storage, via URL
 * assinada — não passa pela function serverless (Vercel limita o corpo de uma
 * função Node a ~4,5 MB; um PPT de compilação estoura isso fácil).
 */
export async function uploadDuePpt(leadId: string, file: File): Promise<DueDocument> {
  const urlRes = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/due-documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create-upload-url", filename: file.name, contentType: file.type }),
  });
  const urlPayload = (await urlRes.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    uploadUrl?: string;
    token?: string;
    storagePath?: string;
    contentType?: string;
  };
  if (!urlRes.ok || !urlPayload.ok || !urlPayload.token || !urlPayload.storagePath) {
    throw new Error(urlPayload.error ?? "Não foi possível preparar o upload.");
  }

  const supabase = createSupabaseClient();
  const { error: uploadErr } = await supabase.storage
    .from("due-documents")
    .uploadToSignedUrl(urlPayload.storagePath, urlPayload.token, file, {
      contentType: urlPayload.contentType || file.type || undefined,
    });
  if (uploadErr) {
    throw new Error(uploadErr.message || "Falha ao enviar o arquivo.");
  }

  const confirmRes = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/due-documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "confirm",
      storagePath: urlPayload.storagePath,
      originalFilename: file.name,
    }),
  });
  const confirmPayload = (await confirmRes.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    document?: DueDocument;
  };
  if (!confirmRes.ok || !confirmPayload.ok || !confirmPayload.document) {
    throw new Error(confirmPayload.error ?? "Falha ao confirmar o upload.");
  }
  return confirmPayload.document;
}
