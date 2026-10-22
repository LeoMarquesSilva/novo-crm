import { notFound } from "next/navigation";

import { RdMigrationForm } from "@/components/crm/rd-migration/rd-migration-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/server";
import { loadRdMigrationDetail, type RdMigrationDetail } from "@/lib/crm/rd-migration/service";
import { logServerError, PublicError } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RdMigrationLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  if (!UUID_RE.test(id)) notFound();
  const { user, profile } = await requireAuth(`/crm/migracao-rd/${encodeURIComponent(id)}`);

  let detail: RdMigrationDetail | null = null;
  let error: string | null = null;
  try {
    detail = await loadRdMigrationDetail(createSupabaseAdminClient(), id, {
      appUserId: profile.id,
      isAdmin: profile.role === "admin",
      email: user.email?.trim().toLowerCase() ?? null,
    });
  } catch (err) {
    if (err instanceof PublicError && err.status === 404) notFound();
    error =
      err instanceof PublicError
        ? err.message
        : `Não foi possível carregar a migração (ref ${logServerError("rd-migration/lead-page", err)}).`;
  }

  if (!detail) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Migração indisponível</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  return <RdMigrationForm key={detail.updatedAt ?? detail.opportunityId} initial={detail} />;
}
