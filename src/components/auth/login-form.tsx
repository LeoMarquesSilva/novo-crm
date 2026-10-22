"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import { authErrorClass, authLinkClass, authPrimaryButtonClass } from "@/components/auth/auth-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userMustChangePassword } from "@/lib/auth/must-change-password";
import { createSupabaseClient } from "@/lib/supabase/client";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const nextPath =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/crm";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Informe o e-mail e a senha.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signError) {
        setError(
          signError.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : signError.message,
        );
        setLoading(false);
        return;
      }
      // Recarrega a página inteira: a navegação do Next não leva o cookie novo
      // e o CRM continua na tela de login até um refresh manual.
      window.location.assign(userMustChangePassword(data.user) ? "/trocar-senha" : nextPath);
    } catch {
      setError("Não foi possível entrar. Tente de novo.");
      setLoading(false);
    }
  }

  return (
    // method="post": se o JS ainda não carregou, o envio nativo não põe a senha na URL.
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail corporativo</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="h-11 pl-10"
            placeholder="seu.nome@bismarchipires.com.br"
          />
        </div>
      </div>

      {/* O link aparece ao lado do rótulo, mas vem depois do campo no DOM:
          o Tab segue e-mail → senha → "Esqueci minha senha" → Entrar. */}
      <div className="relative space-y-2">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onValueChange={(value) => {
            setPassword(value);
            setError(null);
          }}
          placeholder="Sua senha"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
        />
        <Link href="/esqueci-senha" className={`absolute -top-[3px] right-0 text-v2-body-sm ${authLinkClass}`}>
          Esqueci minha senha
        </Link>
      </div>

      {error ? (
        <p id="login-error" className={authErrorClass} role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={loading} size="lg" className={authPrimaryButtonClass}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Entrando…
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>
    </form>
  );
}
