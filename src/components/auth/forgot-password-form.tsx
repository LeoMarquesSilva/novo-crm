"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";

import { authErrorClass, authLinkClass, authPrimaryButtonClass } from "@/components/auth/auth-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESEND_SECONDS = 60;

async function requestResetEmail(email: string): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "Não foi possível enviar o link. Tente de novo em instantes.";
  } catch {
    return "Não foi possível enviar o link. Confira sua conexão e tente de novo.";
  }
}

export function ForgotPasswordForm({ linkError = false }: { linkError?: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(
    linkError ? "Esse link não vale mais. Peça um novo abaixo." : null,
  );
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function send(address: string) {
    setError(null);
    setLoading(true);
    const failure = await requestResetEmail(address);
    setLoading(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSentTo(address);
    setCooldown(RESEND_SECONDS);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Informe um e-mail válido.");
      return;
    }
    await send(address);
  }

  if (sentTo) {
    return (
      <div className="space-y-6">
        <div className="flex gap-3 rounded-(--radius-v2-lg) border border-success-border bg-success-bg p-4" role="status">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success-text" aria-hidden />
          <div className="space-y-1 text-v2-body-sm text-success-text">
            <p className="font-semibold">Confira sua caixa de entrada</p>
            <p>
              Se <strong className="break-all">{sentTo}</strong> tiver acesso ao CRM, enviamos um link para criar
              uma nova senha. Ele vale por 1 hora.
            </p>
          </div>
        </div>
        <p className="text-v2-body-sm text-muted-foreground">
          Não chegou? Veja a pasta de lixo eletrônico ou{" "}
          {cooldown > 0 ? (
            <span>peça outro em {cooldown}s.</span>
          ) : (
            <button
              type="button"
              onClick={() => send(sentTo)}
              disabled={loading}
              className={`${authLinkClass} disabled:opacity-60`}
            >
              {loading ? "enviando…" : "envie de novo"}
            </button>
          )}
        </p>
        {error ? (
          <p className={authErrorClass} role="alert">
            {error}
          </p>
        ) : null}
        <Link href="/login" className={`inline-flex items-center gap-2 text-v2-body-sm ${authLinkClass}`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar ao login
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail corporativo</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
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
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "forgot-error" : undefined}
            className="h-11 pl-10"
            placeholder="seu.nome@bismarchipires.com.br"
          />
        </div>
      </div>
      {error ? (
        <p id="forgot-error" className={authErrorClass} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} size="lg" className={authPrimaryButtonClass}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Enviando…
          </>
        ) : (
          "Enviar link de redefinição"
        )}
      </Button>
      <Link href="/login" className={`inline-flex items-center gap-2 text-v2-body-sm ${authLinkClass}`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar ao login
      </Link>
    </form>
  );
}
