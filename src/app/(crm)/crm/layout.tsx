import { AppShell } from "@/components/crm/app-shell";
import type { CrmSessionUser } from "@/components/crm/crm-session-user";
import { requireAuth } from "@/lib/auth/server";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { canAccessPartnerSignatures, toPartnerSigners } from "@/lib/d4sign/partner-signatures";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await requireAuth("/crm");

  const sessionUser: CrmSessionUser = {
    email: user.email ?? null,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    area: profile.area,
    role: profile.role,
    canAccessPartnerSignatures: canAccessPartnerSignatures({
      role: profile.role,
      email: user.email,
      partners: toPartnerSigners(getFirmSigners()),
    }),
  };

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
