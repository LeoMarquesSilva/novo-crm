import { APP_USER_ALL_AREAS } from "./crm-areas";

/** Departamentos / áreas do perfil CRM — mesmas strings de `CRM_PRACTICE_AREAS` + `CRM_PROFILE_ONLY_AREAS`. */
export const APP_USER_AREAS = APP_USER_ALL_AREAS;

export type AppUserArea = (typeof APP_USER_AREAS)[number];

export const APP_USER_AREA_FORM_ITEMS: Record<string, string> = Object.fromEntries(
  APP_USER_AREAS.map((a) => [a, a]),
);

/** Labels e estilos de badge para `app_users.role`. */
export const APP_USER_ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "Admin", color: "bg-red-100 text-red-700" },
  comercial: { label: "Comercial", color: "bg-sky-100 text-sky-700" },
  controladoria: { label: "Controladoria", color: "bg-violet-100 text-violet-700" },
  financeiro: { label: "Financeiro", color: "bg-emerald-100 text-emerald-700" },
};

export const APP_USER_ROLE_SELECT_ITEMS: Record<string, string> = Object.fromEntries(
  Object.entries(APP_USER_ROLE_LABELS).map(([k, v]) => [k, v.label]),
);
