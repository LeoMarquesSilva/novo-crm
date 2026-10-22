import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getAppEnv } from "@/lib/env";
import {
  PASSWORD_RECOVERY_COOKIE,
  RESET_PASSWORD_PATH,
  passwordRecoveryCookieOptions,
} from "@/lib/auth/password-recovery";

type RecoveryCredential = { code: string } | { tokenHash: string };

/**
 * Abre a sessão de recuperação e segue para definir a senha.
 * `code` (PKCE) só vale no navegador que pediu o link; `token_hash` vale em qualquer um.
 */
async function openRecoverySession(request: NextRequest, credential: RecoveryCredential | null, status: 302 | 303) {
  const origin = new URL(request.url).origin;
  const failure = NextResponse.redirect(new URL("/esqueci-senha?erro=link", origin), status);
  if (!credential) return failure;

  const env = getAppEnv();
  const response = NextResponse.redirect(new URL(RESET_PASSWORD_PATH, origin), status);

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

  const { error } =
    "code" in credential
      ? await supabase.auth.exchangeCodeForSession(credential.code)
      : await supabase.auth.verifyOtp({ type: "recovery", token_hash: credential.tokenHash });

  if (error) return failure;

  response.cookies.set(
    PASSWORD_RECOVERY_COOKIE,
    "1",
    passwordRecoveryCookieOptions(new URL(request.url).protocol === "https:"),
  );
  return response;
}

function credentialFrom(code: string | null, tokenHash: string | null, type: string | null): RecoveryCredential | null {
  if (code) return { code };
  if (tokenHash && type === "recovery") return { tokenHash };
  return null;
}

/** Links antigos (PKCE ou `token_hash` direto no e-mail). */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  return openRecoverySession(
    request,
    credentialFrom(params.get("code"), params.get("token_hash"), params.get("type")),
    302,
  );
}

/** Botão de `/auth/confirmar`: o token só é gasto quando a pessoa clica. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const tokenHash = form?.get("token_hash");
  const type = form?.get("type");
  return openRecoverySession(
    request,
    credentialFrom(null, typeof tokenHash === "string" ? tokenHash : null, typeof type === "string" ? type : null),
    303,
  );
}
