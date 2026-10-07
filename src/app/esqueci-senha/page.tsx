import { AuthPanel } from "@/components/auth/auth-panel";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;

  return (
    <AuthPanel
      title="Esqueci minha senha"
      description="Informe o e-mail da sua conta. Se ele estiver cadastrado, enviamos um link para criar outra senha."
    >
      <ForgotPasswordForm linkError={erro === "link"} />
    </AuthPanel>
  );
}
