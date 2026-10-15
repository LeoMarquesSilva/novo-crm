/**
 * POST /api/crm/d4sign/documents/[uuid]/cancel — body `{ reason }`.
 *
 * Cancela o documento na D4Sign (`POST /documents/{uuid}/cancel`, com o
 * motivo como `comment`). Irreversível: só admin, só documento em andamento.
 * Atualiza o catálogo e a oportunidade vinculada; o Webhook 2.0 (tipo 3)
 * ainda chega e notifica admin/comercial.
 */
import { NextResponse } from "next/server";
import { requireLeadActionApi } from "@/lib/auth/crm-actor";
import { z } from "zod";
import { cancelD4SignDocument } from "@/lib/d4sign/cancel-document";
import { authorizeD4SignDocumentAccess } from "@/lib/d4sign/document-access";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Informe o motivo (mínimo 5 caracteres).").max(500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uuid: string }> },
) {
  const { uuid } = await params;
  const access = await authorizeD4SignDocumentAccess(uuid);
  if (!access.ok) return access.response;

  const auth = await requireLeadActionApi({ action: "d4sign.cancel" });
  if (!auth.ok) return auth.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Motivo inválido." }, { status: 400 });
  }
  const reason = parsed.data.reason;

  const result = await cancelD4SignDocument({
    uuid,
    reason,
    canceledBy: auth.user.email ?? null,
    source: "crm-cancel",
  });
  if (!result.ok) {
    const status =
      result.reason === "not_pending" ? 409 : result.reason === "quota_exhausted" ? 429 : result.reason === "not_configured" ? 503 : 502;
    return NextResponse.json({ error: result.message }, { status });
  }

  return NextResponse.json({ ok: true, status: result.status });
}
