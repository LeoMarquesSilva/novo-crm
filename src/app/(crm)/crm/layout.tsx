import { AppShell } from "@/components/crm/app-shell";
import type { CrmSessionUser } from "@/components/crm/crm-session-user";
import { requireAuth } from "@/lib/auth/server";

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await requireAuth("/crm");

  const sessionUser: CrmSessionUser = {
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    area: profile?.area ?? null,
    role: profile?.role ?? null,
  };

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
