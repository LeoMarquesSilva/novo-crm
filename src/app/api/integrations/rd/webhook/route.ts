import { NextResponse } from "next/server";
import { z } from "zod";
import { RdImportConnector } from "@/modules/crm/infrastructure/integrations/rd-import";

const webhookSchema = z.object({
  event_name: z.string().min(1).optional(),
  event: z.string().min(1).optional(),
  document: z.record(z.string(), z.unknown()).optional(),
  deal: z.record(z.string(), z.unknown()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const expectedSecret = process.env.RD_WEBHOOK_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { ok: false, error: "RD_WEBHOOK_SECRET não configurado." },
      { status: 500 },
    );
  }

  const sentSecret =
    request.headers.get("x-rd-webhook-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (!sentSecret || sentSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "Webhook não autorizado." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as unknown;
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload de webhook inválido.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const connector = new RdImportConnector(process.env.RD_CRM_TOKEN ?? "");
    const result = await connector.syncWebhookPayload(parsed.data);

    return NextResponse.json({
      ok: true,
      summary: {
        imported: result.imported,
        importedDeals: result.importedDeals,
        importedLeads: result.importedLeads,
      },
      records: result.records,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada no webhook do RD.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
