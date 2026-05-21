"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Pencil, Save, Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { cn } from "@/lib/utils";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import {
  PROPOSTA_TIPOS_CATALOG,
  type PropostaAreaKey,
  type PropostaEscopoDetalhe,
  type PropostaEscopoDetalheEntry,
  type PropostaTiposCatalog,
} from "@/data/proposta-tipos-catalog";
import { findInvestmentSubtype, findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";
import { appUserAreaMatchesScopeKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { getEscopoEntryForArea } from "@/lib/crm/proposta-escopo-entry";
import { initialsFromFullName, type ResolvedAppUser } from "@/lib/crm/resolve-app-user-display";
import {
  canEditEscopoArea,
  canRequestGestorFillForArea,
} from "@/lib/crm/proposta-escopo-permissions";
import { getPropostaPlaceholderLabel } from "@/lib/crm/proposta-placeholder-labels";
import {
  escopoJsonEqual,
  parseAreasList,
  parseEscopoJson,
  syncEscopoToAreas,
} from "@/lib/crm/proposta-escopo-json";
import { Input } from "@/components/ui/input";
import { createSupabaseClient } from "@/lib/supabase/client";
import {
  ESCOPO_PLACEHOLDER_NOME_EMPRESA,
  ESCOPO_PLACEHOLDER_UPPERCASE,
  PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY,
  isNumeroProcessoPlaceholderKey,
  maskNumeroProcessoCNJ,
  mergeEscopoTemplate,
  mergeInvestimentoTemplate,
} from "@/lib/crm/proposta-escopo-preview";

/** Valor interno do Select (nunca confunde com `tipoId`/`subtipoId` reais); mantém o controle sempre definido. */
const SELECT_EMPTY = "__crm_escopo_none__";
const EMPTY_PLACEHOLDER_KEYS: string[] = [];
const EMPTY_RESPONSAVEIS: Array<ResolvedAppUser & { id: string }> = [];

function isEntryCompleteWithCatalog(
  areaKeyFromRow: string,
  entry: PropostaEscopoDetalheEntry | undefined,
  scopeCatalog: PropostaTiposCatalog,
  investmentCatalog: InvestimentoTipoDef[],
): boolean {
  if (!entry?.tipoId?.trim() || !entry?.subtipoId?.trim()) return false;
  const catalogArea = normalizePracticeAreaKey(areaKeyFromRow);
  const sub = findScopeSubtype(scopeCatalog, catalogArea, entry.tipoId, entry.subtipoId);
  if (!sub) return false;

  for (const key of sub.placeholderKeys ?? []) {
    const value = entry.placeholders?.[key]?.trim() ?? "";
    if (!value) return false;
  }

  const inv = entry.investimento;
  if (!inv?.tipoId?.trim() || !inv?.subtipoId?.trim()) return false;
  const invSub = findInvestmentSubtype(investmentCatalog, inv.tipoId, inv.subtipoId);
  if (!invSub) return false;

  for (const key of invSub.placeholderKeys) {
    const value = inv.placeholders?.[key]?.trim() ?? "";
    if (!value) return false;
  }

  return true;
}

type Props = {
  leadId: string;
  fieldDefinitionId: string;
  initialValue: string;
  areasDisplay: string;
  /** Razão social da empresa principal na proposta (cadastro + `cp_proposta_empresas_json`). */
  defaultNomeEmpresa: string | null;
  /** `app_users.area` — para mostrar vista "concluído" só na área do usuário. */
  viewerProfileArea?: string | null;
  /** `app_users.role` — regras de edição alinhadas ao PATCH (admin/comercial). */
  viewerRole?: string | null;
  solicitacoes?: EscopoAreaSolicitacao[];
  className?: string;
  /**
   * Disparado a cada salvamento bem-sucedido com o JSON do escopo atualizado.
   * Usado pelo builder de proposta para atualizar o live preview sem buscar do DB.
   */
  onSaved?: (escopoJson: string) => void;
};

type EscopoAreaSolicitacao = {
  areaKey: string;
  concluidoEm: string | null;
  notificadoEm: string | null;
  prazoAte: string | null;
  gestor?: ResolvedAppUser;
  preenchidoPor?: ResolvedAppUser;
  responsaveis: Array<ResolvedAppUser & { id: string }>;
};

export function PropostaEscopoPorArea({
  leadId,
  fieldDefinitionId,
  initialValue,
  areasDisplay,
  defaultNomeEmpresa,
  viewerProfileArea = null,
  viewerRole = null,
  solicitacoes = [],
  className,
  onSaved,
}: Props) {
  const router = useRouter();
  const [escopo, setEscopo] = useState<PropostaEscopoDetalhe>(() => parseEscopoJson(initialValue));
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  /** `true` = mostrar formulário completo; com concluído + false = cartão verde. */
  const [editingMyArea, setEditingMyArea] = useState<Record<string, boolean>>({});
  /** Painel de cada área expandido ou recolhido (por chave bruta da lista). */
  const [areaPanelOpen, setAreaPanelOpen] = useState<Record<string, boolean>>({});
  /** Área em que o PATCH está em andamento (spinner no botão "Salvar esta área"). */
  const [savingAreaKey, setSavingAreaKey] = useState<string | null>(null);
  const [notifyingAreaKey, setNotifyingAreaKey] = useState<string | null>(null);
  const [scopeCatalog, setScopeCatalog] = useState<PropostaTiposCatalog>(PROPOSTA_TIPOS_CATALOG);
  const [investmentCatalog, setInvestmentCatalog] = useState<InvestimentoTipoDef[]>(
    PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  );
  const lastPersisted = useRef<string>(initialValue.trim());
  const lastSavedSnapshot = useRef<PropostaEscopoDetalhe>(parseEscopoJson(initialValue));

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/proposal-catalog")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; data?: { scope?: PropostaTiposCatalog; investment?: InvestimentoTipoDef[] } } | null) => {
        if (cancelled || !json?.ok || !json.data) return;
        if (json.data.scope) setScopeCatalog(json.data.scope);
        if (json.data.investment) setInvestmentCatalog(json.data.investment);
      })
      .catch(() => {
        // Fallback estático já está carregado.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const parsed = syncEscopoToAreas(parseEscopoJson(initialValue), parseAreasList(areasDisplay));
    const normalized = JSON.stringify(parsed);
    setEscopo(parsed);
    lastPersisted.current = normalized;
    lastSavedSnapshot.current = parsed;
  }, [areasDisplay, initialValue]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    const channel = supabase
      .channel(`lead-proposal-scope-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "field_values",
          filter: `entity_record_id=eq.${leadId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "proposta_escopo_solicitacao",
          filter: `oportunidade_id=eq.${leadId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [leadId, router]);

  const collapseCompleteEditableAreas = useCallback(
    (nextEscopo: PropostaEscopoDetalhe) => {
      setEditingMyArea((prev) => {
        const out = { ...prev };
        for (const a of parseAreasList(areasDisplay)) {
          if (!canEditEscopoArea(viewerRole, viewerProfileArea, a)) continue;
          const ent = getEscopoEntryForArea(nextEscopo, a);
          if (isEntryCompleteWithCatalog(a, ent, scopeCatalog, investmentCatalog)) out[a] = false;
        }
        return out;
      });
    },
    [viewerRole, viewerProfileArea, areasDisplay, scopeCatalog, investmentCatalog],
  );

  const persist = useCallback(
    async (next: PropostaEscopoDetalhe, options?: { restrictToArea?: string }) => {
      const normalizedNext = syncEscopoToAreas(next, parseAreasList(areasDisplay));
      const body = JSON.stringify(normalizedNext);
      const payloadEscopo =
        options?.restrictToArea
          ? {
              [normalizePracticeAreaKey(options.restrictToArea)]:
                getEscopoEntryForArea(normalizedNext, options.restrictToArea) ?? {
                  tipoId: "",
                  subtipoId: "",
                  placeholders: {},
                },
            }
          : normalizedNext;
      const payloadBody = JSON.stringify(payloadEscopo);
      if (!options?.restrictToArea && body === lastPersisted.current) return;
      setError(null);
      try {
        const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pipelineField: { fieldDefinitionId, value: payloadBody },
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? "Não foi possível salvar o escopo.");
        }
        lastPersisted.current = body;
        lastSavedSnapshot.current = normalizedNext;
        setEscopo(normalizedNext);
        collapseCompleteEditableAreas(normalizedNext);
        setLastSavedAt(
          new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        );
        // Notifica o parent (builder de proposta) com o JSON salvo, para atualizar live preview.
        onSaved?.(body);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    },
    [areasDisplay, collapseCompleteEditableAreas, fieldDefinitionId, leadId, router, onSaved],
  );

  useEffect(() => {
    const list = parseAreasList(areasDisplay);
    setEscopo((prev) => {
      const next = syncEscopoToAreas(prev, list);
      if (escopoJsonEqual(next, prev)) return prev;
      return next;
    });
  }, [areasDisplay]);

  const isAreaDirty = useCallback((areaKey: string): boolean => {
    const a = getEscopoEntryForArea(escopo, areaKey);
    const b = getEscopoEntryForArea(lastSavedSnapshot.current, areaKey);
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  }, [escopo]);

  const notifyOtherAreas = useCallback(async () => {
    const res = await fetch(
      `/api/crm/leads/${encodeURIComponent(leadId)}/proposta-notificar-outras-areas`,
      { method: "POST" },
    );
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      throw new Error(data.error ?? "Não foi possível notificar outras áreas.");
    }
  }, [leadId]);

  const saveArea = useCallback(
    async (areaKey: string, options?: { notifyAfter?: boolean }) => {
      if (!canEditEscopoArea(viewerRole, viewerProfileArea, areaKey)) return;
      const normalizedEscopo = syncEscopoToAreas(escopo, parseAreasList(areasDisplay));
      const body = JSON.stringify(normalizedEscopo);
      const shouldPersist = body !== lastPersisted.current && isAreaDirty(areaKey);
      const shouldRestrictToArea = viewerRole !== "admin" && Boolean(viewerProfileArea?.trim());
      setSavingAreaKey(areaKey);
      if (options?.notifyAfter) setNotifyingAreaKey(areaKey);
      try {
        if (shouldPersist) {
          await persist(normalizedEscopo, shouldRestrictToArea ? { restrictToArea: areaKey } : undefined);
        } else {
          collapseCompleteEditableAreas(normalizedEscopo);
        }
        if (options?.notifyAfter) {
          await notifyOtherAreas();
          router.refresh();
        }
      } finally {
        setSavingAreaKey(null);
        setNotifyingAreaKey(null);
      }
    },
    [
      escopo,
      persist,
      router,
      viewerRole,
      viewerProfileArea,
      collapseCompleteEditableAreas,
      isAreaDirty,
      areasDisplay,
      notifyOtherAreas,
    ],
  );

  const patchArea = useCallback((area: string, patch: Partial<PropostaEscopoDetalheEntry>) => {
    setEscopo((prev) => {
      const cur = getEscopoEntryForArea(prev, area) ?? { tipoId: "", subtipoId: "", placeholders: {} };
      const merged: PropostaEscopoDetalheEntry = {
        tipoId: patch.tipoId !== undefined ? patch.tipoId : cur.tipoId,
        subtipoId: patch.subtipoId !== undefined ? patch.subtipoId : cur.subtipoId,
        placeholders:
          patch.placeholders !== undefined ? patch.placeholders : { ...(cur.placeholders ?? {}) },
      };
      if (patch.investimento !== undefined) {
        merged.investimento = patch.investimento;
      } else if (cur.investimento) {
        merged.investimento = cur.investimento;
      }
      return syncEscopoToAreas({ ...prev, [area]: merged }, parseAreasList(areasDisplay));
    });
  }, [areasDisplay]);

  const areas = parseAreasList(areasDisplay);
  const anyAreaDirty = areas.some((a) => isAreaDirty(a));

  function toggleAreaPanel(area: string) {
    setAreaPanelOpen((p) => ({ ...p, [area]: !(p[area] ?? false) }));
  }

  function requestForArea(area: string) {
    const canonical = normalizePracticeAreaKey(area);
    return solicitacoes.find((request) => normalizePracticeAreaKey(request.areaKey) === canonical) ?? null;
  }

  if (areas.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed border-white/40 bg-white/40 p-4 sm:col-span-2", className)}>
        <p className="text-sm font-medium text-primary-dark">Escopo por área</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione ao menos uma área em &quot;Áreas de escopo&quot; para definir tipo e subtipo.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 rounded-lg border border-white/50 bg-white/45 p-4 sm:col-span-2", className)}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary-dark">Escopo detalhado por área</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Cada área abre e fecha no cabeçalho. Use <span className="font-medium text-foreground/90">Salvar esta área</span>{" "}
          para registrar o que você preencheu nessa área. Nas áreas de outras equipes, peça o preenchimento com{" "}
          <span className="font-medium text-foreground/90">Solicitar escopo</span>.
        </p>
        {anyAreaDirty ? (
          <p className="mt-2 text-xs font-medium text-amber-900/90">Há alterações não salvas em uma ou mais áreas.</p>
        ) : null}
        {lastSavedAt ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent-teal">
            <Check className="size-3" aria-hidden />
            Último salvamento às {lastSavedAt}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {savingAreaKey ? (
        <p className="text-xs text-muted-foreground">
          Salvando &quot;{normalizePracticeAreaKey(savingAreaKey)}&quot;…
        </p>
      ) : null}

      <div className="space-y-4">
        {areas.map((area) => {
          const catalogArea = normalizePracticeAreaKey(area) as PropostaAreaKey;
          const entry =
            getEscopoEntryForArea(escopo, area) ?? { tipoId: "", subtipoId: "", placeholders: {} };
          const canEdit = canEditEscopoArea(viewerRole, viewerProfileArea, area);
          const canRequest = canRequestGestorFillForArea(viewerRole, viewerProfileArea, area);
          const complete = isEntryCompleteWithCatalog(area, entry, scopeCatalog, investmentCatalog);
          const panelOpen = areaPanelOpen[area] ?? false;
          const dirty = isAreaDirty(area);
          const request = requestForArea(area);
          /** Só mostra o cartão verde quando o escopo completo já foi salvo (local = último snapshot do servidor). */
          const showCompact =
            canEdit && complete && !dirty && editingMyArea[area] !== true;

          if (!canEdit && !canRequest) {
            const responsaveis = request?.responsaveis ?? EMPTY_RESPONSAVEIS;
            return (
              <div
                key={area}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-muted-foreground"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-primary-dark">{normalizePracticeAreaKey(area)}</span>
                  <Badge variant="outline" className="border-slate-300 bg-white text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                    Sem acesso
                  </Badge>
                </div>
                <span className="mt-2 block text-xs">
                  Seu perfil não pode preencher nem solicitar esta área. Responsáveis:{" "}
                  <strong className="text-slate-700">
                    {responsaveis.length > 0 ? responsaveis.map((user) => user.fullName).join(", ") : "nenhum gestor cadastrado"}
                  </strong>.
                </span>
              </div>
            );
          }

          if (canRequest && !canEdit) {
            return (
              <EscopoAreaDelegated
                key={area}
                leadId={leadId}
                area={area}
                catalogArea={catalogArea}
                entry={entry}
                scopeCatalog={scopeCatalog}
                investmentCatalog={investmentCatalog}
                defaultNomeEmpresa={defaultNomeEmpresa}
                request={request}
                panelOpen={panelOpen}
                onTogglePanel={() => toggleAreaPanel(area)}
              />
            );
          }

          if (showCompact) {
            return (
              <EscopoAreaSavedCompact
                key={area}
                areaLabel={normalizePracticeAreaKey(area)}
                request={request}
                onEdit={() => {
                  setEditingMyArea((p) => ({ ...p, [area]: true }));
                  setAreaPanelOpen((p) => ({ ...p, [area]: true }));
                }}
              />
            );
          }

          return (
            <EscopoAreaBlock
              key={area}
              area={area}
              catalogArea={catalogArea}
              entry={entry}
              scopeCatalog={scopeCatalog}
              investmentCatalog={investmentCatalog}
              defaultNomeEmpresa={defaultNomeEmpresa}
              request={request}
              panelOpen={panelOpen}
              onTogglePanel={() => toggleAreaPanel(area)}
              onPatch={(patch) => patchArea(area, patch)}
              areaDirty={dirty}
              savingThisArea={savingAreaKey === area}
              notifyingThisArea={notifyingAreaKey === area}
              canNotifyOthersAfterSave={Boolean(
                viewerProfileArea?.trim() && appUserAreaMatchesScopeKey(viewerProfileArea, area),
              )}
              onSaveThisArea={() => void saveArea(area)}
              onSaveAndNotify={() => void saveArea(area, { notifyAfter: true })}
            />
          );
        })}
      </div>
    </div>
  );
}

function EscopoAreaDelegatedModal({
  leadId,
  area,
  catalogArea,
  entry,
  scopeCatalog,
  investmentCatalog,
  defaultNomeEmpresa,
  request,
  open,
  onOpenChange,
}: {
  leadId: string;
  area: string;
  catalogArea: PropostaAreaKey;
  entry: PropostaEscopoDetalheEntry;
  scopeCatalog: PropostaTiposCatalog;
  investmentCatalog: InvestimentoTipoDef[];
  defaultNomeEmpresa: string | null;
  request: EscopoAreaSolicitacao | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const areaLabel = normalizePracticeAreaKey(area);
  const responsaveis = request?.responsaveis ?? EMPTY_RESPONSAVEIS;
  const tipos = scopeCatalog[catalogArea] ?? [];
  const tipo = tipos.find((t) => t.tipoId === entry.tipoId);
  const subtipos = tipo?.subtipos ?? [];
  const sub = subtipos.find((s) => s.subtipoId === entry.subtipoId);
  const previewEscopo = sub
    ? mergeEscopoTemplate(sub.escopoTemplate, entry.placeholders ?? {}, { defaultNomeEmpresa }).trim() || "—"
    : "—";
  const invE = entry.investimento;
  const invSubDef =
    invE?.tipoId && invE?.subtipoId ? findInvestmentSubtype(investmentCatalog, invE.tipoId, invE.subtipoId) : undefined;
  const previewInv = invSubDef
    ? mergeInvestimentoTemplate(invSubDef.template, invE?.placeholders ?? {}, { defaultNomeEmpresa }).trim() ||
      "—"
    : "—";

  useEffect(() => {
    const ids = responsaveis.map((user) => user.id);
    setSelectedTargetIds(ids);
  }, [responsaveis]);

  function toggleTarget(id: string) {
    setSelectedTargetIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  }

  async function solicitar() {
    setStatus("loading");
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(leadId)}/proposta-solicitar-escopo-area`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            areaKey: area,
            targetAppUserIds: selectedTargetIds,
          }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Não foi possível enviar o pedido.");
      setStatus("ok");
      setFeedback("Pedido registrado. Os responsáveis selecionados serão notificados pelos canais configurados.");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setFeedback(e instanceof Error ? e.message : "Erro ao solicitar.");
    }
  }

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] max-w-[min(1120px,calc(100vw-2rem))] overflow-hidden rounded-[30px] border-[#dfe5ee] bg-[#f6f8fb] p-0 text-primary-dark shadow-[0_40px_120px_rgba(16,31,46,0.26)] [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:bg-white/85 [&>button]:p-2 [&>button]:text-[#102033] [&>button]:shadow-sm [&>button]:hover:bg-white"
        onPointerDownOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
      >
        <EscopoModalHeader areaLabel={areaLabel} request={request} statusLabel="Outra equipe" />
        <div className="crm-scrollbar max-h-[calc(92vh-170px)] overflow-y-auto px-5 py-5 sm:px-7">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(340px,1.1fr)]">
            <div className="rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#24615b]">Acionamento da área</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Você não pode preencher esta área. Selecione abaixo quem da prática deve receber a notificação para assumir o escopo.
              </p>
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
                Permissão: somente admin ou comercial da área {areaLabel} pode editar este escopo.
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <ReadOnlyPair label="Tipo (escopo)" value={tipo?.label ?? "—"} />
              <ReadOnlyPair label="Subtipo (escopo)" value={sub?.label ?? "—"} />
              <ReadOnlyPair label="Tipo (investimento)" value={investmentCatalog.find((t) => t.tipoId === invE?.tipoId)?.label ?? "—"} />
              <ReadOnlyPair label="Subtipo (investimento)" value={invSubDef?.label ?? "—"} />
            </div>
          </div>
          <div className="mt-5 rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#24615b]">Quem notificar</p>
                <p className="mt-1 text-sm text-slate-500">
                  Responsáveis comerciais cadastrados na área {areaLabel}.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {selectedTargetIds.length}/{responsaveis.length} selecionado(s)
              </span>
            </div>
            {responsaveis.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {responsaveis.map((user) => {
                  const checked = selectedTargetIds.includes(user.id);
                  return (
                    <label
                      key={user.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-all",
                        checked
                          ? "border-[#24615b]/35 bg-emerald-50 shadow-sm"
                          : "border-[#edf0f4] bg-[#fbfcfd] hover:border-[#dfe5ee] hover:bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-[#24615b]"
                        checked={checked}
                        onChange={() => toggleTarget(user.id)}
                      />
                      <Avatar className="h-9 w-9 border-2 border-white shadow-sm">
                        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" className="object-cover" /> : null}
                        <AvatarFallback className="bg-[#102033] text-[11px] font-black text-white">
                          {initialsFromFullName(user.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-extrabold text-[#102033]">{user.fullName}</span>
                        <span className="block text-xs font-semibold text-slate-500">Gestor responsável</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
                Nenhum usuário comercial está cadastrado para esta área. Ajuste a área do usuário na página de usuários.
              </p>
            )}
          </div>
          <div className="mt-5">
            <PreviewGrid escopo={sub ? previewEscopo : "—"} investimento={previewInv} />
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-[#dfe5ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-xs text-muted-foreground">
            {feedback ?? "Solicite o preenchimento para registrar prazo e canais de notificação."}
          </p>
          <Button
            type="button"
            variant="teal"
            className="gap-2"
            disabled={status === "loading" || selectedTargetIds.length === 0}
            onClick={() => void solicitar()}
          >
            {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Notificar selecionados
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EscopoAreaDelegated({
  leadId,
  area,
  catalogArea,
  entry,
  scopeCatalog,
  investmentCatalog,
  defaultNomeEmpresa,
  request,
  panelOpen,
  onTogglePanel,
}: {
  leadId: string;
  area: string;
  catalogArea: PropostaAreaKey;
  entry: PropostaEscopoDetalheEntry;
  scopeCatalog: PropostaTiposCatalog;
  investmentCatalog: InvestimentoTipoDef[];
  defaultNomeEmpresa: string | null;
  request: EscopoAreaSolicitacao | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
}) {
  const areaLabel = normalizePracticeAreaKey(area);
  return (
    <>
      <AreaSummaryCard
        areaLabel={areaLabel}
        request={request}
        complete={Boolean(request?.concluidoEm)}
        dirty={false}
        tone="delegated"
        actionLabel="Solicitar / revisar"
        onOpen={onTogglePanel}
      />
      <EscopoAreaDelegatedModal
        leadId={leadId}
        area={area}
        catalogArea={catalogArea}
        entry={entry}
        scopeCatalog={scopeCatalog}
        investmentCatalog={investmentCatalog}
        defaultNomeEmpresa={defaultNomeEmpresa}
        request={request}
        open={panelOpen}
        onOpenChange={onTogglePanel}
      />
    </>
  );
}

function EscopoAreaSavedCompact({
  areaLabel,
  request,
  onEdit,
}: {
  areaLabel: string;
  request: EscopoAreaSolicitacao | null;
  onEdit: () => void;
}) {
  return (
    <AreaSummaryCard
      areaLabel={areaLabel}
      request={request}
      complete
      dirty={false}
      tone="complete"
      actionLabel="Revisar escopo"
      onOpen={onEdit}
    />
  );
}

function EscopoAreaBlock({
  area,
  catalogArea,
  entry,
  scopeCatalog,
  investmentCatalog,
  defaultNomeEmpresa,
  request,
  panelOpen,
  onTogglePanel,
  onPatch,
  areaDirty,
  savingThisArea,
  notifyingThisArea,
  canNotifyOthersAfterSave,
  onSaveThisArea,
  onSaveAndNotify,
}: {
  area: string;
  catalogArea: PropostaAreaKey;
  entry: PropostaEscopoDetalheEntry;
  scopeCatalog: PropostaTiposCatalog;
  investmentCatalog: InvestimentoTipoDef[];
  defaultNomeEmpresa: string | null;
  request: EscopoAreaSolicitacao | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onPatch: (patch: Partial<PropostaEscopoDetalheEntry>) => void;
  areaDirty: boolean;
  savingThisArea: boolean;
  notifyingThisArea: boolean;
  canNotifyOthersAfterSave: boolean;
  onSaveThisArea: () => void;
  onSaveAndNotify: () => void;
}) {
  const areaLabel = normalizePracticeAreaKey(area);
  const tipos = scopeCatalog[catalogArea] ?? [];
  const tipo = tipos.find((t) => t.tipoId === entry.tipoId);
  const subtipos = tipo?.subtipos ?? [];
  const sub = subtipos.find((s) => s.subtipoId === entry.subtipoId);
  const placeholderKeys = sub?.placeholderKeys ?? EMPTY_PLACEHOLDER_KEYS;
  const seedSigRef = useRef<string>("");
  const onPatchRef = useRef(onPatch);

  useEffect(() => {
    onPatchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    const sig = `${catalogArea}|${entry.tipoId}|${entry.subtipoId}|${defaultNomeEmpresa ?? ""}`;
    if (!sub || !defaultNomeEmpresa) return;
    if (!placeholderKeys.some((k) => k.trim() === ESCOPO_PLACEHOLDER_NOME_EMPRESA)) return;
    if (entry.placeholders?.[ESCOPO_PLACEHOLDER_NOME_EMPRESA]?.trim()) return;
    if (seedSigRef.current === sig) return;
    seedSigRef.current = sig;
    onPatchRef.current({
      placeholders: {
        ...(entry.placeholders ?? {}),
        [ESCOPO_PLACEHOLDER_NOME_EMPRESA]: defaultNomeEmpresa,
      },
    });
  }, [
    catalogArea,
    sub,
    entry.tipoId,
    entry.subtipoId,
    entry.placeholders,
    defaultNomeEmpresa,
    placeholderKeys,
  ]);

  if (!tipos.length) {
    return (
      <div className="overflow-hidden rounded-xl border border-amber-200/90 bg-amber-50/90 shadow-sm">
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-amber-100/50"
          onClick={onTogglePanel}
        >
          <ChevronDown
            className={cn("size-5 shrink-0 text-amber-800/80 transition-transform", panelOpen && "rotate-180")}
            aria-hidden
          />
          <span className="text-base font-semibold text-primary-dark">{areaLabel}</span>
        </button>
        {panelOpen ? (
          <div className="border-t border-amber-200/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Nenhum tipo/subtipo configurado no catálogo para esta área. Atualize o arquivo de dados ou o Excel e
              gere o catálogo de novo.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  const previewEscopo = sub
    ? mergeEscopoTemplate(sub.escopoTemplate, entry.placeholders ?? {}, { defaultNomeEmpresa }).trim() || "—"
    : "—";
  const invE = entry.investimento;
  const invSubDef =
    invE?.tipoId && invE?.subtipoId ? findInvestmentSubtype(investmentCatalog, invE.tipoId, invE.subtipoId) : undefined;
  const previewInv = invSubDef
    ? mergeInvestimentoTemplate(invSubDef.template, invE?.placeholders ?? {}, { defaultNomeEmpresa }).trim() ||
      "—"
    : "—";

  const invEntry = {
    tipoId: invE?.tipoId ?? "",
    subtipoId: invE?.subtipoId ?? "",
    placeholders: invE?.placeholders ?? {},
  };
  const invTipoSel = investmentCatalog.find((t) => t.tipoId === invEntry.tipoId);
  const invSubtiposList = invTipoSel?.subtipos ?? [];
  const invPlaceholderKeys = invSubDef?.placeholderKeys ?? [];

  const tipoSelectValue = (entry.tipoId ?? "").trim();
  const subtipoSelectValue = (entry.subtipoId ?? "").trim();
  const complete = isEntryCompleteWithCatalog(area, entry, scopeCatalog, investmentCatalog);

  return (
    <>
      <AreaSummaryCard
        areaLabel={areaLabel}
        request={request}
        complete={complete}
        dirty={areaDirty}
        tone={complete ? "complete" : "editable"}
        actionLabel={complete ? "Revisar escopo" : "Preencher escopo"}
        onOpen={onTogglePanel}
      />
      <Dialog modal={false} open={panelOpen} onOpenChange={(open) => {
        if (open !== panelOpen) onTogglePanel();
      }}>
        <DialogContent
          // z-[130] no content + z-[120] no backdrop garantem que este sub-dialog
          // fique acima do dialog pai "Elaborar Proposta" (z-[110]/z-[100]).
          className="z-[130] max-h-[92vh] max-w-[min(1220px,calc(100vw-2rem))] overflow-hidden rounded-[30px] border-[#dfe5ee] bg-[#f6f8fb] p-0 text-primary-dark shadow-[0_40px_120px_rgba(16,31,46,0.26)] [&>button]:right-5 [&>button]:top-5 [&>button]:rounded-full [&>button]:bg-white/85 [&>button]:p-2 [&>button]:text-[#102033] [&>button]:shadow-sm [&>button]:hover:bg-white"
          overlayClassName="z-[120]"
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          <EscopoModalHeader
            areaLabel={areaLabel}
            request={request}
            statusLabel={complete ? "Preenchido" : areaDirty ? "Alterações não salvas" : "Em preenchimento"}
          />
          <div className="crm-scrollbar max-h-[calc(92vh-185px)] overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-4">
                <div className="rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#24615b]">1. Escopo técnico</p>
                      <p className="mt-1 text-sm text-slate-500">Escolha a natureza do trabalho e complete os campos que entram no documento.</p>
                    </div>
                    <span className="rounded-full border border-[#d8bf82]/45 bg-[#fff7df] px-3 py-1 text-xs font-bold text-[#73531c]">
                      Documento
                    </span>
                  </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo (escopo)</Label>
          <Select
            value={tipoSelectValue ? tipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ tipoId, subtipoId: "", placeholders: {} });
            }}
          >
            <SelectTrigger className="h-10 w-full min-w-[12rem] border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
              <SelectValue
                placeholder="Selecione o tipo"
                className={!tipoSelectValue ? "text-muted-foreground" : undefined}
              >
                {!tipoSelectValue
                  ? "Selecione o tipo"
                  : tipo?.label ?? "Selecione o tipo"}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o tipo</CrmSelectItem>
              {tipos.map((t) => (
                <CrmSelectItem key={t.tipoId} value={t.tipoId}>
                  {t.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subtipo (escopo)</Label>
          <Select
            value={subtipoSelectValue ? subtipoSelectValue : SELECT_EMPTY}
            onValueChange={(v) => {
              const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
              onPatch({ subtipoId, placeholders: {} });
            }}
            disabled={!entry.tipoId}
          >
            <SelectTrigger className="h-10 w-full min-w-[12rem] border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
              <SelectValue
                placeholder="Selecione o subtipo"
                className={!subtipoSelectValue ? "text-muted-foreground" : undefined}
              >
                {!subtipoSelectValue
                  ? "Selecione o subtipo"
                  : sub?.label ?? "Selecione o subtipo"}
              </SelectValue>
            </SelectTrigger>
            <CrmSelectContent>
              <CrmSelectItem value={SELECT_EMPTY}>Selecione o subtipo</CrmSelectItem>
              {subtipos.map((s) => (
                <CrmSelectItem key={s.subtipoId} value={s.subtipoId}>
                  {s.label}
                </CrmSelectItem>
              ))}
            </CrmSelectContent>
          </Select>
        </div>
      </div>

      {placeholderKeys.length > 0 && sub ? (
        <div className="grid gap-3 border-t border-[#edf0f4] pt-4 sm:grid-cols-2">
          {placeholderKeys.map((key) => (
            <PlaceholderField
              key={key}
              phKey={key}
              value={entry.placeholders?.[key] ?? ""}
              onChange={(next) =>
                onPatch({
                  placeholders: { ...(entry.placeholders ?? {}), [key]: next },
                })
              }
            />
          ))}
        </div>
      ) : null}
                </div>

      <div className="rounded-[24px] border border-[#dfe5ee] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#24615b]">2. Investimento</p>
            <p className="mt-1 text-sm text-slate-500">Defina o modelo comercial e os valores que serão refletidos na proposta.</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
            Comercial
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</Label>
            <Select
              value={invEntry.tipoId ? invEntry.tipoId : SELECT_EMPTY}
              onValueChange={(v) => {
                const tipoId = v === SELECT_EMPTY || v == null ? "" : v;
                onPatch({
                  investimento: {
                    tipoId,
                    subtipoId: "",
                    placeholders: {},
                  },
                });
              }}
            >
              <SelectTrigger className="h-10 w-full min-w-[12rem] border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
                <SelectValue
                  placeholder="Selecione o tipo de investimento"
                  className={!invEntry.tipoId ? "text-muted-foreground" : undefined}
                >
                  {!invEntry.tipoId
                    ? "Selecione o tipo de investimento"
                    : invTipoSel?.label ?? "Selecione o tipo de investimento"}
                </SelectValue>
              </SelectTrigger>
              <CrmSelectContent>
                <CrmSelectItem value={SELECT_EMPTY}>Selecione o tipo de investimento</CrmSelectItem>
                {investmentCatalog.map((t) => (
                  <CrmSelectItem key={t.tipoId} value={t.tipoId}>
                    {t.label}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Subtipo</Label>
            <Select
              value={invEntry.subtipoId ? invEntry.subtipoId : SELECT_EMPTY}
              onValueChange={(v) => {
                const subtipoId = v === SELECT_EMPTY || v == null ? "" : v;
                onPatch({
                  investimento: {
                    tipoId: invEntry.tipoId,
                    subtipoId,
                    placeholders: {},
                  },
                });
              }}
              disabled={!invEntry.tipoId}
            >
              <SelectTrigger className="h-10 w-full min-w-[12rem] border-[#dfe5ee] bg-[#fbfcfd] shadow-sm">
                <SelectValue
                  placeholder="Selecione o subtipo de investimento"
                  className={!invEntry.subtipoId ? "text-muted-foreground" : undefined}
                >
                  {!invEntry.subtipoId
                    ? "Selecione o subtipo de investimento"
                    : invSubtiposList.find((s) => s.subtipoId === invEntry.subtipoId)?.label ??
                      "Selecione o subtipo de investimento"}
                </SelectValue>
              </SelectTrigger>
              <CrmSelectContent>
                <CrmSelectItem value={SELECT_EMPTY}>Selecione o subtipo de investimento</CrmSelectItem>
                {invSubtiposList.map((s) => (
                  <CrmSelectItem key={s.subtipoId} value={s.subtipoId}>
                    {s.label}
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </div>
        </div>
        {invSubDef?.conceito ? (
          <p className="rounded-2xl border border-[#edf0f4] bg-[#f8fafc] p-3 text-xs leading-relaxed text-slate-600">{invSubDef.conceito}</p>
        ) : null}
        {invSubDef && invPlaceholderKeys.length > 0 ? (
          <div className="grid gap-3 border-t border-[#edf0f4] pt-4 sm:grid-cols-2">
            {invPlaceholderKeys.map((key) => (
              <PlaceholderField
                key={`inv-${key}`}
                phKey={key}
                value={invEntry.placeholders[key] ?? ""}
                isCurrency={PROPOSTA_INVESTIMENTO_PLACEHOLDER_CURRENCY.has(key)}
                onChange={(next) =>
                  onPatch({
                    investimento: {
                      tipoId: invEntry.tipoId,
                      subtipoId: invEntry.subtipoId,
                      placeholders: { ...invEntry.placeholders, [key]: next },
                    },
                  })
                }
              />
            ))}
          </div>
        ) : null}
      </div>

              </div>
              <PreviewGrid escopo={sub ? previewEscopo || "—" : "—"} investimento={previewInv} />
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t border-[#dfe5ee] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <div className="min-w-0 text-xs text-muted-foreground">
              {areaDirty ? "Há alterações não salvas nesta área." : "Tudo salvo nesta área até o momento."}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={areaDirty ? "teal" : "outline"}
              size="sm"
              className="gap-2"
              disabled={!areaDirty || savingThisArea}
              onClick={onSaveThisArea}
            >
              {savingThisArea ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Save className="size-4" aria-hidden />
              )}
              Salvar esta área
            </Button>
            {canNotifyOthersAfterSave ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={savingThisArea || notifyingThisArea}
                onClick={onSaveAndNotify}
              >
                {notifyingThisArea ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="size-4" aria-hidden />
                )}
                Salvar e notificar pendentes
              </Button>
            ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function areaStatusLabel(params: {
  complete: boolean;
  dirty: boolean;
  request: EscopoAreaSolicitacao | null;
  nowMs: number;
}) {
  if (params.dirty) return "Em edição";
  if (params.complete || params.request?.concluidoEm) return "Preenchido";
  if (params.request?.prazoAte && new Date(params.request.prazoAte).getTime() < params.nowMs) return "Atrasado";
  if (params.request?.notificadoEm) return "Solicitado";
  return "Pendente";
}

function AreaSummaryCard({
  areaLabel,
  request,
  complete,
  dirty,
  tone,
  actionLabel,
  onOpen,
}: {
  areaLabel: string;
  request: EscopoAreaSolicitacao | null;
  complete: boolean;
  dirty: boolean;
  tone: "complete" | "editable" | "delegated";
  actionLabel: string;
  onOpen: () => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const gestorName = request?.gestor?.fullName ?? `Gestor ${areaLabel}`;
  const preenchidoPorName = request?.preenchidoPor?.fullName ?? request?.gestor?.fullName ?? null;
  const responsaveis = request?.responsaveis ?? EMPTY_RESPONSAVEIS;
  const responsaveisLabel =
    responsaveis.length > 0
      ? responsaveis.map((user) => user.fullName).join(", ")
      : gestorName;
  const permissionLabel =
    tone === "delegated"
      ? "Você pode solicitar, mas não preencher"
      : tone === "editable"
        ? "Você pode preencher esta área"
        : "Você pode revisar o preenchimento";
  const status = areaStatusLabel({ complete, dirty, request, nowMs });
  const statusTone =
    status === "Preenchido"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "Atrasado"
        ? "border-rose-200 bg-rose-50 text-rose-800"
        : status === "Em edição"
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(16,31,46,0.08)]",
        tone === "complete" && "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white",
        tone === "editable" && "border-[#dfe5ee] bg-white",
        tone === "delegated" && "border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white",
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#c8a96b]/15 blur-2xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar className="h-11 w-11 shrink-0 border-2 border-white shadow-sm">
            {request?.gestor?.avatarUrl ? (
              <AvatarImage src={request.gestor.avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-[#102033] text-[11px] font-black text-white">
              {initialsFromFullName(request?.gestor?.fullName ?? areaLabel)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-extrabold tracking-[-0.02em] text-primary-dark">{areaLabel}</p>
              <Badge variant="outline" className={cn("h-6 border text-[11px]", statusTone)}>
                {status}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "h-6 border text-[10px] font-black uppercase tracking-[0.08em]",
                  tone === "delegated"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800",
                )}
              >
                {tone === "delegated" ? "Sem edição" : "Liberado"}
              </Badge>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-500">{permissionLabel}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {complete || request?.concluidoEm ? "Responsável: " : "Gestores responsáveis: "}
              {complete || request?.concluidoEm ? gestorName : responsaveisLabel}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {request?.concluidoEm
                ? `Preenchido${preenchidoPorName ? ` por ${preenchidoPorName}` : ""} em ${formatDateTimeBr(request.concluidoEm)}.`
                : request?.prazoAte
                  ? `Prazo até ${formatDateTimeBr(request.prazoAte)}.`
                  : request?.notificadoEm
                    ? `Solicitado em ${formatDateTimeBr(request.notificadoEm)}.`
                    : "Ainda sem prazo registrado. Solicite o escopo para acionar o gestor."}
            </p>
          </div>
        </div>
        <Button type="button" variant={complete ? "outline" : "teal"} size="sm" className="shrink-0 gap-2" onClick={onOpen}>
          {complete ? <Pencil className="size-3.5" /> : <Send className="size-3.5" />}
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}

function EscopoModalHeader({
  areaLabel,
  request,
  statusLabel,
}: {
  areaLabel: string;
  request: EscopoAreaSolicitacao | null;
  statusLabel: string;
}) {
  return (
    <DialogHeader className="relative overflow-hidden border-b border-[#dfe5ee] bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_58%,#eef5f3_100%)] px-5 py-5 text-primary-dark sm:px-7 sm:py-6">
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#d8bf82]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-0 h-36 w-36 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="h-12 w-12 border-2 border-white shadow-md shadow-slate-900/10">
            {request?.gestor?.avatarUrl ? (
              <AvatarImage src={request.gestor.avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-[#102033] text-sm font-black text-white">
              {initialsFromFullName(request?.gestor?.fullName ?? areaLabel)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#d8bf82]/45 bg-[#fff7df] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#73531c]">
                Escopo por área
              </span>
              <span className="rounded-full border border-[#dfe5ee] bg-white px-2.5 py-1 text-xs font-bold text-[#24615b] shadow-sm">
                {statusLabel}
              </span>
            </div>
            <DialogTitle className="text-2xl font-extrabold tracking-[-0.045em] text-primary-dark sm:text-3xl">
              {areaLabel}
            </DialogTitle>
            <DialogDescription className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">
              {request?.gestor?.fullName ? `Responsável: ${request.gestor.fullName}` : "Responsável ainda não resolvido"}
            </DialogDescription>
          </div>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-3 md:min-w-[520px]">
          <ReadOnlyPair label="Prazo" value={request?.prazoAte ? formatDateTimeBr(request.prazoAte) : "Não definido"} />
          <ReadOnlyPair
            label="Preenchido por"
            value={request?.preenchidoPor?.fullName ?? (request?.concluidoEm ? "Usuário não registrado" : "Ainda não")}
          />
          <ReadOnlyPair label="Preenchido" value={request?.concluidoEm ? formatDateTimeBr(request.concluidoEm) : "Ainda não"} />
        </div>
      </div>
    </DialogHeader>
  );
}

function ReadOnlyPair({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 shadow-sm", dark ? "border-white/10 bg-white/10" : "border-[#dfe5ee] bg-white/90")}>
      <p className={cn("text-[10px] font-black uppercase tracking-[0.14em]", dark ? "text-white/45" : "text-slate-400")}>
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-bold", dark ? "text-white" : "text-primary-dark")}>{value}</p>
    </div>
  );
}

function PreviewGrid({ escopo, investimento }: { escopo: string; investimento: string }) {
  return (
    <aside className="sticky top-0 overflow-hidden rounded-[26px] border border-[#dfe5ee] bg-[#eef2f6] p-3 shadow-sm">
      <div className="rounded-[22px] border border-white bg-white p-5 shadow-[0_18px_50px_rgba(16,31,46,0.08)]">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#edf0f4] pb-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#24615b]">Preview da proposta</p>
            <p className="mt-1 text-xs text-slate-500">Leitura aproximada do que entrará no documento.</p>
          </div>
          <span className="rounded-full border border-[#dfe5ee] bg-[#f8fafc] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            Word
          </span>
        </div>
      <div className="grid gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Escopo</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#edf0f4] bg-[#fbfcfd] p-4 font-sans text-xs leading-relaxed text-primary-dark">
            {escopo}
          </pre>
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Investimento</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#edf0f4] bg-[#fbfcfd] p-4 font-sans text-xs leading-relaxed text-primary-dark">
            {investimento}
          </pre>
        </div>
      </div>
      </div>
    </aside>
  );
}

function PlaceholderField({
  phKey,
  value,
  onChange,
  isCurrency = false,
}: {
  phKey: string;
  value: string;
  onChange: (next: string) => void;
  /** Campo monetário: aceita dígitos; na prévia aplica-se formatação pt-BR e valor por extenso. */
  isCurrency?: boolean;
}) {
  const k = phKey.trim();
  const isNome = k === ESCOPO_PLACEHOLDER_NOME_EMPRESA;
  const isProc = isNumeroProcessoPlaceholderKey(k);
  const forceUpper = ESCOPO_PLACEHOLDER_UPPERCASE.has(k);

  const fieldLabel = getPropostaPlaceholderLabel(k);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold leading-snug text-slate-500">{fieldLabel}</Label>
      <Input
        className="h-10 border-[#dfe5ee] bg-[#fbfcfd] shadow-sm focus-visible:border-[#24615b]/45 focus-visible:ring-[#24615b]/15"
        value={value}
        onChange={(e) => {
          let next = e.target.value;
          if (isProc) {
            next = maskNumeroProcessoCNJ(next);
          } else if (forceUpper) {
            next = next.toLocaleUpperCase("pt-BR");
          }
          onChange(next);
        }}
        placeholder={
          isNome
            ? "Preenchido pela empresa principal na proposta (pode editar)"
            : isCurrency
              ? "Valor (ex.: 5000 ou 5.000,50)"
              : `Texto para «${fieldLabel}»`
        }
        inputMode={isProc ? "numeric" : isCurrency ? "decimal" : "text"}
        autoComplete="off"
      />
    </div>
  );
}
