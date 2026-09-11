import { appUserAreaMatchesScopeKey } from "@/lib/crm/area-keys-alignment";

/**
 * Qualquer usuário com acesso à ficha do lead pode preencher/ajustar o escopo de
 * qualquer área — inclusive de áreas fora da sua própria. Antes disso era
 * restrito por `app_users.area`; a restrição existia só para direcionar quem
 * preenchia o quê, não como controle de acesso real, e travava colaboração
 * legítima entre áreas.
 */
export function canEditEscopoArea(
  _role: string | null | undefined,
  _profileArea: string | null | undefined,
  _areaKey: string,
): boolean {
  return true;
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
