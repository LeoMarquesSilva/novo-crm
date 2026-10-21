/** Cookie curto, gravado só depois que o link de recuperação abre uma sessão. */
export const PASSWORD_RECOVERY_COOKIE = "crm_pwd_recovery";

export const RESET_PASSWORD_PATH = "/redefinir-senha";

/** Página do link do e-mail: o usuário confirma com um clique (POST em `/auth/callback`). */
export const RECOVERY_CONFIRM_PATH = "/auth/confirmar";

/** Intervalo mínimo entre dois e-mails de recuperação para o mesmo usuário. */
export const RECOVERY_EMAIL_COOLDOWN_SECONDS = 60;

export function passwordRecoveryCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 15,
  };
}
