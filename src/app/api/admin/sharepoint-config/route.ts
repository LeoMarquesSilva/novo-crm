import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";

function maskSecret(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 8, 12))}${value.slice(-4)}`;
}

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const tenantId = process.env.MICROSOFT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET;
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const listId = process.env.SHAREPOINT_AGENDAMENTOS_LIST_ID;
  const webhookSecret = process.env.SHAREPOINT_INTEGRATION_SECRET;

  const missing: string[] = [];
  if (!tenantId?.trim()) missing.push("MICROSOFT_TENANT_ID");
  if (!clientId?.trim()) missing.push("SHAREPOINT_CLIENT_ID");
  if (!clientSecret?.trim()) missing.push("SHAREPOINT_CLIENT_SECRET");
  if (!siteId?.trim()) missing.push("SHAREPOINT_SITE_ID");
  if (!listId?.trim()) missing.push("SHAREPOINT_AGENDAMENTOS_LIST_ID");

  return NextResponse.json({
    configured: missing.length === 0,
    missing,
    fields: {
      tenantId: maskSecret(tenantId),
      clientId: maskSecret(clientId),
      clientSecret: maskSecret(clientSecret),
      siteId: siteId?.trim() || null,
      listId: listId?.trim() || null,
      webhookSecret: maskSecret(webhookSecret),
    },
  });
}

export async function POST() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    // Testa autenticação obtendo token, depois valida acesso à lista (sem criar item)
    const tenantId = process.env.MICROSOFT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID ?? "";
    const clientId = process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID ?? "";
    const clientSecret =
      process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET ?? "";
    const siteId = process.env.SHAREPOINT_SITE_ID ?? "";
    const listId = process.env.SHAREPOINT_AGENDAMENTOS_LIST_ID ?? "";

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      },
    );

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      const msg = tokenJson.error_description ?? tokenJson.error ?? tokenRes.statusText;
      return NextResponse.json({ ok: false, error: `Falha de autenticação Microsoft: ${msg}` });
    }

    // Verifica se consegue acessar a lista
    const listRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${encodeURI(siteId)}/lists/${encodeURIComponent(listId)}`,
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      },
    );

    if (!listRes.ok) {
      const errText = await listRes.text();
      return NextResponse.json({
        ok: false,
        error: `Token OK, mas lista inacessível (${listRes.status}): ${errText.slice(0, 300)}`,
      });
    }

    const listJson = (await listRes.json()) as { displayName?: string; name?: string };

    return NextResponse.json({
      ok: true,
      listName: listJson.displayName ?? listJson.name ?? "Lista acessível",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, error: message });
  }
}
