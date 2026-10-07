import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAppEnv } from "@/lib/env";
import {
  PASSWORD_RECOVERY_COOKIE,
  RESET_PASSWORD_PATH,
  passwordRecoveryCookieOptions,
} from "@/lib/auth/password-recovery";

/**
 * Troca o código do e-mail de recuperação por sessão e segue para definir a senha.
 * O código PKCE só existe no navegador que pediu o link.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const failure = NextResponse.redirect(new URL("/esqueci-senha?erro=link", url.origin));

  if (!code && !(tokenHash && type === "recovery")) return failure;

  const env = getAppEnv();
  const response = NextResponse.redirect(new URL(RESET_PASSWORD_PATH, url.origin));

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash! });

  if (error) return failure;

  response.cookies.set(
    PASSWORD_RECOVERY_COOKIE,
    "1",
    passwordRecoveryCookieOptions(url.protocol === "https:"),
  );
  return response;
}
