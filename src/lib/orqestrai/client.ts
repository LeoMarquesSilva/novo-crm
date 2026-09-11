import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client server-side para o banco do ORQESTRAI (projeto Supabase separado do
 * CRM — `qwihfvagemzlyypeohpc`). Nunca importar deste módulo em código que
 * roda no browser: a service role key só existe no runtime do servidor.
 *
 * Fonte: tabela `hr_employees` — quadro de colaboradores do RH (inclui
 * ex-funcionários sem login em nenhum sistema, ao contrário de `app_users`
 * do próprio CRM, que só tem quem já logou aqui).
 */
export type OrqestraiCollaborator = {
  id: string;
  fullName: string;
  email: string | null;
  department: string | null;
  position: string | null;
  employmentType: string | null;
  isActive: boolean;
  admissionDate: string | null;
  terminationDate: string | null;
};

function url(): string | null {
  const v = process.env.ORQESTRAI_SUPABASE_URL?.trim();
  return v || null;
}

function serviceRoleKey(): string | null {
  const v = process.env.ORQESTRAI_SUPABASE_SERVICE_ROLE_KEY?.trim();
  return v || null;
}

/**
 * Busca o quadro de colaboradores do ORQESTRAI. Nunca lança: qualquer falha
 * (env ausente, rede, erro do Postgres) devolve `null` para o chamador cair
 * em fallback (ex.: lista local `app_users`).
 */
export async function fetchOrqestraiCollaborators(): Promise<OrqestraiCollaborator[] | null> {
  const supabaseUrl = url();
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) return null;

  try {
    const supabase = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase
      .from("hr_employees")
      .select(
        "id, full_name, email, department, position, employment_type, is_active, admission_date, termination_date",
      )
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true });
    if (error || !data) return null;

    return data.map((row) => ({
      id: String(row.id),
      fullName: String(row.full_name),
      email: (row.email as string | null) ?? null,
      department: (row.department as string | null) ?? null,
      position: (row.position as string | null) ?? null,
      employmentType: (row.employment_type as string | null) ?? null,
      isActive: Boolean(row.is_active),
      admissionDate: (row.admission_date as string | null) ?? null,
      terminationDate: (row.termination_date as string | null) ?? null,
    }));
  } catch {
    return null;
  }
}

/**
 * Lê o espelho local `orqestrai_colaboradores` (banco do próprio CRM) —
 * caminho usado por qualquer requisição de usuário (rápido, sem depender do
 * ORQESTRAI estar de pé). A consulta ao vivo em `fetchOrqestraiCollaborators`
 * só roda no cron diário que mantém essa tabela atualizada.
 */
export async function getOrqestraiColaboradoresLocal(
  supabase: SupabaseClient,
): Promise<OrqestraiCollaborator[]> {
  const { data, error } = await supabase
    .from("orqestrai_colaboradores")
    .select(
      "id, full_name, email, department, position, employment_type, is_active, admission_date, termination_date",
    )
    .order("is_active", { ascending: false })
    .order("full_name", { ascending: true });
  if (error || !data) return [];

  return data.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name),
    email: (row.email as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    position: (row.position as string | null) ?? null,
    employmentType: (row.employment_type as string | null) ?? null,
    isActive: Boolean(row.is_active),
    admissionDate: (row.admission_date as string | null) ?? null,
    terminationDate: (row.termination_date as string | null) ?? null,
  }));
}
