import { AlertCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UserManagementPanel, type MergedPerson } from "@/components/crm/user-management-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { overlayOfficialAvatars } from "@/lib/official-photos/overlay";
import { getOrqestraiColaboradoresLocal, type OrqestraiCollaborator } from "@/lib/orqestrai/client";

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

    const users = (data ?? []).map(({ auth_user_id, ...user }) => ({
      ...user,
      avatar_url: officialUrlById.get(user.id) ?? user.avatar_url,
      email: emailByAuthId.get(auth_user_id),
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
 * @bismarchipires.com.br). Sobra gente dos dois lados: colaborador sem
 * acesso ainda, e conta do CRM sem vínculo no RH (ex.: contas de sistema).
 */
function mergePeople(
  appUsers: Awaited<ReturnType<typeof getUsers>>["users"],
  collaborators: OrqestraiCollaborator[],
): MergedPerson[] {
  const collabByEmail = new Map<string, OrqestraiCollaborator>();
  const collabByLocalPart = new Map<string, OrqestraiCollaborator>();
  for (const c of collaborators) {
    const email = normalizeEmail(c.email);
    if (!email) continue;
    collabByEmail.set(email, c);
    collabByLocalPart.set(localPart(email), c);
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
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      email: user.email,
      hasAccess: true,
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
      avatar_url: null,
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
  const [{ users, error }, collaborators] = await Promise.all([
    getUsers(),
    getOrqestraiColaboradoresLocal(supabase),
  ]);

  const merged = mergePeople(users, collaborators);

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
