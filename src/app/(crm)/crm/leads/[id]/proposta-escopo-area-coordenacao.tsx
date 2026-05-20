"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { appUserAreaMatchesScopeKey } from "@/lib/crm/area-keys-alignment";
import { initialsFromFullName, type ResolvedAppUser } from "@/lib/crm/resolve-app-user-display";
import { PROPOSAL_SCOPE_OPTIONS } from "@/lib/crm/proposta-scope-options";
import { cn } from "@/lib/utils";

export type EscopoSolicitacaoResumo = {
  areaKey: string;
  concluidoEm: string | null;
  notificadoEm: string | null;
  responsaveis?: Array<ResolvedAppUser & { id: string }>;
};

type Viewer = {
  area: string | null;
};

function labelForAreaKey(key: string): string {
  const exact = PROPOSAL_SCOPE_OPTIONS.find((o) => o === key);
  if (exact) return exact;
  return key;
}

type Props = {
  leadId: string;
  solicitacoes: EscopoSolicitacaoResumo[];
  viewer: Viewer | null;
  className?: string;
};

export function PropostaEscopoAreaCoordenacao({ leadId, solicitacoes, viewer, className }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetsByArea, setTargetsByArea] = useState<Record<string, string[]>>({});

  const myArea = viewer?.area?.trim() ?? "";
  const myRow = myArea
    ? solicitacoes.find((s) => appUserAreaMatchesScopeKey(myArea, s.areaKey))
    : undefined;
  const myComplete = Boolean(myRow?.concluidoEm);
  const othersPending = solicitacoes.some(
    (s) => !appUserAreaMatchesScopeKey(myArea, s.areaKey) && !s.concluidoEm,
  );
  const canNotify = Boolean(myArea && myComplete && othersPending);
  const selectedTargetCount = Object.values(targetsByArea).reduce((sum, ids) => sum + ids.length, 0);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const s of solicitacoes) {
      if (!myArea || appUserAreaMatchesScopeKey(myArea, s.areaKey) || s.concluidoEm) continue;
      next[s.areaKey] = (s.responsaveis ?? []).map((user) => user.id);
    }
    setTargetsByArea(next);
  }, [myArea, solicitacoes]);

  function toggleTarget(areaKey: string, userId: string) {
    setTargetsByArea((prev) => {
      const current = prev[areaKey] ?? [];
      return {
        ...prev,
        [areaKey]: current.includes(userId)
          ? current.filter((id) => id !== userId)
          : [...current, userId],
      };
    });
  }

  async function onNotify() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(leadId)}/proposta-notificar-outras-areas`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetsByArea }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Não foi possível enviar os lembretes.");
        return;
      }
      setMessage("Lembretes reenviados para as áreas pendentes.");
      router.refresh();
    } catch {
      setError("Erro de rede ao notificar.");
    } finally {
      setLoading(false);
    }
  }

  if (solicitacoes.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-white/50 bg-white/25 p-4 text-sm text-muted-foreground",
          className,
        )}
      >
        Ainda não há registro de pedidos por área nesta oportunidade. Salve o campo &quot;Áreas de escopo&quot; (ou
        aguarde a sincronização ao entrar nesta etapa) para aparecerem as áreas e o status por gestor.
      </div>
    );
  }

  const showNotifyHint =
    Boolean(myArea) && othersPending && !myComplete;

  return (
    <div
      className={cn(
        "rounded-xl border border-white/45 bg-white/30 p-4 shadow-sm shadow-primary-dark/5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Estado por área
          </p>
          <ul className="flex flex-wrap gap-2">
            {solicitacoes.map((s) => {
              const done = Boolean(s.concluidoEm);
              const isMine = Boolean(myArea && appUserAreaMatchesScopeKey(myArea, s.areaKey));
              return (
                <li key={s.areaKey}>
                  <Badge
                    variant={done ? "secondary" : "outline"}
                    className={cn(
                      "max-w-full gap-1.5 py-1 pl-2 pr-2.5 font-normal",
                      isMine && "ring-1 ring-accent-teal/40",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-accent-teal" aria-hidden />
                    ) : (
                      <CircleDashed className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="truncate">{labelForAreaKey(s.areaKey)}</span>
                    {isMine ? (
                      <span className="text-[10px] font-medium text-muted-foreground">(sua área)</span>
                    ) : null}
                  </Badge>
                </li>
              );
            })}
          </ul>
          {myArea ? (
            <p className="text-xs text-muted-foreground">
              {myComplete
                ? "O escopo desta área está completo."
                : "Complete tipo, subtipo e campos obrigatórios do escopo na sua área."}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Seu usuário não tem área definida no perfil; o status acima é informativo para a equipe.
            </p>
          )}
          {canNotify ? (
            <div className="mt-3 space-y-3 rounded-2xl border border-[#dfe5ee] bg-white/75 p-3">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#24615b]">
                Selecionar destinatários
              </p>
              {solicitacoes
                .filter((s) => !appUserAreaMatchesScopeKey(myArea, s.areaKey) && !s.concluidoEm)
                .map((s) => (
                  <div key={s.areaKey} className="rounded-xl border border-[#edf0f4] bg-[#fbfcfd] p-3">
                    <p className="text-xs font-extrabold text-[#102033]">{labelForAreaKey(s.areaKey)}</p>
                    {(s.responsaveis ?? []).length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(s.responsaveis ?? []).map((user) => {
                          const checked = (targetsByArea[s.areaKey] ?? []).includes(user.id);
                          return (
                            <label
                              key={user.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-bold transition-colors",
                                checked
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                  : "border-slate-200 bg-white text-slate-600",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => toggleTarget(s.areaKey, user.id)}
                              />
                              <Avatar className="h-6 w-6 border border-white shadow-sm">
                                {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                                <AvatarFallback className="bg-[#102033] text-[9px] font-black text-white">
                                  {initialsFromFullName(user.fullName)}
                                </AvatarFallback>
                              </Avatar>
                              {user.fullName}
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-semibold text-rose-900">
                        Nenhum comercial cadastrado nesta área.
                      </p>
                    )}
                  </div>
                ))}
            </div>
          ) : null}
        </div>

        {canNotify ? (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Button
              type="button"
              variant="teal"
              size="sm"
              className="gap-2"
              disabled={loading || selectedTargetCount === 0}
              onClick={() => void onNotify()}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Bell className="size-4" aria-hidden />
              )}
              Notificar selecionados
            </Button>
            <p className="max-w-[220px] text-right text-[11px] leading-snug text-muted-foreground">
              Reenvia e-mail, WhatsApp (grupo) e aviso no CRM aos gestores selecionados.
            </p>
          </div>
        ) : showNotifyHint ? (
          <div className="max-w-sm rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[11px] leading-snug text-amber-950">
            <p className="font-medium text-amber-950">Para desbloquear &quot;Notificar outras áreas&quot;</p>
            <p className="mt-1 text-amber-950/95">
              Preencha tipo, subtipo e todos os campos obrigatórios da <strong>sua</strong> área e clique em{" "}
              <strong>Salvar esta área</strong> nessa área. O ícone verde na sua área só aparece depois do servidor marcar
              o escopo como concluído (atualize a página se ela não atualizar sozinha).
            </p>
          </div>
        ) : null}
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mt-2 text-sm text-accent-teal">{message}</p> : null}
    </div>
  );
}
