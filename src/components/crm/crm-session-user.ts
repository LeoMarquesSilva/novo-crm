import type { CrmModule } from "@/lib/auth/crm-access-policy";
import type { Database } from "@/lib/supabase/database.types";

export type CrmSessionUser = {
  /** `app_users.id` do usuário logado. */
  appUserId: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  area: string | null;
  role: Database["public"]["Enums"]["user_role"] | null;
  /** Admin ou sócio signatário — vê a área "Assinar Contratos". */
  canAccessPartnerSignatures: boolean;
  /** Sócio: o CRM mostra só "Assinar Contratos" (e o perfil). */
  partnerOnly: boolean;
  /** Admin ou usuário com o ICP liberado em Configurações → Usuários. */
  canAccessIcp: boolean;
  /** Módulos/times liberados em Configurações → Usuários (admin: vazio, vê tudo). */
  modules: CrmModule[];
};

export function initialsFromUser(fullName: string | null, email: string | null): string {
  const name = fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const em = email?.trim();
  if (em) return em.slice(0, 2).toUpperCase();
  return "?";
}
