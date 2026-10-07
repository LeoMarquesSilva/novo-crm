"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
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
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 pl-10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar nova senha</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-11"
        />
      </div>
      <p className="text-v2-body-sm text-muted-foreground">
        Mínimo de 12 caracteres, com letra maiúscula, letra minúscula e número.
      </p>
      {error ? (
        <p className="rounded-(--radius-v2-md) border border-destructive/35 bg-destructive/10 px-3 py-2 text-v2-body-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} size="lg" className="h-11 w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando…
          </>
        ) : (
          "Salvar nova senha"
        )}
      </Button>
    </form>
  );
}
