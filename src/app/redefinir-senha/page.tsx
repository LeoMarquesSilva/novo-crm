import Link from "next/link";
import { cookies } from "next/headers";

import { AuthPanel } from "@/components/auth/auth-panel";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/auth/password-recovery";

export default async function ResetPasswordPage() {
  const jar = await cookies();
  const allowed = jar.get(PASSWORD_RECOVERY_COOKIE)?.value === "1";

  return (
    <AuthPanel
      title="Nova senha"
      description={
        allowed
          ? "Escolha a senha que você vai usar para entrar no CRM."
          : "Este link expirou ou foi aberto em outro navegador."
      }
    >
      {allowed ? (
        <ResetPasswordForm />
      ) : (
        <Link
          href="/esqueci-senha"
          className="inline-flex h-11 w-full items-center justify-center rounded-(--radius-v2-lg) bg-interactive-600 text-sm font-semibold text-white hover:bg-interactive-700"
        >
          Pedir um novo link
        </Link>
      )}
    </AuthPanel>
  );
}
