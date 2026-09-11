"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
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
  UserX,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { Select, SelectTrigger } from "@/components/ui/select";
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

/**
 * Uma pessoa nesta tela — não necessariamente um usuário do CRM. `hasAccess`
 * distingue os dois casos; `department`/`position`/`orqestraiActive` vêm do
 * espelho local do quadro de colaboradores (ORQESTRAI/RH) quando há
 * correspondência por e-mail. Um único tipo pros dois: aqui é "Usuários" —
 * o quadro real do escritório, com ou sem login no CRM, não duas telas.
 */
export interface MergedPerson {
  id: string;
  full_name: string;
  role: string;
  area: string | null;
  avatar_url: string | null;
  created_at: string;
  email?: string;
  hasAccess: boolean;
  department?: string | null;
  position?: string | null;
  /** `null` = sem vínculo encontrado no RH (ex.: conta de sistema/teste). */
  orqestraiActive?: boolean | null;
}

type AppUser = MergedPerson;

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
  password: "",
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
    hasAccess: true,
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
        onFocusOutside={(event) => {
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
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Mínimo 12 caracteres"
                  className="border-[#dfe5ee] bg-[#fbfcfd] shadow-sm"
                  minLength={12}
                  maxLength={128}
                  required
                />
                <p className="text-[10px] text-muted-foreground">
                  Use letras maiúsculas e minúsculas, além de pelo menos um
                  número. Não existe mais senha padrão.
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
                  <CrmSelectValue value={form.role} labels={APP_USER_ROLE_SELECT_ITEMS} />
                </SelectTrigger>
                <CrmSelectContent>
                  <CrmSelectItem value="admin">Admin</CrmSelectItem>
                  <CrmSelectItem value="comercial">Comercial</CrmSelectItem>
                  <CrmSelectItem value="controladoria">Controladoria</CrmSelectItem>
                  <CrmSelectItem value="financeiro">Financeiro</CrmSelectItem>
                </CrmSelectContent>
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
                  <CrmSelectValue
                    value={form.area}
                    labels={APP_USER_AREA_FORM_ITEMS}
                    placeholder="Selecione"
                  />
                </SelectTrigger>
                <CrmSelectContent>
                  {APP_USER_AREAS.map((a) => (
                    <CrmSelectItem key={a} value={a}>
                      <span className="inline-flex items-center gap-2">
                        {PRACTICE_AREA_SET.has(a) ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        {a}
                      </span>
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
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

// ─── Compact user row ──────────────────────────────────────────────────────────

interface UserRowProps {
  user: AppUser;
  onEdit: (user: AppUser) => void;
  onDelete: (id: string) => void;
  onRoleChange: (id: string, role: string) => void;
  onGrantAccess: (user: AppUser) => void;
}

function UserRow({ user, onEdit, onDelete, onRoleChange, onGrantAccess }: UserRowProps) {
  const [isPending, startTransition] = useTransition();
  const [savedRole, setSavedRole] = useState<string | null>(null);
  const areaLabel = user.area ? normalizePracticeAreaKey(user.area) : null;
  const areaMeta = AREA_META[areaLabel ?? ""] ?? AREA_META.Outro;
  const AreaIcon = areaMeta.icon;
  const capability = userCapability(user);
  const CapabilityIcon = capability.icon;

  async function handleRoleChange(newRole: string | null) {
    if (!newRole || !user.hasAccess) return;
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
    <div
      className={cn(
        "group grid gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/80",
        "xl:grid-cols-[minmax(250px,1.45fr)_minmax(150px,0.75fr)_minmax(170px,0.9fr)_minmax(165px,0.85fr)_112px] xl:items-center xl:gap-4",
        !user.hasAccess && "bg-slate-50/50",
        user.orqestraiActive === false && "bg-rose-50/40 hover:bg-rose-50/60",
      )}
    >
      <div className="min-w-0">
        <CrmUserLabel
          name={user.full_name}
          avatarUrl={user.avatar_url}
          size="md"
          variant="stacked"
          sublabel={user.email ?? "E-mail não cadastrado"}
          className="w-full"
          nameClassName="text-[13px]"
        />
        {(user.department || user.position) ? (
          <p className="mt-1 truncate pl-[42px] text-[11px] text-slate-500">
            {[user.position, user.department].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 xl:block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 xl:hidden">
          Acesso
        </span>
        {user.hasAccess ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <Select
              items={APP_USER_ROLE_SELECT_ITEMS}
              value={user.role}
              onValueChange={handleRoleChange}
              disabled={isPending}
            >
              <SelectTrigger
                aria-label={`Perfil de acesso de ${user.full_name}`}
                className="h-8 w-[148px] min-w-0 border-slate-200 bg-white text-xs shadow-none xl:w-full"
              >
                <CrmSelectValue value={user.role} labels={APP_USER_ROLE_SELECT_ITEMS} />
              </SelectTrigger>
              <CrmSelectContent>
                <CrmSelectItem value="admin">Admin</CrmSelectItem>
                <CrmSelectItem value="comercial">Comercial</CrmSelectItem>
                <CrmSelectItem value="controladoria">Controladoria</CrmSelectItem>
                <CrmSelectItem value="financeiro">Financeiro</CrmSelectItem>
              </CrmSelectContent>
            </Select>
            {savedRole ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Salvo" />
            ) : null}
          </div>
        ) : (
          <Badge
            variant="outline"
            className="h-6 border-dashed border-slate-300 bg-white text-[10px] font-semibold text-slate-600"
          >
            <UserX className="mr-1 h-3 w-3" />
            Sem acesso
          </Badge>
        )}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 xl:block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 xl:hidden">
          Área
        </span>
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            user.hasAccess ? areaMeta.color : "bg-slate-100 text-slate-600",
          )}
          title={areaLabel ?? user.department ?? "Sem área vinculada"}
        >
          <AreaIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{areaLabel ?? user.department ?? "Sem área"}</span>
        </span>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 xl:block">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 xl:hidden">
          Situação
        </span>
        {user.orqestraiActive === false ? (
          <Badge
            variant="outline"
            className="h-6 border-rose-200 bg-rose-50 text-[10px] font-semibold text-rose-700"
            title="Inativo no RH, mas ainda com login no CRM"
          >
            <AlertTriangle className="mr-1 h-3 w-3" />
            Revisar acesso
          </Badge>
        ) : user.hasAccess ? (
          <span
            className={cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
              capability.className,
            )}
            title={capability.description}
          >
            <CapabilityIcon className="h-3 w-3 shrink-0" />
            <span className="truncate">{capability.label}</span>
          </span>
        ) : (
          <span className="text-right text-[11px] text-slate-500 xl:text-left">
            Disponível no quadro do RH
          </span>
        )}
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-slate-100 pt-2 xl:border-0 xl:pt-0">
        {!user.hasAccess ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 border-primary-dark/20 px-2.5 text-[11px] text-primary-dark"
            onClick={() => onGrantAccess(user)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Conceder acesso
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-primary-dark"
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
                  className="h-8 w-8 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  title="Excluir usuário"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{user.full_name}</strong> será removido do sistema e não conseguirá
                    mais fazer login. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => onDelete(user.id)}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
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
  const [accessFilter, setAccessFilter] = useState("all");
  const [grantAccessFor, setGrantAccessFor] = useState<AppUser | null>(null);

  const roleOptions = Array.from(new Set(users.filter((u) => u.hasAccess).map((u) => u.role))).sort();
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
        (u.area ? normalizePracticeAreaKey(u.area) : "").toLowerCase().includes(search.toLowerCase()) ||
        (u.department ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (u.position ?? "").toLowerCase().includes(search.toLowerCase())) &&
      (roleFilter === "all" || u.role === roleFilter) &&
      (areaFilter === "all" || normalizePracticeAreaKey(u.area ?? "Outro") === areaFilter) &&
      (managerFilter === "all" ||
        (managerFilter === "manager" && isProposalAreaManager(u)) ||
        (managerFilter === "general_comercial" && u.role === "comercial" && !isProposalAreaManager(u)) ||
        (managerFilter === "internal_area" &&
          Boolean(u.area && PROFILE_ONLY_AREA_SET.has(normalizePracticeAreaKey(u.area))))) &&
      (accessFilter === "all" ||
        (accessFilter === "no_access" && !u.hasAccess) ||
        (accessFilter === "former_with_access" && u.hasAccess && u.orqestraiActive === false)),
  );

  /** Vira o "usuário real" recém-criado no lugar do card "sem acesso" da mesma pessoa. */
  function handleCreated(user: AppUser) {
    setUsers((prev) => {
      const emailNorm = (user.email ?? "").trim().toLowerCase();
      const withoutPlaceholder = prev.filter(
        (u) => u.hasAccess || (u.email ?? "").trim().toLowerCase() !== emailNorm,
      );
      const placeholder = prev.find(
        (u) => !u.hasAccess && (u.email ?? "").trim().toLowerCase() === emailNorm,
      );
      const merged: AppUser = placeholder
        ? { ...user, department: placeholder.department, position: placeholder.position, orqestraiActive: placeholder.orqestraiActive }
        : user;
      return [...withoutPlaceholder, merged].sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
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

  const comercialCount = users.filter((u) => u.role === "comercial").length;
  const proposalManagersCount = users.filter(isProposalAreaManager).length;
  const internalAreaCount = users.filter(
    (u) => u.area && PROFILE_ONLY_AREA_SET.has(normalizePracticeAreaKey(u.area)),
  ).length;
  const noAccessCount = users.filter((u) => !u.hasAccess).length;
  const formerWithAccessCount = users.filter((u) => u.hasAccess && u.orqestraiActive === false).length;
  const hasActiveFilters =
    Boolean(search.trim()) ||
    roleFilter !== "all" ||
    areaFilter !== "all" ||
    managerFilter !== "all" ||
    accessFilter !== "all";

  const roleFilterItems = useMemo(() => {
    const m: Record<string, string> = { all: "Todos os perfis" };
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

  const accessFilterItems = {
    all: "Todos",
    no_access: "Sem acesso ao CRM",
    former_with_access: "Ex-colaborador com acesso",
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-dark text-white shadow-sm">
              <UsersRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#24615b]">
                Administração de acesso
              </p>
              <h1 className="mt-0.5 text-xl font-bold tracking-[-0.025em] text-primary-dark">
                Usuários do sistema
              </h1>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
                Gerencie acessos, funções e responsáveis por área sem sair da lista.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-9 shrink-0 gap-2 rounded-xl bg-primary-dark px-4 text-white shadow-sm hover:bg-[#17324a]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Novo usuário
          </Button>
        </div>

        <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/55 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Pessoas", value: users.length },
            { label: "Comercial", value: comercialCount },
            { label: "Gestores", value: proposalManagersCount },
            { label: "Áreas internas", value: internalAreaCount },
            { label: "Sem acesso", value: noAccessCount },
            { label: "Revisar acesso", value: formerWithAccessCount, alert: formerWithAccessCount > 0 },
          ].map((metric) => (
            <div
              key={metric.label}
              className="flex items-baseline justify-between gap-3 border-b border-r border-slate-100 px-4 py-3 last:border-r-0 sm:block xl:border-b-0"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.11em] text-slate-400">
                {metric.label}
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-bold tabular-nums text-primary-dark",
                  metric.alert && "text-rose-700",
                )}
              >
                {metric.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200/80 bg-white p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.35fr)_minmax(150px,0.72fr)_minmax(185px,0.9fr)_minmax(185px,0.9fr)_minmax(170px,0.8fr)_auto]">
            <div className="relative sm:col-span-2 xl:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar nome, e-mail, cargo ou área..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full border-slate-200 bg-slate-50/60 pl-9 text-sm shadow-none"
              />
            </div>
          <Select
            items={roleFilterItems}
            value={roleFilter}
            onValueChange={(v) => setRoleFilter(v ?? "all")}
          >
            <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50/60 text-xs shadow-none">
              <CrmSelectValue
                value={roleFilter}
                labels={roleFilterItems}
                placeholder="Filtrar perfil"
              />
            </SelectTrigger>
            <CrmSelectContent className="min-w-[200px]">
              <CrmSelectItem value="all">Todos os perfis</CrmSelectItem>
              {roleOptions.map((role) => (
                <CrmSelectItem key={role} value={role}>
                  {APP_USER_ROLE_LABELS[role]?.label ?? role}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
          <Select
            items={areaFilterItems}
            value={areaFilter}
            onValueChange={(v) => setAreaFilter(v ?? "all")}
          >
            <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50/60 text-xs shadow-none">
              <CrmSelectValue
                value={areaFilter}
                labels={areaFilterItems}
                placeholder="Filtrar área"
              />
            </SelectTrigger>
            <CrmSelectContent className="min-w-[220px]">
              <CrmSelectItem value="all">Todas as áreas</CrmSelectItem>
              {areaOptions.map((area) => {
                const meta = AREA_META[area] ?? AREA_META.Outro;
                const Icon = meta.icon;

                return (
                  <CrmSelectItem key={area} value={area}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5" />
                      {area}
                    </span>
                  </CrmSelectItem>
                );
              })}
            </CrmSelectContent>
          </Select>
          <Select
            items={managerFilterItems}
            value={managerFilter}
            onValueChange={(v) => setManagerFilter(v ?? "all")}
          >
            <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50/60 text-xs shadow-none">
              <CrmSelectValue
                value={managerFilter}
                labels={managerFilterItems}
                placeholder="Capacidade"
              />
            </SelectTrigger>
            <CrmSelectContent className="min-w-[240px]">
              <CrmSelectItem value="all">Todas as capacidades</CrmSelectItem>
              <CrmSelectItem value="manager">Gestores de proposta</CrmSelectItem>
              <CrmSelectItem value="general_comercial">Comercial sem gestão</CrmSelectItem>
              <CrmSelectItem value="internal_area">Áreas internas</CrmSelectItem>
            </CrmSelectContent>
          </Select>
          <Select
            items={accessFilterItems}
            value={accessFilter}
            onValueChange={(v) => setAccessFilter(v ?? "all")}
          >
            <SelectTrigger className="h-9 w-full border-slate-200 bg-slate-50/60 text-xs shadow-none">
              <CrmSelectValue
                value={accessFilter}
                labels={accessFilterItems}
                placeholder="Acesso"
              />
            </SelectTrigger>
            <CrmSelectContent className="min-w-[220px]">
              <CrmSelectItem value="all">Todos</CrmSelectItem>
              <CrmSelectItem value="no_access">Sem acesso ao CRM</CrmSelectItem>
              <CrmSelectItem value="former_with_access">Ex-colaborador com acesso</CrmSelectItem>
            </CrmSelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs text-slate-500"
            disabled={!hasActiveFilters}
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setAreaFilter("all");
              setManagerFilter("all");
              setAccessFilter("all");
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[20px] border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-primary-dark">
            {filtered.length} {filtered.length === 1 ? "pessoa" : "pessoas"}
          </p>
          <p className="text-[11px] text-slate-500">
            {hasActiveFilters ? `de ${users.length} no total` : "Acesso e função editáveis na lista"}
          </p>
        </div>
        <div className="hidden grid-cols-[minmax(250px,1.45fr)_minmax(150px,0.75fr)_minmax(170px,0.9fr)_minmax(165px,0.85fr)_112px] gap-4 border-b border-slate-100 bg-slate-50/70 px-4 py-2 xl:grid">
          {["Pessoa", "Perfil de acesso", "Área", "Situação", "Ações"].map((label, index) => (
            <span
              key={label}
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400",
                index === 4 && "text-right",
              )}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="divide-y divide-slate-100">
          {filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onEdit={setEditUser}
              onDelete={handleDelete}
              onRoleChange={handleRoleChange}
              onGrantAccess={setGrantAccessFor}
            />
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-semibold text-primary-dark">Nenhuma pessoa encontrada</p>
            <p className="mt-1 text-xs text-slate-500">Altere a busca ou limpe os filtros aplicados.</p>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4 h-8 text-xs"
                onClick={() => {
                  setSearch("");
                  setRoleFilter("all");
                  setAreaFilter("all");
                  setManagerFilter("all");
                  setAccessFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        )}
      </section>

      {/* Dialog criação — também usado para "Conceder acesso" a colaborador sem login */}
      <UserFormDialog
        key={grantAccessFor?.id ?? "create"}
        mode="create"
        open={createOpen || !!grantAccessFor}
        onClose={() => {
          setCreateOpen(false);
          setGrantAccessFor(null);
        }}
        initialData={
          grantAccessFor
            ? { full_name: grantAccessFor.full_name, email: grantAccessFor.email ?? "" }
            : undefined
        }
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
