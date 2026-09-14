"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, Palette, Settings, UserRound } from "lucide-react";

import type { CrmSessionUser } from "@/components/crm/crm-session-user";
import { initialsFromUser } from "@/components/crm/crm-session-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SidebarAccountMenuProps = {
  sessionUser: CrmSessionUser;
  collapsed: boolean;
};

export function SidebarAccountMenu({ sessionUser, collapsed }: SidebarAccountMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = sessionUser.fullName?.trim() || sessionUser.email || "Conta";
  const areaLabel = sessionUser.area?.trim() || null;
  const initials = initialsFromUser(sessionUser.fullName, sessionUser.email);

  const areaTagClass =
    "inline-flex max-w-full truncate rounded-(--radius-v2-sm) border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-tight text-muted-foreground";

  async function signOut() {
    setSigningOut(true);
    try {
      const supabase = createSupabaseClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size={collapsed ? "icon" : "sm"}
      title={
        collapsed
          ? [displayName, areaLabel].filter(Boolean).join(" · ") || "Conta"
          : undefined
      }
      className={cn(
        "h-auto w-full gap-3 rounded-(--radius-v2-xl) border border-border bg-white px-2 py-2 text-left text-foreground hover:border-border-strong hover:bg-white",
        collapsed && "h-11 w-11 shrink-0 rounded-full p-0"
      )}
      aria-label="Menu da conta"
    >
      <Avatar className={cn("h-9 w-9 shrink-0 border border-border", collapsed && "h-9 w-9")}>
        {sessionUser.avatarUrl ? (
          <AvatarImage src={sessionUser.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
      </Avatar>
      {!collapsed ? (
        <span className="flex min-w-0 flex-1 flex-col items-stretch gap-0.5 text-left">
          <span className="truncate text-sm font-semibold leading-tight tracking-[-0.01em]">{displayName}</span>
          {areaLabel ? (
            <span className={cn(areaTagClass, "self-start")} title={areaLabel}>
              {areaLabel}
            </span>
          ) : sessionUser.email ? (
            <span className="truncate text-[11px] text-muted-foreground">{sessionUser.email}</span>
          ) : null}
        </span>
      ) : null}
      {!collapsed ? <MoreHorizontal className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.9} /> : null}
    </Button>
  );

  const popover = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent align="start" className="w-64 rounded-(--radius-v2-2xl) border-border p-2" side="top">
        <div className="mb-2 border-b border-border px-1 pb-2">
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          {sessionUser.email ? (
            <p className="truncate text-xs text-muted-foreground">{sessionUser.email}</p>
          ) : null}
          {areaLabel ? (
            <p className="mt-1.5">
              <span className={areaTagClass} title={areaLabel}>
                {areaLabel}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <Link
            href="/crm/perfil"
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full items-center justify-start gap-2 rounded-(--radius-v2-md) font-normal no-underline hover:no-underline",
            )}
          >
            <UserRound className="h-4 w-4 shrink-0" />
            Perfil
          </Link>
          <Link
            href="/crm/perfil"
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "inline-flex w-full items-center justify-start gap-2 rounded-(--radius-v2-md) font-normal no-underline hover:no-underline",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" />
            Preferências
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 rounded-(--radius-v2-md) font-normal text-muted-foreground"
            disabled
            title="Tema claro fixo nesta versão"
          >
            <Palette className="h-4 w-4 shrink-0" />
            Tema claro
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start gap-2 rounded-(--radius-v2-md) font-normal text-destructive hover:text-destructive"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {signingOut ? "A sair…" : "Sair"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  return popover;
}
