"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Pencil, Plus, Save, Send, Trash2 } from "lucide-react";
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
import { AreaIconLabel, PracticeAreaIconBadge } from "@/lib/crm/area-lucide-icon";
import { getEscopoEntriesForArea, isEscopoAreaComplete } from "@/lib/crm/proposta-escopo-entry";
import { getEscopoDirecionamentoHint } from "@/lib/crm/proposta-escopo-direcionamento";
import { initialsFromFullName, type ResolvedAppUser } from "@/lib/crm/resolve-app-user-display";
import {
  canEditEscopoArea,
  canRequestGestorFillForArea,
} from "@/lib/crm/proposta-escopo-permissions";
import { getPropostaPlaceholderLabel } from "@/lib/crm/proposta-placeholder-labels";
import {
  createEmptyEscopoEntry,
  escopoJsonEqual,
  normalizeEscopoEntry,
  parseAreasList,
  parseEscopoJson,
  syncEscopoToAreas,
} from "@/lib/crm/proposta-escopo-json";
import { Input } from "@/components/ui/input";
import { PropostaEscopoEntryForm } from "@/components/crm/proposta-escopo-entry-form";
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

function mergeEscopoEntryPatch(
  cur: PropostaEscopoDetalheEntry,
  patch: Partial<PropostaEscopoDetalheEntry>,
): PropostaEscopoDetalheEntry {
  const merged: PropostaEscopoDetalheEntry = {
    ...cur,
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
  return normalizeEscopoEntry(merged);
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
          const ents = getEscopoEntriesForArea(nextEscopo, a);
          if (isEscopoAreaComplete(a, ents, scopeCatalog, investmentCatalog)) out[a] = false;
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
                getEscopoEntriesForArea(normalizedNext, options.restrictToArea),
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
    const a = getEscopoEntriesForArea(escopo, areaKey);
    const b = getEscopoEntriesForArea(lastSavedSnapshot.current, areaKey);
    return JSON.stringify(a) !== JSON.stringify(b);
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

  const patchAreaEntry = useCallback(
    (area: string, entryId: string, patch: Partial<PropostaEscopoDetalheEntry>) => {
      setEscopo((prev) => {
        const list = getEscopoEntriesForArea(prev, area).map((e) =>
          e.id === entryId ? mergeEscopoEntryPatch(e, patch) : e,
        );
        return syncEscopoToAreas({ ...prev, [area]: list }, parseAreasList(areasDisplay));
      });
    },
    [areasDisplay],
  );

  const addAreaEntry = useCallback(
    (area: string) => {
      setEscopo((prev) => {
        const list = [...getEscopoEntriesForArea(prev, area), createEmptyEscopoEntry()];
        return syncEscopoToAreas({ ...prev, [area]: list }, parseAreasList(areasDisplay));
      });
    },
    [areasDisplay],
  );

  const removeAreaEntry = useCallback(
    (area: string, entryId: string) => {
      setEscopo((prev) => {
        let list = getEscopoEntriesForArea(prev, area).filter((e) => e.id !== entryId);
        if (list.length === 0) list = [createEmptyEscopoEntry()];
        return syncEscopoToAreas({ ...prev, [area]: list }, parseAreasList(areasDisplay));
      });
    },
    [areasDisplay],
  );

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
          Cada área pode ter <span className="font-medium text-foreground/90">vários escopos</span> (ex.: dois processos
          distintos em Cível). Use <span className="font-medium text-foreground/90">Salvar esta área</span> após
          preencher. Nas áreas de outras equipes, use <span className="font-medium text-foreground/90">Solicitar escopo</span>.
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
          const entries = getEscopoEntriesForArea(escopo, area);
          const canEdit = canEditEscopoArea(viewerRole, viewerProfileArea, area);
          const canRequest = canRequestGestorFillForArea(viewerRole, viewerProfileArea, area);
          const complete = isEscopoAreaComplete(area, entries, scopeCatalog, investmentCatalog);
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
                  <AreaIconLabel area={normalizePracticeAreaKey(area)} size="sm" nameClassName="font-extrabold text-primary-dark" />
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
                entries={entries}
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
                scopeCount={entries.length}
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
              entries={entries}
              scopeCatalog={scopeCatalog}
              investmentCatalog={investmentCatalog}
              defaultNomeEmpresa={defaultNomeEmpresa}
              request={request}
              panelOpen={panelOpen}
              onTogglePanel={() => toggleAreaPanel(area)}
              onPatchEntry={(entryId, patch) => patchAreaEntry(area, entryId, patch)}
              onAddEntry={() => addAreaEntry(area)}
              onRemoveEntry={(entryId) => removeAreaEntry(area, entryId)}
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

function buildEntriesPreviewText(
  entries: PropostaEscopoDetalheEntry[],
  catalogArea: PropostaAreaKey,
  scopeCatalog: PropostaTiposCatalog,
  investmentCatalog: InvestimentoTipoDef[],
  defaultNomeEmpresa: string | null,
): { escopo: string; investimento: string } {
  const escopoParts: string[] = [];
  const invParts: string[] = [];
  const areaLabel = normalizePracticeAreaKey(catalogArea);

  entries.forEach((entry, index) => {
    const prefix = entries.length > 1 ? `Escopo ${index + 1}\n` : "";
    if (entry.tipoId && entry.subtipoId) {
      const sub = findScopeSubtype(scopeCatalog, areaLabel, entry.tipoId, entry.subtipoId);
      if (sub) {
        const text = mergeEscopoTemplate(sub.escopoTemplate, entry.placeholders ?? {}, {
          defaultNomeEmpresa,
        }).trim();
        if (text) escopoParts.push(`${prefix}${text}`);
      }
    }
    const inv = entry.investimento;
    if (inv?.tipoId && inv.subtipoId) {
      const invSub = findInvestmentSubtype(investmentCatalog, inv.tipoId, inv.subtipoId);
      if (invSub) {
        const text = mergeInvestimentoTemplate(invSub.template, inv.placeholders ?? {}, {
          defaultNomeEmpresa,
        }).trim();
        if (text) invParts.push(`${prefix}${text}`);
      }
    }
  });

  return {
    escopo: escopoParts.join("\n\n") || "—",
    investimento: invParts.join("\n\n") || "—",
  };
}

function EscopoAreaDelegatedModal({
  leadId,
  area,
  catalogArea,
  entries,
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
  entries: PropostaEscopoDetalheEntry[];
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
  const { escopo: previewEscopo, investimento: previewInv } = buildEntriesPreviewText(
    entries,
    catalogArea,
    scopeCatalog,
    investmentCatalog,
    defaultNomeEmpresa,
  );

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
              <ReadOnlyPair
                label="Blocos de escopo"
                value={entries.length > 0 ? String(entries.length) : "—"}
              />
              <ReadOnlyPair
                label="Resumo"
                value={
                  entries.length > 1
                    ? `${entries.length} escopos configurados (prévia abaixo)`
                    : entries[0]?.tipoId
                      ? "1 escopo em configuração"
                      : "—"
                }
              />
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
            <PreviewGrid escopo={previewEscopo} investimento={previewInv} />
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
  entries,
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
  entries: PropostaEscopoDetalheEntry[];
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
        scopeCount={entries.length}
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
        entries={entries}
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
  scopeCount = 1,
  request,
  onEdit,
}: {
  areaLabel: string;
  scopeCount?: number;
  request: EscopoAreaSolicitacao | null;
  onEdit: () => void;
}) {
  return (
    <AreaSummaryCard
      areaLabel={areaLabel}
      scopeCount={scopeCount}
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
  entries,
  scopeCatalog,
  investmentCatalog,
  defaultNomeEmpresa,
  request,
  panelOpen,
  onTogglePanel,
  onPatchEntry,
  onAddEntry,
  onRemoveEntry,
  areaDirty,
  savingThisArea,
  notifyingThisArea,
  canNotifyOthersAfterSave,
  onSaveThisArea,
  onSaveAndNotify,
}: {
  area: string;
  catalogArea: PropostaAreaKey;
  entries: PropostaEscopoDetalheEntry[];
  scopeCatalog: PropostaTiposCatalog;
  investmentCatalog: InvestimentoTipoDef[];
  defaultNomeEmpresa: string | null;
  request: EscopoAreaSolicitacao | null;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onPatchEntry: (entryId: string, patch: Partial<PropostaEscopoDetalheEntry>) => void;
  onAddEntry: () => void;
  onRemoveEntry: (entryId: string) => void;
  areaDirty: boolean;
  savingThisArea: boolean;
  notifyingThisArea: boolean;
  canNotifyOthersAfterSave: boolean;
  onSaveThisArea: () => void;
  onSaveAndNotify: () => void;
}) {
  const areaLabel = normalizePracticeAreaKey(area);
  const tipos = scopeCatalog[catalogArea] ?? [];
  const { escopo: previewEscopo, investimento: previewInv } = buildEntriesPreviewText(
    entries,
    catalogArea,
    scopeCatalog,
    investmentCatalog,
    defaultNomeEmpresa,
  );
  const complete = isEscopoAreaComplete(area, entries, scopeCatalog, investmentCatalog);
  const direcionamentoHint = getEscopoDirecionamentoHint(
    scopeCatalog,
    area,
    entries.map((e) => e.tipoId ?? "").filter((id) => id.trim()),
  );

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
          <AreaIconLabel area={areaLabel} size="md" nameClassName="text-base font-semibold text-primary-dark" />
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

  return (
    <>
      <AreaSummaryCard
        areaLabel={areaLabel}
        scopeCount={entries.length}
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
            direcionamentoHint={!complete ? direcionamentoHint : null}
          />
          <div className="crm-scrollbar max-h-[calc(92vh-185px)] overflow-y-auto px-5 py-5 sm:px-7">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-4">
                {entries.map((entry, index) => (
                  <PropostaEscopoEntryForm
                    key={entry.id}
                    entryIndex={index}
                    entryCount={entries.length}
                    entry={entry}
                    catalogArea={catalogArea}
                    tipos={tipos}
                    investmentCatalog={investmentCatalog}
                    defaultNomeEmpresa={defaultNomeEmpresa}
                    canRemove={entries.length > 1}
                    onPatch={(patch) => onPatchEntry(entry.id, patch)}
                    onRemove={() => onRemoveEntry(entry.id)}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-dashed border-[#24615b]/35 text-[#24615b] hover:bg-[#24615b]/5"
                  onClick={onAddEntry}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar outro escopo nesta área
                </Button>
              </div>
              <PreviewGrid escopo={previewEscopo} investimento={previewInv} />
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
  scopeCount = 1,
  request,
  complete,
  dirty,
  tone,
  actionLabel,
  onOpen,
}: {
  areaLabel: string;
  scopeCount?: number;
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
          <PracticeAreaIconBadge area={areaLabel} size="lg" />
          <Avatar className="h-9 w-9 shrink-0 border-2 border-white shadow-sm ring-1 ring-[#dfe5ee]">
            {request?.gestor?.avatarUrl ? (
              <AvatarImage src={request.gestor.avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-[#102033] text-[10px] font-black text-white">
              {initialsFromFullName(request?.gestor?.fullName ?? areaLabel)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-extrabold tracking-[-0.02em] text-primary-dark">{areaLabel}</p>
              {scopeCount > 1 ? (
                <Badge variant="outline" className="h-6 border-slate-200 bg-white text-[10px] font-bold text-slate-600">
                  {scopeCount} escopos
                </Badge>
              ) : null}
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
  direcionamentoHint,
}: {
  areaLabel: string;
  request: EscopoAreaSolicitacao | null;
  statusLabel: string;
  direcionamentoHint?: string | null;
}) {
  return (
    <DialogHeader className="relative overflow-hidden border-b border-[#dfe5ee] bg-[linear-gradient(135deg,#ffffff_0%,#f7f9fc_58%,#eef5f3_100%)] px-5 py-5 text-primary-dark sm:px-7 sm:py-6">
      <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[#d8bf82]/20 blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-0 h-36 w-36 rounded-full bg-emerald-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <PracticeAreaIconBadge area={areaLabel} size="lg" className="shadow-sm" />
          <Avatar className="h-10 w-10 border-2 border-white shadow-md shadow-slate-900/10 ring-1 ring-[#dfe5ee]">
            {request?.gestor?.avatarUrl ? (
              <AvatarImage src={request.gestor.avatarUrl} alt="" className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-[#102033] text-xs font-black text-white">
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
            <DialogDescription className="mt-1 max-w-2xl space-y-1 text-sm leading-relaxed text-slate-500">
              <span className="block">
                {request?.gestor?.fullName ? `Responsável: ${request.gestor.fullName}` : "Responsável ainda não resolvido"}
              </span>
              {direcionamentoHint ? (
                <span className="block font-semibold text-[#24615b]">{direcionamentoHint}</span>
              ) : null}
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
