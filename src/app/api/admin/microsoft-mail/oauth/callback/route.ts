import { cookies } from "next/headers";
import { logServerError } from "@/lib/http/api-errors";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  exchangeMicrosoftMailAuthCode,
  fetchGraphMeEmail,
} from "@/lib/microsoft-mail/delegated-graph-mail";
import {
  getMicrosoftMailOAuthCallbackUrl,
  getPublicAppBaseUrl,
} from "@/lib/microsoft-mail/public-app-base-url";

const STATE_COOKIE = "ms_mail_oauth_state";
const OAUTH_ROW_ID = "default";

/** Motivo curto na URL; o detalhe do Azure/Graph/banco fica só no log do servidor. */
function errorRedirect(reason: "denied" | "state" | "exchange" | "persist"): NextResponse {
  return NextResponse.redirect(
    new URL(
      `/crm/admin/integracoes?tab=email&email_oauth=error&reason=${reason}`,
      getPublicAppBaseUrl(),
    ),
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const desc = url.searchParams.get("error_description");
  if (err) {
    logServerError("microsoft-mail/oauth", new Error(desc ? `${err}: ${desc}` : err));
    return errorRedirect("denied");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return errorRedirect("state");
  }

  const redirectUri = getMicrosoftMailOAuthCallbackUrl();

  try {
    const tokens = await exchangeMicrosoftMailAuthCode({ code, redirectUri });
    const userEmail = await fetchGraphMeEmail(tokens.access_token);

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("lead_email_microsoft_oauth").upsert(
      {
        id: OAUTH_ROW_ID,
        refresh_token: tokens.refresh_token,
        user_email: userEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      logServerError("microsoft-mail/oauth/persist", error);
      return errorRedirect("persist");
    }
  } catch (e) {
    logServerError("microsoft-mail/oauth/exchange", e);
    return errorRedirect("exchange");
  }

  return NextResponse.redirect(
    new URL("/crm/admin/integracoes?tab=email&email_oauth=success", getPublicAppBaseUrl()),
  );
}
