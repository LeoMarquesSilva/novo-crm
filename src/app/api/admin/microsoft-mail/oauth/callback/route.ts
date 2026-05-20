import { cookies } from "next/headers";
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

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const err = url.searchParams.get("error");
  const desc = url.searchParams.get("error_description");
  if (err) {
    const msg = desc ? `${err}: ${decodeURIComponent(desc)}` : err;
    return NextResponse.redirect(
      new URL(
        `/crm/admin/integracoes?tab=email&email_oauth=error&message=${encodeURIComponent(msg)}`,
        getPublicAppBaseUrl(),
      ),
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(
      new URL(
        `/crm/admin/integracoes?tab=email&email_oauth=error&message=${encodeURIComponent("Estado OAuth inválido ou expirado. Tente novamente.")}`,
        getPublicAppBaseUrl(),
      ),
    );
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
      return NextResponse.redirect(
        new URL(
          `/crm/admin/integracoes?tab=email&email_oauth=error&message=${encodeURIComponent(error.message)}`,
          getPublicAppBaseUrl(),
        ),
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao conectar Outlook.";
    return NextResponse.redirect(
      new URL(
        `/crm/admin/integracoes?tab=email&email_oauth=error&message=${encodeURIComponent(msg)}`,
        getPublicAppBaseUrl(),
      ),
    );
  }

  return NextResponse.redirect(
    new URL("/crm/admin/integracoes?tab=email&email_oauth=success", getPublicAppBaseUrl()),
  );
}
