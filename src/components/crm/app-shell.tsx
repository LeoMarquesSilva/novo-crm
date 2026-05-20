"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpenText,
  BookText,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  FileText,
  LayoutDashboard,
  Layers,
  MessageCircle,
  Menu,
  Presentation,
  Search,
  ShieldCheck,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { CrmNotificationsBell } from "@/components/crm/crm-notifications-bell";
import type { CrmSessionUser } from "@/components/crm/crm-session-user";
import { SidebarAccountMenu } from "@/components/crm/sidebar-account-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SidebarItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SidebarGroup = {
  id: string;
  title: string;
  items: SidebarItem[];
};

const STORAGE_KEYS = {
  favorites: "crm.sidebar.favorites.v1",
  groups: "crm.sidebar.groups.v1",
};

const mainItems: SidebarItem[] = [
  {
    href: "/crm",
    label: "Dashboard",
    description: "Visão executiva",
    icon: LayoutDashboard,
  },
  {
    href: "/crm/leads",
    label: "Leads",
    description: "Pipeline e oportunidades",
    icon: BriefcaseBusiness,
  },
  {
    href: "/crm/documentos",
    label: "Due diligence",
    description: "Prazos, marcos e arquivos da DUE",
    icon: Presentation,
  },
  {
    href: "/crm/clientes",
    label: "Clientes",
    description: "Base de relacionamento",
    icon: Users,
  },
  {
    href: "/crm/contratos",
    label: "Contratos",
    description: "Monitoramento jurídico",
    icon: FileText,
  },
];

const adminItems: SidebarItem[] = [
  {
    href: "/crm/admin/usuarios",
    label: "Usuários",
    description: "Perfis e acesso",
    icon: ShieldCheck,
  },
  {
    href: "/crm/admin/campos",
    label: "Campos",
    description: "Regras do pipeline",
    icon: Layers,
  },
  {
    href: "/crm/admin/documentos",
    label: "Documentos",
    description: "Modelos e proposta",
    icon: FileText,
  },
  {
    href: "/crm/admin/proposta-escopo",
    label: "Catálogo de Escopos",
    description: "Modelos de escopo e investimento",
    icon: BookOpenText,
  },
  {
    href: "/crm/admin/integracoes",
    label: "Integrações",
    description: "RD, WhatsApp e serviços",
    icon: MessageCircle,
  },
  {
    href: "/crm/admin/clausulas",
    label: "Cláusulas",
    description: "Modelos para contratos",
    icon: BookText,
  },
];

/** Dashboard é `/crm`; não usar prefixo, senão `/crm/leads` acende o item errado. */
function isNavLinkActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/crm") {
    return pathname === "/crm";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readStringArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readGroupState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.groups) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function SidebarNavItem({
  item,
  active,
  collapsed,
  favorite,
  onToggleFavorite,
}: {
  item: SidebarItem;
  active: boolean;
  collapsed: boolean;
  favorite: boolean;
  onToggleFavorite: (href: string) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group/nav-item relative flex items-center rounded-2xl border px-3 py-2.5 text-[13px] transition-all duration-150",
        collapsed ? "justify-center" : "gap-3",
        active
          ? "border-primary-dark/10 bg-white text-primary-dark shadow-[0_10px_26px_rgba(16,31,46,0.08)]"
          : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-white/75 hover:text-primary-dark",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors",
          active ? "bg-primary-dark text-white" : "bg-transparent text-slate-500 group-hover/nav-item:bg-slate-100",
        )}
      >
        <Icon className="size-4" strokeWidth={1.9} />
      </span>

      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold tracking-[-0.01em]">{item.label}</span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-slate-400">
              {item.description}
            </span>
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleFavorite(item.href);
                }}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all duration-150 hover:bg-slate-100 hover:text-accent-yellow-dark group-hover/nav-item:opacity-100",
                  favorite && "text-accent-yellow-dark opacity-100",
                )}
              >
                <Star className={cn("size-3.5", favorite && "fill-current")} strokeWidth={1.9} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="w-auto rounded-lg bg-primary-dark px-2 py-1 text-xs text-white">
              {favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </Link>
  );
}

