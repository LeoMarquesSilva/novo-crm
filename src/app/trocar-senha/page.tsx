import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/auth-panel";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { CHANGE_PASSWORD_PATH, userMustChangePassword } from "@/lib/auth/must-change-password";
import { getCurrentUserProfile } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Defina sua senha · CRM Bismarchi | Pires" };

export default async function ChangePasswordPage() {
  const { user, profile } = await getCurrentUserProfile({ officialAvatar: false });
  if (!user || !profile) {
    redirect(`/login?next=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`);
  }
  if (!userMustChangePassword(user)) {
    redirect("/crm");
  }

  return (
    <AuthPanel
      title="Defina sua senha"
      description={`${profile.full_name}, a senha atual é temporária. Troque-a para entrar no CRM.`}
    >
      <ChangePasswordForm />
    </AuthPanel>
  );
}
