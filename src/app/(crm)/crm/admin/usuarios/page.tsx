import { AlertCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UserManagementPanel, type MergedPerson } from "@/components/crm/user-management-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { overlayOfficialAvatars } from "@/lib/official-photos/overlay";
import {
  fetchOrqestraiPeopleIndex,
  getOrqestraiColaboradoresLocal,
  type OrqestraiCollaborator,
  type OrqestraiPeopleIndex,
} from "@/lib/orqestrai/client";

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** `gustavo@bpplaw.com.br` e `gustavo@bismarchipires.com.br` são a mesma pessoa. */
function localPart(email: string): string {
  return email.split("@")[0] ?? email;
}

async function getUsers() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_users")
      .select("id, auth_user_id, full_name, role, area, avatar_url, created_at")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });

    if (error) throw error;

    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authError) throw authError;

    const emailByAuthId = new Map(
      (authUsers.users ?? []).map((authUser) => [authUser.id, authUser.email ?? undefined]),
    );

    const withOfficialPhotos = await overlayOfficialAvatars(
      (data ?? []).map((user) => ({
        id: user.id,
        avatarUrl: user.avatar_url,
      })),
    );
    const officialUrlById = new Map(withOfficialPhotos.map((u) => [u.id, u.avatarUrl]));

    // Módulos liberados (ex.: ICP). Sem a tabela ainda no banco, todos ficam sem módulo.
    const { data: moduleRows } = await supabase
      .from("app_user_module_access")
      .select("app_user_id, module");
    const modulesByUser = new Map<string, string[]>();
    for (const row of moduleRows ?? []) {
      modulesByUser.set(row.app_user_id, [...(modulesByUser.get(row.app_user_id) ?? []), row.module]);
    }

    const users = (data ?? []).map(({ auth_user_id, ...user }) => ({
      ...user,
      avatar_url: officialUrlById.get(user.id) ?? user.avatar_url,
      email: emailByAuthId.get(auth_user_id),
      modules: modulesByUser.get(user.id) ?? [],
    }));

    return { users, error: null };
  } catch (err) {
    return {
      users: [],
      error: err instanceof Error ? err.message : "Erro ao carregar usuários",
    };
  }
}

/**
 * Junta o quadro real de colaboradores (ORQESTRAI, espelho local) com quem
 * tem login no CRM (`app_users`) — uma lista só, não duas telas separadas.
 * Casamento por e-mail (e por local-part, pra cobrir @bpplaw.com.br vs
 * @bismarchipires.com.br) — o do RH e, em seguida, o de login no ORQESTRAI,
 * pra quem usa outro e-mail no dia a dia (ex.: Samuel entra como
 * `controladoria@`, mas no RH é `samuel@`). O do RH tem prioridade: o de
 * login só ocupa chave livre. Sobra gente dos dois lados: colaborador sem
 * acesso ainda, e conta do CRM sem vínculo no RH (ex.: contas de sistema).
 * Foto: a oficial por `app_users.id` (API de fotos) e, sem ela, a do
 * ORQESTRAI pelo e-mail — único caminho pra quem ainda não tem login.
 */
function mergePeople(
  appUsers: Awaited<ReturnType<typeof getUsers>>["users"],
  collaborators: OrqestraiCollaborator[],
  people: OrqestraiPeopleIndex,
): MergedPerson[] {
  const photoFor = (raw: string | null | undefined): string | null => {
    const email = normalizeEmail(raw);
    if (!email) return null;
    return people.photoByEmail.get(email) ?? people.photoByLocalPart.get(localPart(email)) ?? null;
  };

  const collabByEmail = new Map<string, OrqestraiCollaborator>();
  const collabByLocalPart = new Map<string, OrqestraiCollaborator>();
  for (const c of collaborators) {
    const email = normalizeEmail(c.email);
    if (!email) continue;
    collabByEmail.set(email, c);
    collabByLocalPart.set(localPart(email), c);
  }
  for (const c of collaborators) {
    const loginEmail = normalizeEmail(people.loginEmailByCollaboratorId.get(c.id));
    if (!loginEmail) continue;
    if (!collabByEmail.has(loginEmail)) collabByEmail.set(loginEmail, c);
    if (!collabByLocalPart.has(localPart(loginEmail))) collabByLocalPart.set(localPart(loginEmail), c);
  }

  const matchedCollabIds = new Set<string>();
  const merged: MergedPerson[] = [];

  for (const user of appUsers) {
    const email = normalizeEmail(user.email);
    const match =
      (email && collabByEmail.get(email)) || (email && collabByLocalPart.get(localPart(email))) || null;
    if (match) matchedCollabIds.add(match.id);

    merged.push({
      id: user.id,
      full_name: user.full_name,
      role: user.role,
      area: user.area,
      avatar_url: user.avatar_url ?? photoFor(user.email),
      created_at: user.created_at,
      email: user.email,
      hasAccess: true,
      modules: user.modules,
      department: match?.department ?? null,
      position: match?.position ?? null,
      orqestraiActive: match?.isActive ?? null,
    });
  }

  for (const c of collaborators) {
    if (matchedCollabIds.has(c.id)) continue;
    if (!c.isActive) continue; // ex-colaborador sem login: não vale poluir a tela de acesso
    merged.push({
      id: `orqestrai:${c.id}`,
      full_name: c.fullName,
      role: "sem_acesso",
      area: null,
      avatar_url: photoFor(people.loginEmailByCollaboratorId.get(c.id)) ?? photoFor(c.email),
      created_at: c.admissionDate ?? new Date().toISOString(),
      email: c.email ?? undefined,
      hasAccess: false,
      department: c.department,
      position: c.position,
      orqestraiActive: c.isActive,
    });
  }

  return merged;
}

export default async function UsuariosAdminPage() {
  await requireAdmin("/crm/admin/usuarios");

  const supabase = createSupabaseAdminClient();
  const [{ users, error }, collaborators, people] = await Promise.all([
    getUsers(),
    getOrqestraiColaboradoresLocal(supabase),
    fetchOrqestraiPeopleIndex(),
  ]);

  const merged = mergePeople(users, collaborators, people);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar usuários</AlertTitle>
          <AlertDescription>
            {error}
            {error.includes("SUPABASE_SERVICE_ROLE_KEY") && (
              <span className="mt-1 block text-xs">
                Adicione a variável <code>SUPABASE_SERVICE_ROLE_KEY</code> ao
                arquivo <code>.env</code> (disponível em: Supabase → Settings →
                API → service_role key).
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <UserManagementPanel initialUsers={merged} />
    </div>
  );
}
