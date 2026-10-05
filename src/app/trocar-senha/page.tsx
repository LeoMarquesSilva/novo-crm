import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { CHANGE_PASSWORD_PATH, userMustChangePassword } from "@/lib/auth/must-change-password";
import { getCurrentUserProfile } from "@/lib/auth/server";

export default async function ChangePasswordPage() {
  const { user, profile } = await getCurrentUserProfile({ officialAvatar: false });
  if (!user || !profile) {
    redirect(`/login?next=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`);
  }
  if (!userMustChangePassword(user)) {
    redirect("/crm");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[430px] rounded-(--radius-v2-2xl) border border-neutral-200 bg-white p-8 shadow-(--shadow-v2-sm)">
        <div className="mb-8 text-center">
          <h1 className="text-v2-heading-lg text-foreground">Defina sua senha</h1>
          <p className="mt-2 text-v2-body-sm text-muted-foreground">
            {profile.full_name}, a senha atual é temporária. Troque-a para entrar no CRM.
          </p>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
