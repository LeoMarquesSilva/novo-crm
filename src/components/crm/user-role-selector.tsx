"use client";

import { useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  admin: { label: "Admin", variant: "destructive" },
  comercial: { label: "Comercial", variant: "default" },
  controladoria: { label: "Controladoria", variant: "secondary" },
  financeiro: { label: "Financeiro", variant: "outline" },
};

const ROLE_SELECT_ITEMS: Record<string, string> = {
  admin: ROLE_LABELS.admin.label,
  comercial: ROLE_LABELS.comercial.label,
  controladoria: ROLE_LABELS.controladoria.label,
  financeiro: ROLE_LABELS.financeiro.label,
};

interface UserRoleSelectorProps {
  userId: string;
  currentRole: string;
}

export function UserRoleSelector({ userId, currentRole }: UserRoleSelectorProps) {
  const [role, setRole] = useState(currentRole);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  async function handleChange(newRole: string | null) {
    if (!newRole) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setRole(newRole);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const meta = ROLE_LABELS[role] ?? { label: role, variant: "secondary" as const };

  return (
    <div className="flex items-center gap-2">
      <Select
        items={ROLE_SELECT_ITEMS}
        value={role}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 w-[160px] bg-white/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Admin</SelectItem>
          <SelectItem value="comercial">Comercial</SelectItem>
          <SelectItem value="controladoria">Controladoria</SelectItem>
          <SelectItem value="financeiro">Financeiro</SelectItem>
        </SelectContent>
      </Select>
      {saved && (
        <Badge variant="secondary" className="text-xs">
          Salvo
        </Badge>
      )}
      {isPending && (
        <span className="text-xs text-muted-foreground">Salvando...</span>
      )}
      {!isPending && !saved && (
        <Badge variant={meta.variant} className="text-xs">
          {meta.label}
        </Badge>
      )}
    </div>
  );
}
