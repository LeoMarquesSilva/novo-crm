"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Pencil, Plus, Save, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { DocumentSaveStatus } from "@/components/crm/document-builder-chrome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";
import { appUserAreaMatchesScopeKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { AreaIconLabel, PracticeAreaIconBadge } from "@/lib/crm/area-lucide-icon";
import { getEscopoEntriesForArea, isEscopoAreaComplete } from "@/lib/crm/proposta-escopo-entry";
import { getEscopoDirecionamentoHint } from "@/lib/crm/proposta-escopo-direcionamento";
import type { ResolvedAppUser } from "@/lib/crm/resolve-app-user-display";
import {
  canEditEscopoArea,
  canRequestGestorFillForArea,
} from "@/lib/crm/proposta-escopo-permissions";
import {
  createEmptyEscopoEntry,
  escopoJsonEqual,
  normalizeEscopoEntry,
  parseAreasList,
  parseEscopoJson,
  parseEscopoJsonWithMeta,
  stringifyEscopoJsonWithMeta,
  syncEscopoToAreas,
} from "@/lib/crm/proposta-escopo-json";
import { applyProposalScopeSave, isProposalScopeAreaDirty } from "@/lib/crm/proposta-escopo-draft";
import { PropostaEscopoEntryForm } from "@/components/crm/proposta-escopo-entry-form";
import { JustifiedDocumentText } from "@/components/crm/justified-document-text";
import { createSupabaseClient } from "@/lib/supabase/client";
import { mergeEscopoTemplate } from "@/lib/crm/proposta-escopo-preview";

const EMPTY_RESPONSAVEIS: Array<ResolvedAppUser & { id: string }> = [];

const SCOPE_DIALOG_CLASS =
  "z-(--z-drag-overlay) flex max-h-[min(94dvh,820px)] w-[calc(100vw-1.5rem)] max-w-[min(1160px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-(--radius-v2-2xl) border-border bg-canvas p-0 text-foreground shadow-(--shadow-v2-lg) [&>button]:right-4 [&>button]:top-4 [&>button]:rounded-(--radius-v2-full) [&>button]:bg-white [&>button]:p-2 [&>button]:text-foreground [&>button]:hover:bg-surface-hover";

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
  /** Current draft, including parent normalization; does not imply persistence. */
  initialValue: string;
  /** Last value confirmed by a successful save. */
  savedValue: string;
  areasDisplay: string;
  /** Razão social da empresa principal na proposta (cadastro + `cp_proposta_empresas_json`). */
  defaultNomeEmpresa: string | null;
  /** `app_users.area` — para mostrar vista "concluído" só na área do usuário. */
  viewerProfileArea?: string | null;
  /** `app_users.role` — regras de edição alinhadas ao PATCH (admin/comercial). */
  viewerRole?: string | null;
  solicitacoes?: EscopoAreaSolicitacao[];
  className?: string;
  disabled?: boolean;
  onSavingChange?: (saving: boolean) => void;
  /**
   * Disparado a cada salvamento bem-sucedido com o JSON do escopo atualizado.
   * Usado pelo builder para sincronizar o rascunho sem buscar do DB.
   */
  onSaved?: (escopoJson: string) => void;
  /** Rascunho local propagado antes da próxima interação de salvar ou gerar. */
  onEscopoDraftChange?: (escopoJson: string) => void;
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
  savedValue,
  areasDisplay,
  defaultNomeEmpresa,
  viewerProfileArea = null,
  viewerRole = null,
  solicitacoes = [],
  className,
  onSaved,
  onEscopoDraftChange,
  disabled = false,
  onSavingChange,
}: Props) {
  const router = useRouter();
  const savingRef = useRef(false);
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
  const [savedEscopoJson, setSavedEscopoJson] = useState(savedValue);
  const investimentoMetaRef = useRef(
    parseEscopoJsonWithMeta(initialValue).investimentoDocumento,
  );
  const lastDraftSentRef = useRef<string | null>(null);

  const loadProposalCatalog = useCallback(() => {
    fetch("/api/crm/proposal-catalog", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { ok?: boolean; data?: { scope?: PropostaTiposCatalog; investment?: InvestimentoTipoDef[] } } | null) => {
        if (!json?.ok || !json.data) return;
        if (json.data.scope) setScopeCatalog(json.data.scope);
        if (json.data.investment) setInvestmentCatalog(json.data.investment);
      })
      .catch(() => {
        // Fallback estático já está carregado.
      });
  }, []);

  useEffect(() => {
    loadProposalCatalog();
  }, [loadProposalCatalog]);

  const anyAreaPanelOpen = Object.values(areaPanelOpen).some(Boolean);
  useEffect(() => {
    if (!anyAreaPanelOpen) return;
    loadProposalCatalog();
  }, [anyAreaPanelOpen, loadProposalCatalog]);

  useEffect(() => {
    function refreshCatalog() {
      if (document.visibilityState !== "visible") return;
      loadProposalCatalog();
    }
    window.addEventListener("focus", refreshCatalog);
    document.addEventListener("visibilitychange", refreshCatalog);
    return () => {
      window.removeEventListener("focus", refreshCatalog);
      document.removeEventListener("visibilitychange", refreshCatalog);
    };
  }, [loadProposalCatalog]);

  useEffect(() => {
    investimentoMetaRef.current = parseEscopoJsonWithMeta(initialValue).investimentoDocumento;
    if (initialValue.trim() === lastDraftSentRef.current) return;
    const parsed = syncEscopoToAreas(parseEscopoJson(initialValue), parseAreasList(areasDisplay));
    setEscopo((prev) => {
      if (escopoJsonEqual(parsed, prev)) {
        lastDraftSentRef.current = initialValue.trim();
        return prev;
      }
      return parsed;
    });
  }, [areasDisplay, initialValue]);

  useEffect(() => {
    setSavedEscopoJson(savedValue);
  }, [savedValue]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    // Debounced de propósito: cada campo salvo nesta tela grava em `field_values`,
    // e sem isso o próprio salvamento do usuário disparava um `router.refresh()`
    // imediato (re-render da página inteira) a cada campo — deixando a digitação
    // e o clique nos campos visivelmente lentos enquanto o builder está aberto.
    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (!cancelled) router.refresh();
      }, 900);
    };
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
        schedule,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "proposta_escopo_solicitacao",
          filter: `oportunidade_id=eq.${leadId}`,
        },
        schedule,
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
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
      const meta = investimentoMetaRef.current;
      const body = stringifyEscopoJsonWithMeta(normalizedNext, meta);
      const payloadEscopo =
        options?.restrictToArea
          ? {
              [normalizePracticeAreaKey(options.restrictToArea)]:
                getEscopoEntriesForArea(normalizedNext, options.restrictToArea),
            }
          : normalizedNext;
      const payloadBody = options?.restrictToArea
        ? JSON.stringify(payloadEscopo)
        : body;
      if (!options?.restrictToArea && body === savedEscopoJson) return;
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
        const confirmedJson = applyProposalScopeSave(savedEscopoJson, body, options?.restrictToArea);
        setSavedEscopoJson(confirmedJson);
        lastDraftSentRef.current = body;
        setEscopo(normalizedNext);
        collapseCompleteEditableAreas(normalizedNext);
        setLastSavedAt(
          new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        );
        // Acknowledge only what this PATCH saved; retain other local draft edits.
        onSaved?.(confirmedJson);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro ao salvar.");
        throw e;
      }
    },
    [areasDisplay, collapseCompleteEditableAreas, fieldDefinitionId, leadId, router, onSaved, savedEscopoJson],
  );

  useEffect(() => {
    const list = parseAreasList(areasDisplay);
    setEscopo((prev) => {
      const next = syncEscopoToAreas(prev, list);
      if (escopoJsonEqual(next, prev)) return prev;
      return next;
    });
  }, [areasDisplay]);

  useEffect(() => {
    if (!onEscopoDraftChange) return;
    const normalized = syncEscopoToAreas(escopo, parseAreasList(areasDisplay));
    const json = stringifyEscopoJsonWithMeta(normalized, investimentoMetaRef.current);
    if (json === lastDraftSentRef.current) return;
    lastDraftSentRef.current = json;
    onEscopoDraftChange(json);
  }, [escopo, areasDisplay, onEscopoDraftChange]);

  const isAreaDirty = useCallback((areaKey: string): boolean => {
    return isProposalScopeAreaDirty(escopo, savedEscopoJson, areaKey);
  }, [escopo, savedEscopoJson]);

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
      if (disabled || savingRef.current || !canEditEscopoArea(viewerRole, viewerProfileArea, areaKey)) return;
      savingRef.current = true;
      onSavingChange?.(true);
      const normalizedEscopo = syncEscopoToAreas(escopo, parseAreasList(areasDisplay));
      const shouldPersist = isAreaDirty(areaKey);
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
      } catch (error) {
        setError(error instanceof Error ? error.message : "Erro ao salvar a área.");
      } finally {
        savingRef.current = false;
        onSavingChange?.(false);
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
      disabled,
      onSavingChange,
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
        <p className="text-sm font-medium text-foreground">Escopo por área</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione ao menos uma área em &quot;Áreas de escopo&quot; para definir tipo e subtipo.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4 rounded-(--radius-v2-xl) border border-border bg-white p-4 sm:col-span-2", className)}>
      <div className="min-w-0">
        <p className="text-v2-heading-md text-foreground">Escopo detalhado por área</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Qualquer pessoa pode preencher ou ajustar o escopo de qualquer área. Cada área pode ter{" "}
          <span className="font-medium text-foreground">vários escopos</span> (ex.: dois processos
          distintos em Cível). Use <span className="font-medium text-foreground">Salvar esta área</span> após
          preencher — dá pra notificar as demais áreas pendentes no mesmo passo.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DocumentSaveStatus saving={Boolean(savingAreaKey)} dirty={anyAreaDirty} />
          {!savingAreaKey && !anyAreaDirty && lastSavedAt ? (
            <span className="text-v2-caption text-muted-foreground">às {lastSavedAt}</span>
          ) : null}
        </div>
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
                  <AreaIconLabel area={normalizePracticeAreaKey(area)} size="sm" nameClassName="font-extrabold text-foreground" />
                  <Badge variant="outline" className="border-slate-300 bg-white text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
                    Sem acesso
                  </Badge>
                </div>
                <p className="mt-2 text-xs">
                  Seu perfil não pode preencher nem solicitar esta área.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {responsaveis.length > 0 ? (
                    responsaveis.map((user) => (
                      <CrmUserLabel
                        key={user.id}
                        name={user.fullName}
                        avatarUrl={user.avatarUrl}
                        size="xs"
                        variant="inline"
                      />
                    ))
                  ) : (
                    <span className="text-xs text-slate-500">Nenhum gestor cadastrado</span>
                  )}
                </div>
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
              disabled={disabled || savingAreaKey !== null}
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
  defaultNomeEmpresa: string | null,
): { escopo: string } {
  const escopoParts: string[] = [];
  const areaLabel = normalizePracticeAreaKey(catalogArea);

  entries.forEach((entry) => {
    if (!entry.tipoId || !entry.subtipoId) return;
    const sub = findScopeSubtype(scopeCatalog, areaLabel, entry.tipoId, entry.subtipoId);
    if (!sub) return;
    const scopeLabelPrefix = entries.length > 1 ? `${sub.label}\n` : "";
    const text = mergeEscopoTemplate(sub.escopoTemplate, entry.placeholders ?? {}, {
      defaultNomeEmpresa,
    }).trim();
    if (text) escopoParts.push(`${scopeLabelPrefix}${text}`);
  });

  return { escopo: escopoParts.join("\n\n") || "—" };
}

