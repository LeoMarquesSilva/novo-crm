import { AlertCircle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { UserManagementPanel } from "@/components/crm/user-management-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

async function getUsers() {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("app_users")
      .select("id, full_name, role, area, avatar_url, created_at")
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });

    if (error) throw error;
    return { users: data ?? [], error: null };
  } catch (err) {
    return {
      users: [],
      error: err instanceof Error ? err.message : "Erro ao carregar usuários",
    };
  }
}

export default async function UsuariosAdminPage() {
  await requireAdmin("/crm/admin/usuarios");

  const { users, error } = await getUsers();

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

      <UserManagementPanel initialUsers={users} />
    </div>
  );
}
