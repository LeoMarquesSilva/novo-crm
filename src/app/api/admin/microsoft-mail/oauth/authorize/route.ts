import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/server";
import { buildMicrosoftMailAuthorizeUrl } from "@/lib/microsoft-mail/delegated-graph-mail";
import { getMicrosoftMailOAuthCallbackUrl } from "@/lib/microsoft-mail/public-app-base-url";

const STATE_COOKIE = "ms_mail_oauth_state";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const state = randomBytes(24).toString("base64url");
  const redirectUri = getMicrosoftMailOAuthCallbackUrl();
  const authorizeUrl = buildMicrosoftMailAuthorizeUrl({ state, redirectUri });

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(authorizeUrl);
}
