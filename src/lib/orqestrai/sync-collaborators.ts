import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchOrqestraiCollaborators } from "@/lib/orqestrai/client";

export type OrqestraiSyncResult =
  | { ok: true; synced: number; syncedAt: string }
  | { ok: false; error: string };

/**
 * Substitui por completo `orqestrai_colaboradores` pelo estado atual de
 * `hr_employees` no ORQESTRAI (79 linhas — delete+insert é mais simples e
 * sempre correto do que tentar diffar upsert/remoção de quem saiu do RH).
 */
export async function syncOrqestraiCollaborators(
  supabase: SupabaseClient,
): Promise<OrqestraiSyncResult> {
  const rows = await fetchOrqestraiCollaborators();
  if (!rows) {
    return { ok: false, error: "Não foi possível ler hr_employees no ORQESTRAI." };
  }

  const now = new Date().toISOString();
  const { error: deleteError } = await supabase
    .from("orqestrai_colaboradores")
    .delete()
    .not("id", "is", null);
  if (deleteError) {
    return { ok: false, error: `Falha ao limpar tabela local: ${deleteError.message}` };
  }

  if (rows.length === 0) {
    return { ok: true, synced: 0, syncedAt: now };
  }

  const { error: insertError } = await supabase.from("orqestrai_colaboradores").insert(
    rows.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      email: r.email,
      department: r.department,
      position: r.position,
      employment_type: r.employmentType,
      is_active: r.isActive,
      admission_date: r.admissionDate,
      termination_date: r.terminationDate,
      last_synced_at: now,
    })),
  );
  if (insertError) {
    return { ok: false, error: `Falha ao gravar tabela local: ${insertError.message}` };
  }

  return { ok: true, synced: rows.length, syncedAt: now };
}
