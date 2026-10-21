"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { authErrorClass, authPrimaryButtonClass } from "@/components/auth/auth-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordRequirements, passwordMeetsRules } from "@/components/auth/password-requirements";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!passwordMeetsRules(password)) {
      setError("A nova senha ainda não atende a todos os requisitos.");
      return;
    }
    if (password !== confirm) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(body?.error ?? "Não foi possível salvar a senha.");
        setLoading(false);
        return;
      }
      window.location.assign("/crm");
    } catch {
      setError("Não foi possível salvar a senha.");
      setLoading(false);
    }
  }

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          autoFocus
          required
          minLength={12}
          value={password}
          onValueChange={setPassword}
          aria-describedby="password-rules"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={12}
          value={confirm}
          onValueChange={setConfirm}
        />
      </div>
      <div id="password-rules">
        <PasswordRequirements password={password} confirm={confirm} />
      </div>
      {error ? (
        <p className={authErrorClass} role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} size="lg" className={authPrimaryButtonClass}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Salvando…
          </>
        ) : (
          "Salvar nova senha"
        )}
      </Button>
    </form>
  );
}