function EscopoAreaDelegatedModal({
  leadId,
  area,
  catalogArea,
  entries,
  scopeCatalog,
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
  const { escopo: previewEscopo } = buildEntriesPreviewText(
    entries,
    catalogArea,
    scopeCatalog,
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
        className={SCOPE_DIALOG_CLASS}
        overlayClassName="z-(--z-tooltip)"
        onPointerDownOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
        onFocusOutside={(event) => {
          if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
        }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EscopoModalHeader areaLabel={areaLabel} request={request} statusLabel="Outra equipe" />
        <div className="crm-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
            <div className="min-w-0 flex-1 space-y-5">
            <div className="rounded-(--radius-v2-xl) border border-border bg-white p-5">
              <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">Acionamento da área</p>
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
          <div className="rounded-(--radius-v2-xl) border border-border bg-white p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">Quem notificar</p>
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
                        "flex cursor-pointer items-center gap-3 rounded-(--radius-v2-xl) border p-3 transition-colors",
                        checked
                          ? "border-success-border bg-success-bg"
                          : "border-border bg-surface-subtle hover:bg-white",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-interactive-600"
                        checked={checked}
                        onChange={() => toggleTarget(user.id)}
                      />
                      <CrmUserLabel
                        name={user.fullName}
                        avatarUrl={user.avatarUrl}
                        size="sm"
                        variant="stacked"
                        sublabel="Gestor responsável"
                      />
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
            </div>
          <div className="min-w-0 w-full">
            <PreviewGrid escopo={previewEscopo} />
          </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="min-w-0 text-xs text-muted-foreground">
            {feedback ?? "Solicite o preenchimento para registrar prazo e canais de notificação."}
          </p>
          <Button
            type="button"
            variant="primary"
            className="gap-2"
            disabled={status === "loading" || selectedTargetIds.length === 0}
            onClick={() => void solicitar()}
          >
            {status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Notificar selecionados
          </Button>
        </div>
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
  disabled,
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
  disabled: boolean;
  savingThisArea: boolean;
  notifyingThisArea: boolean;
  canNotifyOthersAfterSave: boolean;
  onSaveThisArea: () => void;
  onSaveAndNotify: () => void;
}) {
  const areaLabel = normalizePracticeAreaKey(area);
  const tipos = scopeCatalog[catalogArea] ?? [];
  const { escopo: previewEscopo } = buildEntriesPreviewText(
    entries,
    catalogArea,
    scopeCatalog,
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
          <AreaIconLabel area={areaLabel} size="md" nameClassName="text-base font-semibold text-foreground" />
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
          inert={disabled}
          // z-[130] no content + z-[120] no backdrop garantem que este sub-dialog
          // fique acima do dialog pai "Elaborar Proposta" (z-[110]/z-[100]).
          className={SCOPE_DIALOG_CLASS}
          overlayClassName="z-(--z-tooltip)"
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EscopoModalHeader
            areaLabel={areaLabel}
            request={request}
            statusLabel={complete ? "Preenchido" : areaDirty ? "Alterações não salvas" : "Em preenchimento"}
            direcionamentoHint={!complete ? direcionamentoHint : null}
          />
          <div className="crm-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5">
            <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
              <div className="min-w-0 w-full flex-1 space-y-4">
                {entries.map((entry, index) => (
                  <PropostaEscopoEntryForm
                    key={entry.id}
                    entryIndex={index}
                    entryCount={entries.length}
                    entry={entry}
                    catalogArea={catalogArea}
                    tipos={tipos}
                    defaultNomeEmpresa={defaultNomeEmpresa}
                    canRemove={entries.length > 1}
                    onPatch={(patch) => onPatchEntry(entry.id, patch)}
                    onRemove={() => onRemoveEntry(entry.id)}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 border-dashed border-interactive-300 text-interactive-700 hover:bg-interactive-50"
                  onClick={onAddEntry}
                >
                  <Plus className="size-4" aria-hidden />
                  Adicionar outro escopo nesta área
                </Button>
              </div>
              <div className="min-w-0 w-full">
                <PreviewGrid escopo={previewEscopo} />
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0 text-xs text-muted-foreground">
              {areaDirty ? "Há alterações não salvas nesta área." : "Tudo salvo nesta área até o momento."}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant={areaDirty ? "primary" : "outline"}
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
  const responsaveis = request?.responsaveis ?? EMPTY_RESPONSAVEIS;
  const permissionLabel =
    tone === "delegated"
      ? "Você pode solicitar, mas não preencher"
      : tone === "editable"
        ? "Você pode preencher esta área"
        : "Você pode revisar o preenchimento";
  const status = areaStatusLabel({ complete, dirty, request, nowMs });
  const statusTone =
    status === "Preenchido"
      ? "border-success-border bg-success-bg text-success-text"
      : status === "Atrasado"
        ? "border-danger-border bg-danger-bg text-danger-text"
        : status === "Em edição"
          ? "border-info-border bg-info-bg text-info-text"
          : "border-warning-border bg-warning-bg text-warning-text";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-(--radius-v2-xl) border p-4",
        tone === "complete" && "border-success-border bg-success-bg",
        tone === "editable" && "border-border bg-white",
        tone === "delegated" && "border-info-border bg-info-bg",
      )}
    >
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <PracticeAreaIconBadge area={areaLabel} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-extrabold tracking-[-0.02em] text-foreground">{areaLabel}</p>
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
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {complete || request?.concluidoEm ? (
                request?.gestor?.fullName ? (
                  <CrmUserLabel
                    name={request.gestor.fullName}
                    avatarUrl={request.gestor.avatarUrl}
                    prefix="Responsável"
                    size="xs"
                    variant="inline"
                  />
                ) : (
                  <span className="text-xs text-slate-500">Responsável não definido</span>
                )
              ) : responsaveis.length > 0 ? (
                <>
                  {responsaveis.slice(0, 2).map((user) => (
                    <CrmUserLabel
                      key={user.id}
                      name={user.fullName}
                      avatarUrl={user.avatarUrl}
                      size="xs"
                      variant="inline"
                    />
                  ))}
                  {responsaveis.length > 2 ? (
                    <span className="text-[11px] font-semibold text-slate-500">
                      +{responsaveis.length - 2}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-slate-500">Gestor responsável ainda não definido</span>
              )}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {request?.concluidoEm
                ? `Concluído em ${formatDateTimeBr(request.concluidoEm)}.`
                : request?.prazoAte
                  ? `Prazo até ${formatDateTimeBr(request.prazoAte)}.`
                  : request?.notificadoEm
                    ? `Solicitado em ${formatDateTimeBr(request.notificadoEm)}.`
                    : "Ainda sem prazo registrado. Solicite o escopo para acionar o gestor."}
            </p>
          </div>
        </div>
        <Button type="button" variant={complete ? "outline" : "primary"} size="sm" className="shrink-0 gap-2" onClick={onOpen}>
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
  const completedBy = request?.preenchidoPor ?? (request?.concluidoEm ? request?.gestor : null);

  return (
    <DialogHeader className="relative shrink-0 border-b border-border bg-white px-4 py-4 pr-14 text-foreground sm:px-5 sm:pr-16">
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <PracticeAreaIconBadge area={areaLabel} size="md" />
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
                Escopo por área
              </span>
              <span className="rounded-(--radius-v2-full) border border-border bg-surface-subtle px-2 py-0.5 text-v2-caption-medium text-foreground">
                {statusLabel}
              </span>
            </div>
            <DialogTitle className="text-xl font-extrabold tracking-[-0.035em] text-foreground sm:text-2xl">
              {areaLabel}
            </DialogTitle>
            <DialogDescription className="mt-1 flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-relaxed text-slate-500">
              {request?.gestor?.fullName ? (
                <CrmUserLabel
                  name={request.gestor.fullName}
                  avatarUrl={request.gestor.avatarUrl}
                  prefix="Responsável"
                  size="xs"
                  variant="inline"
                />
              ) : (
                <span>Responsável ainda não resolvido</span>
              )}
              {direcionamentoHint ? (
                <span className="font-semibold text-interactive-700">{direcionamentoHint}</span>
              ) : null}
            </DialogDescription>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-x-5 gap-y-2 border-t border-slate-200 pt-3 sm:grid-cols-3 lg:min-w-[440px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <HeaderMeta
            label="Prazo"
            value={request?.prazoAte ? formatDateTimeBr(request.prazoAte) : "Não definido"}
          />
          <HeaderMeta
            label="Preenchido por"
            value={
              completedBy?.fullName ? (
                <CrmUserLabel
                  name={completedBy.fullName}
                  avatarUrl={completedBy.avatarUrl}
                  size="xs"
                  variant="inline"
                />
              ) : request?.concluidoEm ? (
                "Usuário não registrado"
              ) : (
                "Ainda não"
              )
            }
          />
          <HeaderMeta
            label="Preenchido"
            value={request?.concluidoEm ? formatDateTimeBr(request.concluidoEm) : "Ainda não"}
          />
        </div>
      </div>
    </DialogHeader>
  );
}

function HeaderMeta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <div className="mt-1 truncate text-xs font-bold text-foreground">{value}</div>
    </div>
  );
}

function ReadOnlyPair({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-(--radius-v2-xl) border p-3", dark ? "border-white/10 bg-white/10" : "border-border bg-white")}>
      <p className={cn("text-[10px] font-black uppercase tracking-[0.14em]", dark ? "text-white/45" : "text-slate-400")}>
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-bold", dark ? "text-white" : "text-foreground")}>{value}</p>
    </div>
  );
}

function PreviewGrid({ escopo }: { escopo: string }) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white p-4 lg:sticky lg:top-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div className="min-w-0">
          <p className="text-v2-caption-medium text-text-muted-v2">Texto gerado</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Referência do conteúdo; a diagramação final aparece na prévia Word.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
          Word
        </span>
      </div>
      <div className="crm-scrollbar max-h-[min(42vh,300px)] min-w-0 overflow-auto rounded-xl border border-[#edf0f4] bg-[#fbfcfd] p-3.5 text-xs leading-relaxed text-foreground">
        {escopo.trim() ? (
          <JustifiedDocumentText text={escopo} />
        ) : (
          <p className="italic text-slate-400">O texto será exibido após selecionar tipo e subtipo.</p>
        )}
      </div>
    </aside>
  );
}
