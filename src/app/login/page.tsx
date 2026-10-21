import { Suspense } from "react";
import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/auth-panel";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Entrar · CRM Bismarchi | Pires" };

function LoginFormFallback() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="h-11 animate-pulse rounded-(--radius-v2-md) bg-neutral-100" />
      <div className="h-11 animate-pulse rounded-(--radius-v2-md) bg-neutral-100" />
      <div className="h-11 animate-pulse rounded-(--radius-v2-lg) bg-neutral-100" />
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const showConfigError = reason === "missing_supabase_env";
  const showProfileError = reason === "profile_missing";

  return (
    <AuthPanel
      title="Entrar no CRM"
      description="Use seu e-mail corporativo e sua senha para acessar."
    >
      {showConfigError ? (
        <p
          className="mb-6 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-v2-body-sm text-warning-text"
          role="status"
        >
          O servidor não tem{" "}
          <code className="rounded-(--radius-v2-sm) bg-black/10 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          ou{" "}
          <code className="rounded-(--radius-v2-sm) bg-black/10 px-1 py-0.5 text-xs">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          configuradas. Defina-as no ambiente para aceder ao CRM.
        </p>
      ) : null}

      {showProfileError ? (
        <p
          className="mb-6 rounded-(--radius-v2-md) border border-warning-border bg-warning-bg px-3 py-2 text-v2-body-sm text-warning-text"
          role="alert"
        >
          Sua conta está autenticada, mas ainda não possui um perfil ativo
          no CRM. Solicite a liberação a um administrador ou entre com
          outra conta.
        </p>
      ) : null}

      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </AuthPanel>
  );
}
