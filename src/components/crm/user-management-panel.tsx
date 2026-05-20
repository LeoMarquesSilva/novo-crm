"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
  Bell,
  Briefcase,
  Building2,
  CheckCircle2,
  Circle,
  FileText,
  Handshake,
  Landmark,
  Pencil,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APP_USER_AREAS,
  APP_USER_AREA_FORM_ITEMS,
  APP_USER_ROLE_LABELS,
  APP_USER_ROLE_SELECT_ITEMS,
} from "@/lib/crm/app-user-constants";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { CRM_PRACTICE_AREAS, CRM_PROFILE_ONLY_AREAS } from "@/lib/crm/crm-areas";
import { cn } from "@/lib/utils";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppUser {
  id: string;
  full_name: string;
  role: string;
  area: string | null;
  avatar_url: string | null;
  created_at: string;
  email?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AREA_META: Record<
  string,
  {
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  Socio: { color: "bg-purple-100 text-purple-800", icon: Landmark },
  "Cível": { color: "bg-blue-100 text-blue-800", icon: Building2 },
  Trabalhista: { color: "bg-orange-100 text-orange-800", icon: Briefcase },
  "Reestruturação e Insolvência": { color: "bg-red-100 text-red-800", icon: Handshake },
  "Distressed Deals": { color: "bg-rose-100 text-rose-800", icon: Circle },
  "Societário e Contratos": { color: "bg-teal-100 text-teal-800", icon: FileText },
  "Operacoes Legais": { color: "bg-green-100 text-green-800", icon: Briefcase },
  "Tributário": { color: "bg-yellow-100 text-yellow-800", icon: Scale },
  "Recuperação de Créditos": { color: "bg-amber-100 text-amber-900", icon: Landmark },
  Outro: { color: "bg-slate-100 text-slate-700", icon: Circle },
};

const PRACTICE_AREA_SET = new Set<string>(CRM_PRACTICE_AREAS);
const PROFILE_ONLY_AREA_SET = new Set<string>(CRM_PROFILE_ONLY_AREAS);

function isProposalAreaManager(user: AppUser) {
  return user.role === "comercial" && Boolean(user.area && PRACTICE_AREA_SET.has(normalizePracticeAreaKey(user.area)));
}

function userCapability(user: AppUser) {
  if (isProposalAreaManager(user)) {
    return {
      label: "Gestor de proposta",
      description: "Preenche escopo, recebe notificações e aparece como responsável da área.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: CheckCircle2,
    };
  }
  if (user.role === "comercial" && !user.area) {
    return {
      label: "Comercial geral",
      description: "Pode atuar no comercial, mas não será gestor automático de escopo por área.",
      className: "border-sky-200 bg-sky-50 text-sky-800",
      icon: Briefcase,
    };
  }
  if (user.area && PROFILE_ONLY_AREA_SET.has(normalizePracticeAreaKey(user.area))) {
    return {
      label: "Área interna",
      description: "Perfil interno sem fila própria de escopo de proposta.",
      className: "border-slate-200 bg-slate-50 text-slate-700",
      icon: Circle,
    };
  }
  return {
    label: user.role === "admin" ? "Administração" : "Acesso operacional",
    description: "Permissões definidas pela role do usuário.",
    className: "border-slate-200 bg-white text-slate-700",
    icon: ShieldCheck,
  };
}

function UserMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[22px] border border-primary-dark/10 bg-white/75 p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-extrabold tracking-[-0.05em] text-primary-dark">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</p>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ user, size = 12 }: { user: AppUser; size?: number }) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full border-2 border-white bg-[#edf2f7] shadow-md shadow-slate-900/10",
        size === 14 ? "h-14 w-14" : "h-12 w-12",
      )}
    >
      {user.avatar_url ? (
        <Image
          src={user.avatar_url}
          alt={user.full_name}
          fill
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-primary-dark">
          {user.full_name.charAt(0)}
        </div>
      )}
    </div>
  );
}

// ─── User Form Dialog ─────────────────────────────────────────────────────────

interface UserFormState {
  full_name: string;
  email: string;
  password: string;
  role: string;
  area: string;
  avatar_url: string;
}

