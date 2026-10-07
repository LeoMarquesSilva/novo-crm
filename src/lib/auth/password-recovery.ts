/** Cookie curto, gravado só depois que o link de recuperação abre uma sessão. */
export const PASSWORD_RECOVERY_COOKIE = "crm_pwd_recovery";

export const RESET_PASSWORD_PATH = "/redefinir-senha";

export function passwordRecoveryCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 15,
  };
}
