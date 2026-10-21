import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AuthPanel } from "@/components/auth/auth-panel";
import { authPrimaryButtonClass } from "@/components/auth/auth-styles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Redefinir senha · CRM Bismarchi | Pires" };

/**
 * Destino do link do e-mail de recuperação. Não gasta o token ao abrir (filtros de
 * link do Outlook abrem a URL antes do usuário); o botão envia o POST para `/auth/callback`.
 */
export default async function ConfirmRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = Boolean(tokenHash) && type === "recovery";

  if (!valid) {
    return (
      <AuthPanel title="Link inválido" description="Este endereço está incompleto. Peça um novo link de redefinição.">
        <Link
          href="/esqueci-senha"
          className={cn(authPrimaryButtonClass, "inline-flex items-center justify-center rounded-(--radius-v2-lg) text-sm font-semibold")}
        >
          Pedir um novo link
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Redefinir sua senha"
      description="Confirme para continuar. Em seguida você escolhe a nova senha do CRM."
    >
      <form method="post" action="/auth/callback" className="space-y-5">
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value="recovery" />
        <button
          type="submit"
          className={cn(
            authPrimaryButtonClass,
            "inline-flex items-center justify-center gap-2 rounded-(--radius-v2-lg) text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20",
          )}
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          Continuar para nova senha
        </button>
        <p className="text-v2-caption text-muted-foreground">
          O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu a troca, feche esta página.
        </p>
      </form>
    </AuthPanel>
  );
}
