import { appUserAreaMatchesScopeKey } from "@/lib/crm/area-keys-alignment";

/**
 * Alinhado a `patch-lead-detail` para `cp_escopo_detalhe_json`: admin edita tudo;
 * comercial sem `app_users.area` edita tudo; comercial com área só a chave dessa área.
 */
export function canEditEscopoArea(
  role: string | null | undefined,
  profileArea: string | null | undefined,
  areaKey: string,
): boolean {
  if (role === "admin") return true;
  if (role !== "comercial") return false;
  const pa = profileArea?.trim() ?? "";
  if (!pa) return true;
  return appUserAreaMatchesScopeKey(pa, areaKey);
}

/** Comercial com área definida em outra prática — pode pedir ao gestor que preencha esta área. */
export function canRequestGestorFillForArea(
  role: string | null | undefined,
  profileArea: string | null | undefined,
  areaKey: string,
): boolean {
  if (role !== "comercial") return false;
  const pa = profileArea?.trim() ?? "";
  if (!pa) return false;
  return !appUserAreaMatchesScopeKey(pa, areaKey);
}
