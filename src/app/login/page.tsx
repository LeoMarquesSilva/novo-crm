import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

function LoginFormFallback() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="h-9 w-9 animate-pulse rounded-(--radius-v2-lg) bg-neutral-100" />
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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_430px]">
        <div className="hidden rounded-(--radius-v2-2xl) bg-brand-navy p-10 text-white lg:block">
          <p className="mb-5 inline-flex rounded-(--radius-v2-full) border border-white/20 bg-white/10 px-3 py-1 text-v2-caption-medium uppercase tracking-[0.22em] text-white">
            CRM Jurídico
          </p>
          <h1 className="text-v2-heading-xl max-w-xl text-white">
            Operação comercial jurídica com precisão de sala executiva.
          </h1>
          <p className="mt-5 max-w-lg text-v2-body-md text-white/70">
            Acompanhe oportunidades, propostas, contratos e integrações em um ambiente claro, rápido e seguro.
          </p>
        </div>

        <div className="rounded-(--radius-v2-2xl) border border-neutral-200 bg-white p-8 shadow-(--shadow-v2-sm)">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-(--radius-v2-xl) bg-interactive-600">
              <span className="text-v2-body-sm-medium font-bold tracking-[-0.02em] text-white">
                CRM
              </span>
            </div>
            <h2 className="text-v2-heading-lg text-foreground">Acesso ao CRM</h2>
            <p className="mt-2 max-w-sm text-v2-body-sm text-muted-foreground">
              Entre com o e-mail corporativo para continuar.
            </p>
          </div>

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
        </div>
      </div>
    </div>
  );
}