function SidebarSection({
  group,
  pathname,
  collapsed,
  favorites,
  search,
  open,
  onToggleOpen,
  onToggleFavorite,
}: {
  group: SidebarGroup;
  pathname: string | null;
  collapsed: boolean;
  favorites: string[];
  search: string;
  open: boolean;
  onToggleOpen: (id: string) => void;
  onToggleFavorite: (href: string) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const visibleItems = normalizedSearch
    ? group.items.filter((item) =>
        [item.label, item.description].join(" ").toLowerCase().includes(normalizedSearch),
      )
    : group.items;

  if (visibleItems.length === 0) return null;

  return (
    <section className="space-y-1.5">
      {!collapsed ? (
        <button
          type="button"
          onClick={() => onToggleOpen(group.id)}
          className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"
        >
          <span>{group.title}</span>
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-150", open ? "rotate-0" : "-rotate-90")}
            strokeWidth={2}
          />
        </button>
      ) : null}

      <AnimatePresence initial={false}>
        {(open || collapsed) ? (
          <motion.div
            key={group.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-1">
              {visibleItems.map((item) => (
                <SidebarNavItem
                  key={item.href}
                  item={item}
                  active={isNavLinkActive(pathname, item.href)}
                  collapsed={collapsed}
                  favorite={favorites.includes(item.href)}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

export function AppShell({
  children,
  sessionUser,
}: {
  children: React.ReactNode;
  sessionUser: CrmSessionUser;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    commercial: true,
    admin: true,
  });
  const [hydratedStorage, setHydratedStorage] = useState(false);

  const showAdminNav = sessionUser.role === "admin";
  const displayName = sessionUser.fullName?.trim() || sessionUser.email || "Conta";
  const workspaceLabel = sessionUser.area?.trim() || "Workspace corporativo";

  const groups = useMemo<SidebarGroup[]>(
    () => [
      { id: "commercial", title: "Comercial", items: mainItems },
      ...(showAdminNav ? [{ id: "admin", title: "Configurações", items: adminItems }] : []),
    ],
    [showAdminNav],
  );

  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const favoriteItems = favorites
    .map((href) => allItems.find((item) => item.href === href))
    .filter((item): item is SidebarItem => Boolean(item));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFavorites(readStringArray(STORAGE_KEYS.favorites));
      setOpenGroups((current) => ({ ...current, ...readGroupState() }));
      setHydratedStorage(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydratedStorage) return;
    window.localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  }, [favorites, hydratedStorage]);

  useEffect(() => {
    if (!hydratedStorage) return;
    window.localStorage.setItem(STORAGE_KEYS.groups, JSON.stringify(openGroups));
  }, [openGroups, hydratedStorage]);

  function toggleFavorite(href: string) {
    setFavorites((current) =>
      current.includes(href) ? current.filter((item) => item !== href) : [href, ...current],
    );
  }

  function toggleGroup(id: string) {
    setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <TooltipProvider delayDuration={220} skipDelayDuration={80}>
      <div className="relative min-h-dvh w-full max-w-full overflow-x-hidden bg-[#f8f9fb]">
        <div className="sticky top-0 z-40 flex items-center justify-between border-b border-[#e6e9ef] bg-[#f8f9fb]/95 px-4 py-3 shadow-[0_1px_2px_rgba(16,31,46,0.03)] lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-10 items-center justify-center rounded-xl border border-[#e1e5eb] bg-white text-primary-dark"
            aria-label="Abrir menu lateral"
          >
            <Menu className="size-5" strokeWidth={2} />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-bold tracking-[-0.02em] text-primary-dark">Bismarchi | Pires</p>
            <p className="truncate text-[11px] text-slate-500">{workspaceLabel}</p>
          </div>
          <CrmNotificationsBell />
        </div>

        <AnimatePresence>
          {mobileOpen ? (
            <>
              <motion.button
                type="button"
                aria-label="Fechar menu lateral"
                className="fixed inset-0 z-50 bg-primary-dark/25 lg:hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                className="fixed inset-y-0 left-0 z-[60] flex w-[min(88vw,320px)] flex-col border-r border-[#e6e9ef] bg-[#f3f5f8] p-4 shadow-[18px_0_45px_rgba(16,31,46,0.14)] lg:hidden"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#101F2E_0%,#24615b_58%,#C8A96B_100%)] text-sm font-black tracking-[-0.05em] text-white">
                    BP
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold tracking-[-0.02em] text-primary-dark">
                      Bismarchi | Pires
                    </p>
                    <p className="truncate text-[11px] font-medium text-slate-500">{workspaceLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="flex size-9 items-center justify-center rounded-xl border border-[#e1e5eb] bg-white text-slate-500"
                    aria-label="Fechar menu lateral"
                  >
                    <X className="size-4" strokeWidth={2} />
                  </button>
                </div>

                <div className="mb-4">
                  <div className="flex h-9 items-center gap-2 rounded-[14px] border border-[#e1e5eb] bg-white px-3">
                    <Search className="size-4 shrink-0 text-slate-400" strokeWidth={1.9} />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar..."
                      className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-primary-dark outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <nav className="crm-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4">
                  {favoriteItems.length > 0 ? (
                    <section className="space-y-1.5">
                      <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                        Favoritos
                      </p>
                      <div className="space-y-1">
                        {favoriteItems.map((item) => (
                          <SidebarNavItem
                            key={item.href}
                            item={item}
                            active={isNavLinkActive(pathname, item.href)}
                            collapsed={false}
                            favorite
                            onToggleFavorite={toggleFavorite}
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {groups.map((group) => (
                    <SidebarSection
                      key={group.id}
                      group={group}
                      pathname={pathname}
                      collapsed={false}
                      favorites={favorites}
                      search={search}
                      open={openGroups[group.id] ?? true}
                      onToggleOpen={toggleGroup}
                      onToggleFavorite={toggleFavorite}
                    />
                  ))}
                </nav>
                <SidebarAccountMenu sessionUser={sessionUser} collapsed={false} />
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        <aside
          className={cn(
            "fixed left-0 top-0 z-40 hidden h-dvh max-h-dvh flex-col border-r border-[#e6e9ef] bg-[#f3f5f8] shadow-[18px_0_45px_rgba(16,31,46,0.045)] transition-[width] duration-200 lg:flex",
            collapsed ? "w-[88px]" : "w-[282px]",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col px-3 py-4">
            <div className={cn("mb-3 flex items-center gap-3 px-1", collapsed && "justify-center")}>
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[16px] bg-[linear-gradient(135deg,#101F2E_0%,#24615b_58%,#C8A96B_100%)] text-sm font-black tracking-[-0.05em] text-white shadow-[0_12px_24px_rgba(16,31,46,0.16)]">
                BP
              </div>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold tracking-[-0.02em] text-primary-dark">
                      Bismarchi | Pires
                    </p>
                    <p className="truncate text-[11px] font-medium text-slate-500">{workspaceLabel}</p>
                  </div>
                  <button
                    type="button"
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-primary-dark"
                    aria-label="Trocar workspace"
                  >
                    <ChevronsUpDown className="size-3.5" strokeWidth={2} />
                  </button>
                </>
              ) : null}
            </div>

            {!collapsed ? (
              <div className="mb-4 px-1">
                <div className="group/search flex h-9 items-center gap-2 rounded-[14px] border border-[#e1e5eb] bg-white px-3 shadow-[0_1px_2px_rgba(16,31,46,0.03)] transition-colors hover:border-slate-300">
                  <Search className="size-4 shrink-0 text-slate-400" strokeWidth={1.9} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar..."
                    className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-primary-dark outline-none placeholder:text-slate-400"
                  />
                  <kbd className="rounded-md border border-slate-200 bg-[#f8f9fb] px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                    ⌘K
                  </kbd>
                </div>
              </div>
            ) : null}

            <nav className="crm-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1 pb-3">
              {!collapsed && favoriteItems.length > 0 ? (
                <section className="space-y-1.5">
                  <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Favoritos
                  </p>
                  <motion.div layout className="space-y-1">
                    {favoriteItems.map((item) => (
                      <SidebarNavItem
                        key={item.href}
                        item={item}
                        active={isNavLinkActive(pathname, item.href)}
                        collapsed={false}
                        favorite
                        onToggleFavorite={toggleFavorite}
                      />
                    ))}
                  </motion.div>
                </section>
              ) : null}

              {groups.map((group) => (
                <SidebarSection
                  key={group.id}
                  group={group}
                  pathname={pathname}
                  collapsed={collapsed}
                  favorites={favorites}
                  search={search}
                  open={openGroups[group.id] ?? true}
                  onToggleOpen={toggleGroup}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </nav>

            <div className={cn("border-t border-[#e6e9ef] pt-3", collapsed && "flex flex-col items-center")}>
              <div className={cn("mb-2 flex items-center", collapsed ? "flex-col gap-2" : "justify-between gap-2")}>
                <CrmNotificationsBell className="hover:bg-white" />
                <Button
                  type="button"
                  variant="ghost"
                  size={collapsed ? "icon" : "sm"}
                  onClick={() => setCollapsed((prev) => !prev)}
                  aria-label={collapsed ? "Expandir menu lateral" : "Colapsar menu lateral"}
                  className="border-[#e1e5eb] bg-white text-slate-500 hover:text-primary-dark"
                >
                  {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                  {!collapsed ? <span className="ml-1.5">Recolher</span> : null}
                </Button>
              </div>
              <SidebarAccountMenu sessionUser={sessionUser} collapsed={collapsed} />
              {!collapsed ? (
                <p className="mt-2 truncate px-2 text-[11px] text-slate-400" title={displayName}>
                  Sessão ativa em ambiente seguro
                </p>
              ) : null}
            </div>
          </div>
        </aside>

        <div
          className={cn(
            "relative z-10 min-h-dvh w-full min-w-0 transition-[padding] duration-200 ease-out",
            collapsed ? "lg:pl-[88px]" : "lg:pl-[282px]",
          )}
        >
          <main className="min-h-dvh min-w-0 px-4 py-5 sm:px-6 lg:py-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
