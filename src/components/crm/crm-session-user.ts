import type { Database } from "@/lib/supabase/database.types";

export type CrmSessionUser = {
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  area: string | null;
  role: Database["public"]["Enums"]["user_role"] | null;
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
