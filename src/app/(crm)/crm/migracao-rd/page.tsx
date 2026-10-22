import { ArrowRightLeft } from "lucide-react";

import { CrmPageHeader, type HeaderStat } from "@/components/crm/crm-page-header";
import { RdMigrationQueueView } from "@/components/crm/rd-migration/rd-migration-queue";
import { rdMigrationDisplayStatus } from "@/components/crm/rd-migration/rd-migration-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireAuth } from "@/lib/auth/server";
import { loadRdMigrationQueue, type RdMigrationQueue } from "@/lib/crm/rd-migration/service";
import { logServerError } from "@/lib/http/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function RdMigrationPage() {
  const { user, profile } = await requireAuth("/crm/migracao-rd");
  const isAdmin = profile.role === "admin";

  let queue: RdMigrationQueue | null = null;
  let error: string | null = null;
  try {
    queue = await loadRdMigrationQueue(createSupabaseAdminClient(), {
      appUserId: profile.id,
      isAdmin,
      email: user.email?.trim().toLowerCase() ?? null,
    });
  } catch (err) {
    error = `Não foi possível carregar a fila (ref ${logServerError("rd-migration/page", err)}).`;
  }

  const stats: HeaderStat[] = [];
  if (queue) {
    let toFill = 0;
    let ready = 0;
    let crmPending = 0;
    let done = 0;
    for (const item of queue.items) {
      const status = rdMigrationDisplayStatus(item);
      if (status === "a_preencher") toFill += 1;
      if (status === "pronto") ready += 1;
      if (status === "pendente_crm") crmPending += 1;
      if (status === "concluida") done += 1;
    }
    stats.push(
      { label: isAdmin ? "Negócios na migração" : "Seus negócios", value: queue.items.length },
      { label: "A preencher", value: toFill, tone: toFill > 0 ? "warning" : "default" },
      { label: "Prontos para a virada", value: ready },
      queue.virada.convertidoEm
        ? { label: "No CRM com pendências", value: crmPending, tone: crmPending > 0 ? "warning" : "default", detail: `${done} concluídos` }
        : { label: "Concluídos", value: done },
    );
  }

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Virada do RD"
        title="Migrar do RD"
        description="Negócios em andamento no RD Station que passam a andar no CRM na virada. Cada responsável preenche o que o CRM pede e o RD não tem; o resto vem pré-preenchido do RD."
        icon={ArrowRightLeft}
        stats={stats}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Fila indisponível</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : queue ? (
        <RdMigrationQueueView queue={queue} isAdmin={isAdmin} />
      ) : null}
    </div>
  );
}
