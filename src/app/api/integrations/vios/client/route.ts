import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { ViosClientConnector } from "@/modules/crm/infrastructure/integrations/vios-client";

const querySchema = z.object({
  document: z.string().min(1),
});

export async function GET(request: Request) {
  const auth = await requireAuthApi();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    document: url.searchParams.get("document"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Parâmetro document é obrigatório." },
      { status: 400 },
    );
  }

  try {
    const connector = new ViosClientConnector(process.env.VIOS_API_KEY ?? "");
    const record = await connector.searchClientByDocument(parsed.data.document);

    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha inesperada no VIOS.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
