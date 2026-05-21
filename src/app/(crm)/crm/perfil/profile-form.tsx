"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import {
  APP_USER_AREAS,
  APP_USER_AREA_FORM_ITEMS,
  APP_USER_ROLE_LABELS,
} from "@/lib/crm/app-user-constants";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type ProfileFormInitial = {
  full_name: string;
  area: string;
  avatar_url: string;
};

function parseAvatarUrl(raw: string): { ok: true; value: string | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  try {
    new URL(t);
    return { ok: true, value: t };
  } catch {
    return { ok: false };
  }
}

type ProfileFormProps = {
  initial: ProfileFormInitial;
  hasProfileRow: boolean;
  role: string | null;
};

export function ProfileForm({ initial, hasProfileRow, role }: ProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.full_name);
  const [area, setArea] = useState(initial.area?.trim() ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const areaCrmSelectItems = useMemo(() => {
    const items: Record<string, string> = {
      "": "Sem área definida",
      ...APP_USER_AREA_FORM_ITEMS,
    };
    const init = initial.area?.trim();
    if (init && items[init] === undefined) {
      items[init] = init;
    }
    return items;
  }, [initial.area]);

  const orderedAreaKeys = useMemo(() => {
    const keys: string[] = ["", ...(APP_USER_AREAS as readonly string[]).slice()];
    const init = initial.area?.trim();
    if (init && !keys.includes(init)) {
      keys.push(init);
    }
    return keys;
  }, [initial.area]);

  const roleMeta =
    role && APP_USER_ROLE_LABELS[role]
      ? APP_USER_ROLE_LABELS[role]
      : { label: role ?? "—", color: "bg-slate-100 text-slate-700" };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const name = fullName.trim();
    if (!name) {
      setError("O nome completo é obrigatório.");
      return;
    }

    const parsed = parseAvatarUrl(avatarUrl);
    if (!parsed.ok) {
      setError("URL da foto inválida. Use um endereço https completo ou deixe em branco.");
      return;
    }
    const normalized = parsed.value;

    if (!hasProfileRow) {
      setError("Não existe registro de usuário na aplicação. Entre em contato com um administrador.");
      return;
    }

    const areaValue = area.trim();
    if (areaValue && !areaCrmSelectItems[areaValue]) {
      setError("Selecione uma área válida na lista.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseClient();
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        setError("Sessão expirada. Volte a entrar.");
        return;
      }

      const { error: upErr } = await supabase
        .from("app_users")
        .update({
          full_name: name,
          area: areaValue ? areaValue : null,
          avatar_url: normalized,
        })
        .eq("auth_user_id", user.id);

      if (upErr) {
        setError(upErr.message);
        return;
      }

      setSuccess("Perfil atualizado.");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-primary-dark/15 bg-white text-primary-dark shadow-inner shadow-primary-dark/[0.06] placeholder:text-primary-light/70 focus-visible:border-ring focus-visible:ring-[color:var(--ring)]";

  const selectTriggerClass = cn(
    fieldClass,
    "flex w-full min-w-0 justify-between gap-2 py-0 pr-3 pl-3 text-left data-placeholder:text-primary-light/70 dark:bg-white/95",
  );

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-6">
      {!hasProfileRow ? (
        <p className="rounded-xl border border-amber-600/35 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-50">
          Seu usuário ainda não está associado a um registro interno. Peça a um administrador para o
          criar em Utilizadores.
        </p>
      ) : null}

      {hasProfileRow ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary-dark/10 bg-white/90 px-4 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 dark:border-white/15 dark:bg-primary-dark/40">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-medium">
              Papel no sistema
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-primary-medium">
              <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              Definido pelo administrador — não pode ser alterado nesta página.
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "h-7 shrink-0 rounded-full border border-black/10 px-3 text-xs font-semibold",
              roleMeta.color,
            )}
          >
            {roleMeta.label}
          </Badge>
        </div>
      ) : null}

      <div className="rounded-2xl border border-primary-dark/10 bg-white/95 p-5 shadow-sm sm:p-6 dark:border-white/15 dark:bg-primary-dark/50">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="full_name" className="text-primary-dark">
              Nome completo
            </Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
              className={fieldClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-area" className="text-primary-dark">
              Área / departamento
            </Label>
            <Select
              modal={false}
              items={areaCrmSelectItems}
              value={area}
              onValueChange={(v) => setArea(v ?? "")}
            >
              <SelectTrigger id="profile-area" size="default" className={selectTriggerClass}>
                <SelectValue placeholder="Selecione a área" />
              </SelectTrigger>
              <CrmSelectContent className="max-h-[min(320px,70vh)]">
                {orderedAreaKeys.map((a) => (
                  <CrmSelectItem key={a} value={a}>
                    {areaCrmSelectItems[a] ?? a}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
            <p className="text-xs leading-relaxed text-primary-medium">
              Mesmas opções que em{" "}
              <span className="font-medium text-primary-dark">Administração → Utilizadores</span>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar_url" className="text-primary-dark">
              URL da foto
            </Label>
            <Input
              id="avatar_url"
              type="url"
              inputMode="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
              className={fieldClass}
            />
            <p className="text-xs leading-relaxed text-primary-medium">
              Cole um link público para a imagem (por exemplo da intranet ou Gravatar).
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive dark:bg-destructive/20"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-xl border border-emerald-600/35 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-50"
          role="status"
        >
          {success}
        </p>
      ) : null}

      <Button type="submit" disabled={loading || !hasProfileRow} size="lg" className="rounded-xl">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando…
          </>
        ) : (
          "Salvar alterações"
        )}
      </Button>
    </form>
  );
}
