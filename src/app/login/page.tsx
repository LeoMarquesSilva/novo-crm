import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

function LoginFormFallback() {
  return (
    <div className="flex min-h-[280px] items-center justify-center">
      <div className="h-9 w-9 animate-pulse rounded-xl bg-white/40" />
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

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-crm-gradient-dark px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-crm-gradient-dark" />
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute -left-20 top-24 h-80 w-80 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-200/34 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-amber-100/60 blur-3xl" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_430px]">
        <div className="hidden lg:block">
          <p className="mb-5 inline-flex rounded-full border border-accent-teal/20 bg-white/65 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-accent-teal shadow-sm">
            CRM Juridico
          </p>
          <h1 className="heading-xl max-w-xl text-primary-dark">
            Operação comercial juridica com precisão de sala executiva.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
            Acompanhe oportunidades, propostas, contratos e integrações em um ambiente claro, rápido e seguro.
          </p>
        </div>

        <div className="glass-card glass-card-no-float border-primary-dark/10 p-8 shadow-[0_28px_80px_rgba(49,70,96,0.16)]">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-accent-teal/20 bg-accent-teal/10 shadow-inner shadow-white">
              <span className="text-lg font-black tracking-[-0.04em] text-accent-teal">CRM</span>
            </div>
            <h2 className="heading-lg text-primary-dark">Acesso ao CRM</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Entre com o e-mail corporativo para continuar.
            </p>
          </div>

          {showConfigError ? (
            <p
              className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
              role="status"
            >
              O servidor não tem{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 text-xs">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              ou{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 text-xs">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>{" "}
              configuradas. Defina-as no ambiente para aceder ao CRM.
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