const DEFAULT_FORM: UserFormState = {
  full_name: "",
  email: "",
  password: "123456",
  role: "comercial",
  area: "",
  avatar_url: "",
};

interface UserFormDialogProps {
  mode: "create" | "edit";
  open: boolean;
  onClose: () => void;
  initialData?: Partial<UserFormState>;
  userId?: string;
  onSuccess: (user: AppUser) => void;
}

function UserFormDialog({
  mode,
  open,
  onClose,
  initialData,
  userId,
  onSuccess,
}: UserFormDialogProps) {
  const [form, setForm] = useState<UserFormState>({
    ...DEFAULT_FORM,
    ...initialData,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUser: AppUser = {
    id: userId ?? "preview",
    full_name: form.full_name || "Novo usuário",
    email: form.email || undefined,
    role: form.role,
    area: form.area || null,
    avatar_url: form.avatar_url || null,
    created_at: new Date().toISOString(),
  };
  const capability = userCapability(previewUser);
  const CapabilityIcon = capability.icon;

  function set(key: keyof UserFormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = mode === "create" ? "/api/admin/users" : `/api/admin/users/${userId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const payload =
        mode === "create"
          ? { ...form, avatar_url: form.avatar_url || undefined }
          : {
              full_name: form.full_name,
              area: form.area || null,
              avatar_url: form.avatar_url || null,
              role: form.role,
            };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Erro desconhecido");
        return;
      }

      onSuccess(json.data);
      onClose();
    } catch {
      setError("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog modal={false} open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-h-[92vh] max-w-[min(720px,calc(100vw-2rem))] overflow-hidden rounded-[28px] border-[#dfe5ee] bg-[#f8fafc] p-0 shadow-[0_36px_100px_rgba(16,31,46,0.22)]"
        onPointerDownOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
      >
        <DialogHeader className="relative overflow-hidden border-b border-[#dfe5ee] bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_58%,#eef5f3_100%)] px-6 py-5">
          <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#d8bf82]/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#102033] text-white shadow-md shadow-slate-900/15">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
          <DialogTitle className="text-xl font-extrabold tracking-[-0.035em] text-[#102033]">
              {mode === "create" ? "Novo usuário" : "Editar usuário"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-500">
            {mode === "create"
              ? "Defina identidade, acesso e atuação operacional no CRM."
              : "Atualize dados, permissões e responsabilidade por área."}
          </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="crm-scrollbar max-h-[calc(92vh-140px)] space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-[22px] border border-[#dfe5ee] bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#24615b]">Identidade</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">Nome completo *</Label>
            <Input
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="Nome Sobrenome"
              className="border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
              required
            />
          </div>

          {mode === "create" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">E-mail *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="nome@bismarchipires.com.br"
                  className="border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">Senha inicial</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Padrão: 123456. O usuário pode alterar depois.
                </p>
              </div>
            </>
          )}
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dfe5ee] bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#24615b]">Acesso e atuação</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">Role</Label>
              <Select
                modal={false}
                items={APP_USER_ROLE_SELECT_ITEMS}
                value={form.role}
                onValueChange={(v) => set("role", v ?? form.role)}
              >
                <SelectTrigger className="h-10 w-full min-w-0 border-[#dfe5ee] bg-[#fbfcfd] text-sm shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  side="bottom"
                  align="start"
                  sideOffset={4}
                >
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="controladoria">Controladoria</SelectItem>
                  <SelectItem value="financeiro">Financeiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">Área</Label>
              <Select
                modal={false}
                items={APP_USER_AREA_FORM_ITEMS}
                value={form.area}
                onValueChange={(v) => set("area", v ?? form.area)}
              >
                <SelectTrigger className="h-10 w-full min-w-0 border-[#dfe5ee] bg-[#fbfcfd] text-sm shadow-sm">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent
                  alignItemWithTrigger={false}
                  side="bottom"
                  align="start"
                  sideOffset={4}
                >
                  {APP_USER_AREAS.map((a) => (
                    <SelectItem key={a} value={a}>
                      <span className="inline-flex items-center gap-2">
                        {PRACTICE_AREA_SET.has(a) ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        {a}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            </div>
            <div className={cn("mt-4 rounded-2xl border p-3", capability.className)}>
              <div className="flex items-center gap-2">
                <CapabilityIcon className="h-4 w-4" />
                <p className="text-sm font-extrabold">{capability.label}</p>
              </div>
              <p className="mt-1 text-xs leading-relaxed opacity-80">{capability.description}</p>
            </div>
          </div>

          <div className="rounded-[22px] border border-[#dfe5ee] bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#24615b]">Avatar</p>
          <div className="mt-4 space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">URL do Avatar</Label>
            <Input
              type="url"
              value={form.avatar_url}
              onChange={(e) => set("avatar_url", e.target.value)}
              placeholder="https://..."
              className="border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
            />
          </div>

          {/* Preview do avatar */}
          {form.avatar_url && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#edf0f4] bg-[#f8fafc] p-2">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-white/60">
                <Image
                  src={form.avatar_url}
                  alt="Preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <span className="text-xs text-muted-foreground">
                Preview do avatar
              </span>
            </div>
          )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          <DialogFooter className="sticky bottom-0 -mx-6 border-t border-[#dfe5ee] bg-white/95 px-6 py-4 backdrop-blur">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="bg-[#102033] text-white shadow hover:bg-[#17324a]"
            >
              {loading
                ? mode === "create"
                  ? "Criando..."
                  : "Salvando..."
                : mode === "create"
                  ? "Criar Usuário"
                  : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Card ─────────────────────────────────────────────────────────────────

interface UserCardProps {
  user: AppUser;
  onEdit: (user: AppUser) => void;
  onDelete: (id: string) => void;
  onRoleChange: (id: string, role: string) => void;
}

function UserCard({ user, onEdit, onDelete, onRoleChange }: UserCardProps) {
  const [isPending, startTransition] = useTransition();
  const [savedRole, setSavedRole] = useState<string | null>(null);

  const areaLabel = user.area ? normalizePracticeAreaKey(user.area) : null;
  const areaMeta = AREA_META[areaLabel ?? ""] ?? AREA_META.Outro;
  const AreaIcon = areaMeta.icon;
  const capability = userCapability(user);
  const CapabilityIcon = capability.icon;
  const roleMeta = APP_USER_ROLE_LABELS[user.role] ?? {
    label: user.role,
    color: "bg-gray-100 text-gray-700",
  };

  async function handleRoleChange(newRole: string | null) {
    if (!newRole) return;
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        onRoleChange(user.id, newRole);
        setSavedRole(newRole);
        setTimeout(() => setSavedRole(null), 2000);
      }
    });
  }

  return (
    <Card className="group/card overflow-hidden border-[#dfe5ee] bg-white p-0 shadow-[0_16px_40px_rgba(16,31,46,0.06)] transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(16,31,46,0.1)]">
      <CardHeader className="relative flex flex-row items-start gap-4 border-b border-[#eef1f5] bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_70%,#eef5f3_100%)] p-5">
        <div className="pointer-events-none absolute -right-12 -top-14 h-28 w-28 rounded-full bg-[#d8bf82]/20 blur-2xl" />
        <UserAvatar user={user} size={14} />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base font-extrabold tracking-[-0.025em] text-[#102033]">{user.full_name}</CardTitle>
          <CardDescription className="mt-1 truncate text-xs font-semibold text-slate-500">
            {user.email ?? "E-mail não carregado"}
          </CardDescription>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${areaMeta.color}`}
            >
              <AreaIcon className="mr-1 h-3 w-3" />
              {areaLabel ?? "—"}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${roleMeta.color}`}
            >
              {roleMeta.label}
            </span>
          </div>
        </div>
        <div className="relative z-[1] flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary-dark"
            onClick={() => onEdit(user)}
            title="Editar usuário"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                title="Excluir usuário"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{user.full_name}</strong> será removido do sistema e
                  não conseguirá mais fazer login. Esta ação não pode ser
                  desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => onDelete(user.id)}
                >
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <div className={cn("rounded-2xl border p-3", capability.className)}>
          <div className="flex items-center gap-2">
            <CapabilityIcon className="h-4 w-4" />
            <p className="text-sm font-extrabold">{capability.label}</p>
          </div>
          <p className="mt-1 text-xs leading-relaxed opacity-80">{capability.description}</p>
        </div>

        {isProposalAreaManager(user) ? (
          <div className="grid gap-2 rounded-2xl border border-[#dfe5ee] bg-[#f8fafc] p-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-[#24615b]" />
              Recebe notificações quando a proposta solicitar escopo de {areaLabel}.
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-[#24615b]" />
              Pode preencher e concluir a área nas propostas em elaboração.
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Select
            items={APP_USER_ROLE_SELECT_ITEMS}
            value={user.role}
            onValueChange={handleRoleChange}
            disabled={isPending}
          >
            <SelectTrigger className="h-9 flex-1 border-[#dfe5ee] bg-[#fbfcfd] text-xs shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="comercial">Comercial</SelectItem>
              <SelectItem value="controladoria">Controladoria</SelectItem>
              <SelectItem value="financeiro">Financeiro</SelectItem>
            </SelectContent>
          </Select>

          {savedRole ? (
            <Badge variant="secondary" className="h-7 text-xs">
              Salvo
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── UserManagementPanel ──────────────────────────────────────────────────────

interface UserManagementPanelProps {
  initialUsers: AppUser[];
}

export function UserManagementPanel({ initialUsers }: UserManagementPanelProps) {
  const [users, setUsers] = useState<AppUser[]>(initialUsers);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [managerFilter, setManagerFilter] = useState("all");

  const roleOptions = Array.from(new Set(users.map((u) => u.role))).sort();
  const areaOptions = Array.from(
    new Set([
      ...Object.keys(AREA_META),
      ...users
        .map((u) => (u.area ? normalizePracticeAreaKey(u.area) : null))
        .filter((area): area is string => !!area),
    ]),
  );

  const filtered = users.filter(
    (u) =>
      (u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (u.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.area ? normalizePracticeAreaKey(u.area) : "").toLowerCase().includes(search.toLowerCase())) &&
      (roleFilter === "all" || u.role === roleFilter) &&
      (areaFilter === "all" || normalizePracticeAreaKey(u.area ?? "Outro") === areaFilter) &&
      (managerFilter === "all" ||
        (managerFilter === "manager" && isProposalAreaManager(u)) ||
        (managerFilter === "general_comercial" && u.role === "comercial" && !isProposalAreaManager(u)) ||
        (managerFilter === "internal_area" &&
          Boolean(u.area && PROFILE_ONLY_AREA_SET.has(normalizePracticeAreaKey(u.area))))),
  );

  function handleCreated(user: AppUser) {
    setUsers((prev) => [...prev, user].sort((a, b) => a.full_name.localeCompare(b.full_name)));
  }

  function handleUpdated(updated: AppUser) {
    setUsers((prev) =>
      prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
    );
  }

  function handleRoleChange(id: string, role: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
    }
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const comercialCount = users.filter((u) => u.role === "comercial").length;
  const proposalManagersCount = users.filter(isProposalAreaManager).length;
  const internalAreaCount = users.filter((u) => u.area && PROFILE_ONLY_AREA_SET.has(u.area)).length;

  const roleFilterItems = useMemo(() => {
    const m: Record<string, string> = { all: "Todas as roles" };
    for (const role of roleOptions) {
      m[role] = APP_USER_ROLE_LABELS[role]?.label ?? role;
    }
    return m;
  }, [roleOptions]);

  const areaFilterItems = useMemo(() => {
    const m: Record<string, string> = { all: "Todas as áreas" };
    for (const area of areaOptions) {
      m[area] = area;
    }
    return m;
  }, [areaOptions]);

  const managerFilterItems = {
    all: "Todas as capacidades",
    manager: "Gestores de proposta",
    general_comercial: "Comercial sem gestão",
    internal_area: "Áreas internas",
  };

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-white/55 bg-white/70 shadow-sm shadow-primary-dark/10">
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative overflow-hidden bg-[#0b1724] px-6 py-6 text-white md:px-8">
            <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
            <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />
            <div className="relative flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/15 shadow-lg shadow-black/20 backdrop-blur">
                  <UsersRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="inline-flex rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                    Administração de acesso
                  </p>
                  <h2 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.03em] text-white md:text-3xl">
                    Usuários, áreas e gestores de proposta
                  </h2>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-slate-100/90">
                Um usuário comercial com área de prática definida é tratado como gestor dessa área: recebe notificações,
                preenche escopos e aparece como responsável nas propostas.
              </p>
            </div>
          </div>
          <div className="grid gap-3 bg-white/55 p-5 sm:grid-cols-2">
            <UserMetricCard label="Usuários" value={users.length} helper={`${filtered.length} visíveis no filtro atual`} />
            <UserMetricCard label="Comercial" value={comercialCount} helper="Equipe que atua nos leads e propostas" />
            <UserMetricCard label="Gestores" value={proposalManagersCount} helper="Comercial + área de prática" />
            <UserMetricCard label="Internas" value={internalAreaCount} helper="Áreas sem fila de escopo própria" />
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dfe5ee] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar nome, e-mail ou área..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-72 border-[#dfe5ee] bg-[#fbfcfd] pl-9 text-sm shadow-sm"
              />
            </div>
          <Select
            items={roleFilterItems}
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v ?? "all")}
          >
            <SelectTrigger className="h-10 w-[170px] border-[#dfe5ee] bg-[#fbfcfd] text-xs shadow-sm">
              <SelectValue placeholder="Filtrar role" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="all">Todas as roles</SelectItem>
              {roleOptions.map((role) => (
                <SelectItem key={role} value={role}>
                  {APP_USER_ROLE_LABELS[role]?.label ?? role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={areaFilterItems}
            value={areaFilter}
            onValueChange={(v) => setAreaFilter(v ?? "all")}
          >
            <SelectTrigger className="h-10 w-[210px] border-[#dfe5ee] bg-[#fbfcfd] text-xs shadow-sm">
              <SelectValue placeholder="Filtrar área" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="all">Todas as áreas</SelectItem>
              {areaOptions.map((area) => {
                const meta = AREA_META[area] ?? AREA_META.Outro;
                const Icon = meta.icon;

                return (
                  <SelectItem key={area} value={area}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {area}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select
            items={managerFilterItems}
            value={managerFilter}
            onValueChange={(v) => setManagerFilter(v ?? "all")}
          >
            <SelectTrigger className="h-10 w-[210px] border-[#dfe5ee] bg-[#fbfcfd] text-xs shadow-sm">
              <SelectValue placeholder="Capacidade" />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              <SelectItem value="all">Todas as capacidades</SelectItem>
              <SelectItem value="manager">Gestores de proposta</SelectItem>
              <SelectItem value="general_comercial">Comercial sem gestão</SelectItem>
              <SelectItem value="internal_area">Áreas internas</SelectItem>
            </SelectContent>
          </Select>
          <span className="hidden text-xs text-muted-foreground xl:block">
            {filtered.length} de {users.length} • {adminCount} admin • {proposalManagersCount} gestores
          </span>
        </div>
        <Button
          size="sm"
          className="h-10 gap-2 rounded-2xl bg-[#102033] px-4 text-white shadow-md shadow-primary-dark/20 hover:bg-[#17324a]"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            onEdit={setEditUser}
            onDelete={handleDelete}
            onRoleChange={handleRoleChange}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            Nenhum usuário encontrado.
          </div>
        )}
      </div>

      {/* Dialog criação */}
      <UserFormDialog
        mode="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={handleCreated}
      />

      {/* Dialog edição */}
      {editUser && (
        <UserFormDialog
          mode="edit"
          open={!!editUser}
          onClose={() => setEditUser(null)}
          userId={editUser.id}
          initialData={{
            full_name: editUser.full_name,
            area: editUser.area ?? "",
            avatar_url: editUser.avatar_url ?? "",
            role: editUser.role,
          }}
          onSuccess={(updated) => {
            handleUpdated(updated);
            setEditUser(null);
          }}
        />
      )}
    </div>
  );
}
