import { after } from "next/server";
import { AppShell } from "@/components/crm/app-shell";
import type { CrmSessionUser } from "@/components/crm/crm-session-user";
import { requireAuth } from "@/lib/auth/server";
import { canAccessModule } from "@/lib/auth/crm-access-policy";
import { listUserModules } from "@/lib/auth/module-access";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";
import { canAccessPartnerSignatures, toPartnerSigners } from "@/lib/d4sign/partner-signatures";
import { isPartnerOnlyEmail } from "@/lib/d4sign/partner-only";
import { runD4SignSyncRoundIfStale } from "@/lib/d4sign/sync-round";

/** Tempo para a rodada D4Sign em segundo plano (`after`) terminar. */
export const maxDuration = 300;

export default async function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile } = await requireAuth("/crm");
  const modules = profile.role === "admin" ? [] : await listUserModules(profile.id);

  const sessionUser: CrmSessionUser = {
    appUserId: profile.id,
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
    partnerOnly: isPartnerOnlyEmail(user.email),
    canAccessIcp: canAccessModule({ role: profile.role, modules, module: "icp" }),
    modules,
  };

  // Reforço do cron do GitHub (que atrasa ou pula execuções): com o CRM em
  // uso, roda uma rodada do sync D4Sign se a última tiver mais de 4 minutos.
  after(() => runD4SignSyncRoundIfStale("crm-navigation"));

  return <AppShell sessionUser={sessionUser}>{children}</AppShell>;
}
