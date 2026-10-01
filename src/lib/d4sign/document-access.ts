/**
 * Autorização para abrir um documento D4Sign pelo CRM (PDF ou portal).
 * O documento precisa existir em `d4sign_documents` e o papel do usuário
 * precisa ver documentos D4Sign; sem oportunidade, só admin e sócios.
 */
import { NextResponse } from "next/server";
import {
  canViewD4SignDocument,
  canViewD4SignDocumentRecord,
} from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { isFirmSignerEmail } from "@/lib/d4sign/firm-signers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN = "Sem permissão para visualizar documentos D4Sign.";

export async function authorizeD4SignDocumentAccess(
  uuid: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const authResult = await requireAuthApi();
  if (!authResult.ok) return { ok: false, response: authResult.response };

  if (!canViewD4SignDocument({ role: authResult.profile.role })) {
    return { ok: false, response: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) };
  }

  if (!UUID_RE.test(uuid)) {
    return { ok: false, response: NextResponse.json({ error: "UUID inválido." }, { status: 400 }) };
  }

  const supabase = createSupabaseAdminClient();
  const { data: document, error: documentError } = await supabase
    .from("d4sign_documents")
    .select("uuid_doc, oportunidade_id")
    .eq("uuid_doc", uuid)
    .maybeSingle();

  if (documentError) {
    console.error("Falha ao autorizar visualização D4Sign", documentError);
    return {
      ok: false,
      response: NextResponse.json({ error: "Não foi possível validar o documento." }, { status: 500 }),
    };
  }
  if (!document) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Documento não encontrado." }, { status: 404 }),
    };
  }

  if (!canViewD4SignDocumentRecord({
    role: authResult.profile.role,
    oportunidadeId: document.oportunidade_id,
    isFirmPartner: isFirmSignerEmail(authResult.user.email),
  })) {
    return { ok: false, response: NextResponse.json({ error: FORBIDDEN }, { status: 403 }) };
  }

  if (document.oportunidade_id) {
    const { data: opportunity, error: opportunityError } = await supabase
      .from("oportunidades")
      .select("id")
      .eq("id", document.oportunidade_id)
      .maybeSingle();

    if (opportunityError) {
      console.error("Falha ao validar oportunidade do documento D4Sign", opportunityError);
      return {
        ok: false,
        response: NextResponse.json({ error: "Não foi possível validar o documento." }, { status: 500 }),
      };
    }
    if (!opportunity) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Documento não encontrado." }, { status: 404 }),
      };
    }
  }

  return { ok: true };
}
