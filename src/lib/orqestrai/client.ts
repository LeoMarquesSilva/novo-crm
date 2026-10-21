import type { SupabaseClient } from "@supabase/supabase-js";
import { createExternalServiceClient } from "@/lib/supabase/external-service-client";
import { withVersion } from "@/lib/official-photos/overlay";

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
    const supabase = createExternalServiceClient(supabaseUrl, key);
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

/** Curto: roda no render da tela de Usuários; sem resposta, ficam as iniciais. */
const PEOPLE_INDEX_TIMEOUT_MS = 2500;

export type OrqestraiPeopleIndex = {
  photoByEmail: Map<string, string>;
  photoByLocalPart: Map<string, string>;
  /** `hr_employees.id` → e-mail de login no ORQESTRAI (pode diferir do e-mail do RH). */
  loginEmailByCollaboratorId: Map<string, string>;
};

/**
 * Fotos oficiais e e-mail de login de cada colaborador, lidos ao vivo do
 * ORQESTRAI (view `official_system_photos` + `hr_employees.user_id`) para a
 * tela de Usuários:
 * - foto de quem ainda não tem login no CRM — a `official-photos-api` só acha
 *   a pessoa pelo `app_users.id` vinculado, então o "sem acesso" ficava só
 *   com as iniciais. Indexada também pelo local-part, pra cobrir
 *   @bpplaw.com.br vs @bismarchipires.com.br;
 * - e-mail de login, pra casar quem entra no CRM com um e-mail diferente do
 *   cadastro do RH (ex.: `controladoria@` no login, `samuel@` no RH).
 * Duas consultas pequenas em paralelo. Nunca lança: sem env, timeout ou erro
 * devolve o que conseguiu (ou índice vazio) e a tela casa só pelo e-mail do RH.
 */
export async function fetchOrqestraiPeopleIndex(): Promise<OrqestraiPeopleIndex> {
  const index: OrqestraiPeopleIndex = {
    photoByEmail: new Map(),
    photoByLocalPart: new Map(),
    loginEmailByCollaboratorId: new Map(),
  };
  const supabaseUrl = url();
  const key = serviceRoleKey();
  if (!supabaseUrl || !key) return index;

  try {
    const supabase = createExternalServiceClient(supabaseUrl, key, {
      timeoutMs: PEOPLE_INDEX_TIMEOUT_MS,
    });
    const [photos, employees] = await Promise.all([
      supabase
        .from("official_system_photos")
        .select("user_id, normalized_email, photo_url, source, version"),
      supabase.from("hr_employees").select("id, user_id"),
    ]);
    if (photos.error || !photos.data) return index;

    const loginEmailByUserId = new Map<string, string>();
    for (const row of photos.data) {
      const email = (row.normalized_email as string | null) ?? "";
      if (!email) continue;
      loginEmailByUserId.set(String(row.user_id), email);

      const photoUrl = row.photo_url as string | null;
      if (!photoUrl || row.source === "none") continue;
      const versioned = withVersion(photoUrl, String(row.version));
      index.photoByEmail.set(email, versioned);
      const local = email.split("@")[0];
      if (local && !index.photoByLocalPart.has(local)) index.photoByLocalPart.set(local, versioned);
    }

    for (const row of employees.data ?? []) {
      const loginEmail = row.user_id ? loginEmailByUserId.get(String(row.user_id)) : undefined;
      if (loginEmail) index.loginEmailByCollaboratorId.set(String(row.id), loginEmail);
    }
    return index;
  } catch {
    return index;
  }
}
