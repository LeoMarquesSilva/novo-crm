"use client";

import { createContext, useContext, useMemo } from "react";

import { toCrmActor, type CrmActor } from "@/lib/auth/crm-access-policy";
import type { CrmSessionUser } from "@/components/crm/crm-session-user";

const CrmSessionContext = createContext<CrmSessionUser | null>(null);

export function CrmSessionProvider({
  sessionUser,
  children,
}: {
  sessionUser: CrmSessionUser;
  children: React.ReactNode;
}) {
  return <CrmSessionContext.Provider value={sessionUser}>{children}</CrmSessionContext.Provider>;
}

/** Usuário logado (fora do `AppShell` devolve null). */
export function useCrmSessionUser(): CrmSessionUser | null {
  return useContext(CrmSessionContext);
}

/** Ator para a política (`canPerformLeadAction`); null sem sessão ou papel válido. */
export function useCrmActor(): CrmActor | null {
  const sessionUser = useCrmSessionUser();
  return useMemo(
    () =>
      sessionUser
        ? toCrmActor({
            appUserId: sessionUser.appUserId,
            role: sessionUser.role,
            area: sessionUser.area,
            email: sessionUser.email,
            modules: sessionUser.modules,
          })
        : null,
    [sessionUser],
  );
}
