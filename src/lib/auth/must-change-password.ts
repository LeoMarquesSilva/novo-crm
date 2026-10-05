import { z } from "zod";

import { adminInitialPasswordSchema } from "@/lib/auth/admin-user-policy";

export const CHANGE_PASSWORD_PATH = "/trocar-senha";

export function userMustChangePassword(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
): boolean {
  return user?.app_metadata?.must_change_password === true;
}

/**
 * Para onde mandar esta rota enquanto a senha temporária não for trocada.
 * `null` deixa o proxy seguir o fluxo normal.
 */
export function mustChangePasswordRedirect(input: {
  pathname: string;
  signedIn: boolean;
  mustChange: boolean;
}): string | null {
  if (!input.signedIn) {
    return input.pathname === CHANGE_PASSWORD_PATH
      ? `/login?next=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`
      : null;
  }
  if (input.mustChange) {
    if (input.pathname === CHANGE_PASSWORD_PATH) return null;
    if (input.pathname === "/login" || input.pathname.startsWith("/crm")) return CHANGE_PASSWORD_PATH;
    return null;
  }
  return input.pathname === CHANGE_PASSWORD_PATH ? "/crm" : null;
}

export const replacementPasswordSchema = z.string().superRefine((value, ctx) => {
  const parsed = adminInitialPasswordSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message });
    }
  }
});
