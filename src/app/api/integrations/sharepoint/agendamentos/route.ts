import { NextResponse } from "next/server";
import { z } from "zod";
import { SharePointGraphClient } from "@/modules/crm/infrastructure/integrations/sharepoint-graph";

const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const bodySchema = z.object({
  /** Campos com nomes internos da lista SharePoint (iguais ao mapeamento do N8N). */
  fields: z.record(z.string(), fieldValueSchema),
});

/**
 * Cria item na lista "AGENDAMENTOS / REAGENDAMENTOS" (ou lista configurada em SHAREPOINT_AGENDAMENTOS_LIST_ID).
 *
 * Autenticação: header `x-sharepoint-integration-secret` = SHAREPOINT_INTEGRATION_SECRET
 *
 * Permissões Azure AD (aplicativo): Microsoft Graph — `Sites.ReadWrite.All` (application) com consentimento admin,
 * ou `Sites.Selected` com permissão concedida ao site (mais restrito).
 */
export async function POST(request: Request) {
  const expectedSecret = process.env.SHAREPOINT_INTEGRATION_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "SHAREPOINT_INTEGRATION_SECRET não configurado." },
      { status: 500 },
    );
  }

  const sentSecret = request.headers.get("x-sharepoint-integration-secret");
  if (!sentSecret || sentSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Body inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const client = SharePointGraphClient.fromEnv();
    const created = await client.createListItem(parsed.data.fields);
    return NextResponse.json({ ok: true, item: created });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao criar item no SharePoint.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
