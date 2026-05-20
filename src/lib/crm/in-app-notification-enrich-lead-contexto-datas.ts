import type { SupabaseClient } from "@supabase/supabase-js";
import {
  asRecordPayload,
  extractOportunidadeIdFromNotificationPayload,
  type EnrichableInAppNotificationRow,
} from "@/lib/crm/in-app-notification-enrich-lead-creator";

function combineDateAndTimeIso(date: string | null, time: string | null): string | null {
  if (!date?.trim()) return null;
  const normalizedTime = time?.trim() || "18:00";
  const value = `${date.trim()}T${normalizedTime.length === 5 ? `${normalizedTime}:00` : normalizedTime}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Acrescenta `lead_contexto_datas` ao payload (criação do lead na oportunidade, prazo DUE, reunião — `lead_intakes`).
 */
export async function enrichInAppNotificationsWithLeadContextoDatas(
  admin: SupabaseClient,
  rows: EnrichableInAppNotificationRow[],
): Promise<EnrichableInAppNotificationRow[]> {
  const oppIds = new Set<string>();
  for (const row of rows) {
    const id = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (id) oppIds.add(id);
  }
  if (oppIds.size === 0) return rows;

  const ids = [...oppIds];
  const [{ data: opps }, { data: intakes }] = await Promise.all([
    admin.from("oportunidades").select("id, created_at").in("id", ids),
    admin
      .from("lead_intakes")
      .select(
        "oportunidade_id, data_entrega_due, horario_entrega_due, data_reuniao, horario_reuniao, due_diligence",
      )
      .in("oportunidade_id", ids),
  ]);

  const createdByOpp = new Map<string, string | null>();
  for (const o of opps ?? []) {
    createdByOpp.set(o.id as string, (o.created_at as string) ?? null);
  }

  type IntakeRow = {
    oportunidade_id: string;
    data_entrega_due: string | null;
    horario_entrega_due: string | null;
    data_reuniao: string | null;
    horario_reuniao: string | null;
    due_diligence: boolean | null;
  };

  const intakeByOpp = new Map<string, IntakeRow>();
  for (const row of (intakes ?? []) as IntakeRow[]) {
    intakeByOpp.set(row.oportunidade_id, row);
  }

  return rows.map((row) => {
    const oppId = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (!oppId) return row;

    const created = createdByOpp.get(oppId) ?? null;
    const intake = intakeByOpp.get(oppId);
    const dueEntrega =
      intake?.due_diligence === true
        ? combineDateAndTimeIso(intake.data_entrega_due ?? null, intake.horario_entrega_due ?? null)
        : null;
    const reuniao = combineDateAndTimeIso(intake?.data_reuniao ?? null, intake?.horario_reuniao ?? null);

    if (created === undefined && !intake) return row;

    const lead_contexto_datas = {
      lead_criado_em: created ?? null,
      due_entrega_em: dueEntrega,
      reuniao_em: reuniao,
    };

    return {
      ...row,
      payload: { ...asRecordPayload(row.payload), lead_contexto_datas },
    };
  });
}
