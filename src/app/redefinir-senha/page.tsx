import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { AuthPanel } from "@/components/auth/auth-panel";
import { authPrimaryButtonClass } from "@/components/auth/auth-styles";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Nova senha · CRM Bismarchi | Pires" };

export default async function ResetPasswordPage() {
  const jar = await cookies();
  const allowed = jar.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";

  return (
    <AuthPanel
      title={allowed ? "Crie uma nova senha" : "Link expirado"}
      description={
        allowed
          ? "Escolha a senha que você vai usar para entrar no CRM."
          : "Este link já foi usado ou passou do prazo. Peça um novo para continuar."
      }
    >
      {allowed ? (
        <ResetPasswordForm />
      ) : (
        <Link
          href="/esqueci-senha"
          className={cn(
            authPrimaryButtonClass,
            "inline-flex items-center justify-center rounded-(--radius-v2-lg) text-sm font-semibold",
          )}
        >
          Pedir um novo link
        </Link>
      )}
    </AuthPanel>
  );
}
