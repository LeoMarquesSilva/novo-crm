"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseClient } from "@/lib/supabase/client";

export function ForgotPasswordForm({ linkError = false }: { linkError?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(
    linkError ? "Esse link não vale mais. Peça um novo abaixo, e abra o e-mail neste mesmo navegador." : null,
  );
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) {
        setError(
          resetError.message.toLowerCase().includes("redirect")
            ? "Não foi possível enviar o link agora. Avise quem administra o CRM."
            : "Não foi possível enviar o link. Tente de novo em instantes.",
        );
        return;
      }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <p className="rounded-(--radius-v2-md) border border-success-border bg-success-bg px-3 py-2 text-v2-body-sm text-success-text" role="status">
          Se esse e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Abra o link neste mesmo navegador.
        </p>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center text-v2-body-sm font-semibold text-interactive-700 hover:underline">
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 pl-10"
            placeholder="nome@empresa.com.br"
          />
        </div>
      </div>
      {error ? (
        <p className="rounded-(--radius-v2-md) border border-destructive/35 bg-destructive/10 px-3 py-2 text-v2-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando…
          </>
        ) : (
          "Enviar link"
        )}
      </Button>
      <Link href="/login" className="inline-flex h-11 w-full items-center justify-center text-v2-body-sm font-semibold text-interactive-700 hover:underline">
        Voltar ao login
      </Link>
    </form>
  );
}
