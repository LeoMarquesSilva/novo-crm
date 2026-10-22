import { cn } from "@/lib/utils";
import type { RdMigrationStatus } from "@/lib/crm/rd-migration/state";

export type RdMigrationDisplayStatus = "a_preencher" | "pronto" | "pendente_crm" | "concluida" | "fora";

export const RD_MIGRATION_DISPLAY_LABELS: Record<RdMigrationDisplayStatus, string> = {
  a_preencher: "A preencher",
  pronto: "Pronto para a virada",
  pendente_crm: "No CRM, com pendências",
  concluida: "Concluída",
  fora: "Fora da migração",
};

const TONE: Record<RdMigrationDisplayStatus, string> = {
  a_preencher: "border-warning-border bg-warning-bg text-warning-text",
  pronto: "border-success-border bg-success-bg text-success-text",
  pendente_crm: "border-warning-border bg-warning-bg text-warning-text",
  concluida: "border-success-border bg-success-bg text-success-text",
  fora: "border-neutral-200 bg-neutral-100 text-neutral-600",
};

/** Situação mostrada na fila: o rascunho pronto para a virada aparece separado do que falta preencher. */
export function rdMigrationDisplayStatus(input: {
  status: RdMigrationStatus;
  readyForConversion: boolean;
}): RdMigrationDisplayStatus {
  if (input.status === "fora") return "fora";
  if (input.status === "concluida") return "concluida";
  if (input.status === "convertida") return "pendente_crm";
  return input.readyForConversion ? "pronto" : "a_preencher";
}

export function RdMigrationStatusBadge({
  status,
  className,
}: {
  status: RdMigrationDisplayStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        TONE[status],
        className,
      )}
    >
      {RD_MIGRATION_DISPLAY_LABELS[status]}
    </span>
  );
}
