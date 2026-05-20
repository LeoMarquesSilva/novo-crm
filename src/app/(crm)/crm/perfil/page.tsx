import { redirect } from "next/navigation";
import { UserRound } from "lucide-react";

import { CrmPageHeader } from "@/components/crm/crm-page-header";
import { ProfileForm } from "./profile-form";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function PerfilPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/crm/perfil");
  }

  const { data: profile } = await supabase
    .from("app_users")
    .select("full_name, area, avatar_url, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const hasProfileRow = profile != null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <CrmPageHeader
        eyebrow="Conta"
        title="Meu perfil"
        description="Atualize o nome, a área e a foto usados no CRM. O papel de acesso só pode ser alterado por um administrador."
        icon={UserRound}
      />

      <Card className="glass-card glass-card-no-float border-white/45 py-0 shadow-xl shadow-primary-dark/15">
        <CardContent className="px-5 pb-7 pt-6 sm:px-8 sm:pb-8">
          <ProfileForm
            hasProfileRow={hasProfileRow}
            role={profile?.role ?? null}
            initial={{
              full_name: profile?.full_name ?? "",
              area: profile?.area ?? "",
              avatar_url: profile?.avatar_url ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
