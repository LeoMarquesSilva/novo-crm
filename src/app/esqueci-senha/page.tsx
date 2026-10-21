import type { Metadata } from "next";

import { AuthPanel } from "@/components/auth/auth-panel";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha · CRM Bismarchi | Pires" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <AuthPanel
      title="Esqueceu a senha?"
      description="Informe o e-mail da sua conta. Enviamos um link para você criar uma nova senha."
    >
      <ForgotPasswordForm linkError={erro === "link"} />
    </AuthPanel>
  );
}
