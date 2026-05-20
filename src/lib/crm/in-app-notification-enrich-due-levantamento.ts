import type { SupabaseClient } from "@supabase/supabase-js";
import { getDueAreaTasksSummaryWithBreakdown } from "@/lib/crm/due-area-tasks";
import {
  asRecordPayload,
  extractOportunidadeIdFromNotificationPayload,
  type EnrichableInAppNotificationRow,
} from "@/lib/crm/in-app-notification-enrich-lead-creator";

const DUE_LEVANTAMENTO_TIPOS = new Set([
  "due_area_task",
  "due_compilacao",
  "due_revisao_area",
  "due_revisao_resposta",
]);

/**
 * Acrescenta `due_levantamento` ao payload (resumo por área, igual ao bloco do kanban).
 */
export async function enrichInAppNotificationsWithDueLevantamento(
  admin: SupabaseClient,
  rows: EnrichableInAppNotificationRow[],
): Promise<EnrichableInAppNotificationRow[]> {
  const oppIds = new Set<string>();
  for (const row of rows) {
    if (!DUE_LEVANTAMENTO_TIPOS.has(row.tipo)) continue;
    const id = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (id) oppIds.add(id);
  }
  if (oppIds.size === 0) return rows;

  const { summary, breakdown } = await getDueAreaTasksSummaryWithBreakdown(admin, [...oppIds]);

  return rows.map((row) => {
    if (!DUE_LEVANTAMENTO_TIPOS.has(row.tipo)) return row;
    const oppId = extractOportunidadeIdFromNotificationPayload(row.payload);
    if (!oppId) return row;
    const sum = summary.get(oppId);
    const areas = breakdown.get(oppId);
    if (!sum || !areas?.length || sum.total <= 0) return row;

    const due_levantamento = {
      disponibilizados: sum.disponibilizados,
      total: sum.total,
      atrasados: sum.atrasados,
      areas: areas.map((a) => ({
        areaKey: a.areaKey,
        entregue: a.entregue,
        emAtraso: a.emAtraso,
        semProcessosAtivos: a.semProcessosAtivos,
      })),
    };

    return {
      ...row,
      payload: { ...asRecordPayload(row.payload), due_levantamento },
    };
  });
}
