"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  LeadsPipelineToolbar,
  type SituationFilter,
} from "@/components/crm/leads-pipeline-toolbar";
import { NewDemandForm } from "@/components/crm/new-demand-form";
import { PipelineBoardSkeleton } from "@/components/crm/pipeline-board-skeleton";
import {
  PipelineKanbanErrorState,
  PipelineKanbanRefreshIndicator,
} from "@/components/crm/pipeline-kanban-status";
import {
  CrmSurfaceHeaderBackdrop,
  crmSurfaceCardClass,
  crmSurfaceHeaderClass,
  crmSurfaceHeaderPanelClass,
  crmSurfaceHeaderSubtitleClass,
  crmSurfaceHeaderTitleClass,
  crmSurfaceSegmentedRootClass,
  crmSurfaceSegmentedTabClass,
} from "@/components/crm/crm-surface-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  POS_VENDA_PIPELINE_COLUMNS,
  SALES_PIPELINE_COLUMNS,
  isPosVendaPipelineStage,
  isSalesPipelineStage,
} from "@/lib/crm/pipeline-board-config";
import { cn } from "@/lib/utils";
import { getLeadPipelineSituation } from "@/modules/crm/application/lead-pipeline-situation";
import type { Oportunidade } from "@/modules/crm/domain/entities";
import { createSupabaseClient } from "@/lib/supabase/client";
import { usePipelineContractSignersSync } from "@/lib/crm/use-pipeline-contract-signers-sync";

type LeadsPageOpportunity = Oportunidade;

type PipelineTab = "vendas" | "pos_venda";

interface OwnerOption {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

const PipelineBoard = dynamic(
  () => import("@/components/crm/pipeline-board").then((mod) => mod.PipelineBoard),
  { ssr: false },
);

const LEAD_SEARCH_MIN_CHARS = 3;

const KANBAN_PREFS_STORAGE_KEY = "crm.kanban.prefs.v1";

type KanbanPrefs = {
  mostrarLeadsRd: boolean;
};

/** Padrão: leads RD ocultos no kanban até o utilizador ligar o toggle. */
function readKanbanPrefs(): KanbanPrefs {
  if (typeof window === "undefined") return { mostrarLeadsRd: false };
  try {
    const raw = window.localStorage.getItem(KANBAN_PREFS_STORAGE_KEY);
    if (!raw) return { mostrarLeadsRd: false };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return { mostrarLeadsRd: false };
    const p = parsed as Record<string, unknown>;
    return { mostrarLeadsRd: p.mostrarLeadsRd === true };
  } catch {
    return { mostrarLeadsRd: false };
  }
}

function leadSearchBlob(o: Oportunidade): string {
  return [
    o.id,
    o.tipo,
    o.solicitante,
    o.solicitanteRd ?? "",
    o.solicitanteUsuarioNome ?? "",
    o.ownerUserName ?? "",
    o.rdOwnerEmail ?? "",
    o.clienteId ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function matchesOwnerAndSituation(
  o: Oportunidade,
  ownerFilter: string,
  situation: SituationFilter,
): boolean {
  if (ownerFilter !== "todos" && o.ownerUserId !== ownerFilter) return false;
  const sit = getLeadPipelineSituation(o);
  if (situation !== "todos") {
    if (situation === "em_andamento" && sit !== "em_andamento") return false;
    if (situation === "vendidas" && sit !== "vendidas") return false;
    if (situation === "perdidas" && sit !== "perdidas") return false;
  }
  return true;
}

function matchesPipelineTab(o: Oportunidade, tab: PipelineTab): boolean {
  if (tab === "vendas") return isSalesPipelineStage(o.etapa);
  return isPosVendaPipelineStage(o.etapa);
}

/** Com `mostrarRd` falso, oportunidades com reconciliação RD ficam fora do quadro. */
function matchesRdVisibility(o: Oportunidade, mostrarRd: boolean): boolean {
  if (mostrarRd) return true;
  return o.origemRd !== true;
}

function leadMatchesPipelineFilters(
  o: Oportunidade,
  ownerFilter: string,
  situation: SituationFilter,
  tab: PipelineTab,
  mostrarLeadsRd: boolean,
): boolean {
  if (!matchesRdVisibility(o, mostrarLeadsRd)) return false;
  if (!matchesPipelineTab(o, tab)) return false;
  return matchesOwnerAndSituation(o, ownerFilter, situation);
}

export default function LeadsPage() {
  const router = useRouter();
  const [isCadastroOpen, setIsCadastroOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pinnedLeadId, setPinnedLeadId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("todos");
  const [situation, setSituation] = useState<SituationFilter>("todos");
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("vendas");
  const [mostrarLeadsRd, setMostrarLeadsRd] = useState(false);
  const [opportunities, setOpportunities] = useState<LeadsPageOpportunity[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const justRefreshedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [kanbanPrefsHydrated, setKanbanPrefsHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prefs = readKanbanPrefs();
    setMostrarLeadsRd(prefs.mostrarLeadsRd);
    setKanbanPrefsHydrated(true);
  }, []);

  useEffect(() => {
    setPinnedLeadId(null);
  }, [pipelineTab]);

  useEffect(() => {
    if (mostrarLeadsRd || !pinnedLeadId) return;
    const pinned = opportunities.find((o) => o.id === pinnedLeadId);
    if (pinned?.origemRd) {
      setPinnedLeadId(null);
    }
  }, [mostrarLeadsRd, pinnedLeadId, opportunities]);

  useEffect(() => {
    if (!kanbanPrefsHydrated) return;
    window.localStorage.setItem(
      KANBAN_PREFS_STORAGE_KEY,
      JSON.stringify({ mostrarLeadsRd } satisfies KanbanPrefs),
    );
  }, [mostrarLeadsRd, kanbanPrefsHydrated]);

  useEffect(() => {
    return () => {
      if (justRefreshedTimeoutRef.current) {
        clearTimeout(justRefreshedTimeoutRef.current);
      }
    };
  }, []);

  const markRefreshSuccess = useCallback((silent: boolean) => {
    setLastRefreshedAt(new Date());
    if (silent) {
      setJustRefreshed(true);
      if (justRefreshedTimeoutRef.current) {
        clearTimeout(justRefreshedTimeoutRef.current);
      }
      justRefreshedTimeoutRef.current = setTimeout(() => {
        justRefreshedTimeoutRef.current = null;
        setJustRefreshed(false);
      }, 3000);
    }
  }, []);

  const loadLeads = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (silent) {
      setSilentRefreshing(true);
    } else {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const response = await fetch("/api/crm/leads", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        opportunities?: LeadsPageOpportunity[];
        owners?: OwnerOption[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Não foi possível carregar os leads.");
      }

      setOpportunities(payload.opportunities ?? []);
      setOwnerOptions(payload.owners ?? []);
      setLoadError(null);
      markRefreshSuccess(silent);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar os leads.";
      if (!silent) {
        setLoadError(message);
      }
    } finally {
      if (silent) {
        setSilentRefreshing(false);
      } else {
        setLoading(false);
        setRetrying(false);
      }
    }
  }, [markRefreshSuccess]);

  const refreshLeadsSilently = useCallback(async () => {
    await loadLeads({ silent: true });
  }, [loadLeads]);

  const handleRetryLoad = useCallback(() => {
    setRetrying(true);
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void refreshLeadsSilently();
      }, 200);
    };

    const channel = supabase
      .channel("crm-pipeline-oportunidades")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "oportunidades" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "due_area_tasks" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "due_area_review_tasks" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contract_review_tasks" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "d4sign_documents" },
        scheduleRefresh,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[crm/leads] Realtime oportunidades:", err?.message ?? err);
        }
      });

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [refreshLeadsSilently]);

  usePipelineContractSignersSync(opportunities, refreshLeadsSilently);

  const salesBoardCount = useMemo(
    () =>
      opportunities.filter((o) =>
        leadMatchesPipelineFilters(o, ownerFilter, situation, "vendas", mostrarLeadsRd),
      ).length,
    [opportunities, ownerFilter, situation, mostrarLeadsRd],
  );

  const posVendaBoardCount = useMemo(
    () =>
      opportunities.filter((o) =>
        leadMatchesPipelineFilters(o, ownerFilter, situation, "pos_venda", mostrarLeadsRd),
      ).length,
    [opportunities, ownerFilter, situation, mostrarLeadsRd],
  );

  const appUsersByEmail = useMemo(() => {
    const map: Record<string, { avatarUrl: string | null; fullName: string }> = {};
    for (const owner of ownerOptions) {
      const email = owner.email?.trim().toLowerCase();
      if (email) {
        map[email] = { avatarUrl: owner.avatarUrl, fullName: owner.name };
      }
    }
    return map;
  }, [ownerOptions]);

  const filteredOpportunities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return opportunities.filter((o) => {
      if (!leadMatchesPipelineFilters(o, ownerFilter, situation, pipelineTab, mostrarLeadsRd))
        return false;

      if (pinnedLeadId) {
        return o.id === pinnedLeadId;
      }

      if (q) {
        if (!leadSearchBlob(o).includes(q)) return false;
      }
      return true;
    });
  }, [
    search,
    ownerFilter,
    situation,
    pipelineTab,
    opportunities,
    pinnedLeadId,
    mostrarLeadsRd,
  ]);

  const leadSearchSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < LEAD_SEARCH_MIN_CHARS) return [];
    return opportunities
      .filter(
        (o) =>
          leadMatchesPipelineFilters(o, ownerFilter, situation, pipelineTab, mostrarLeadsRd) &&
          leadSearchBlob(o).includes(q),
      )
      .slice(0, 12);
  }, [search, opportunities, ownerFilter, situation, pipelineTab, mostrarLeadsRd]);

  const activeStageColumns = useMemo(
    () => (pipelineTab === "vendas" ? SALES_PIPELINE_COLUMNS : POS_VENDA_PIPELINE_COLUMNS),
    [pipelineTab],
  );

  const handleToolbarSearchChange = useCallback((value: string) => {
    setPinnedLeadId(null);
    setSearch(value);
  }, []);

  const handlePickSearchSuggestion = useCallback((lead: Oportunidade) => {
    setPinnedLeadId(lead.id);
    setSearch(lead.solicitante.trim() || lead.id);
    if (isPosVendaPipelineStage(lead.etapa)) {
      setPipelineTab("pos_venda");
    } else if (isSalesPipelineStage(lead.etapa)) {
      setPipelineTab("vendas");
    }
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col gap-3 lg:gap-4">
      <LeadsPipelineToolbar
        search={search}
        onSearchChange={handleToolbarSearchChange}
        searchSuggestions={leadSearchSuggestions}
        searchMinChars={LEAD_SEARCH_MIN_CHARS}
        onPickSearchSuggestion={handlePickSearchSuggestion}
        ownerFilter={ownerFilter}
        onOwnerFilterChange={setOwnerFilter}
        owners={ownerOptions}
        situation={situation}
        onSituationChange={setSituation}
        onNovoCadastro={() => setIsCadastroOpen(true)}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="min-h-0 flex-1"
      >
      <Card
        className={cn(
          crmSurfaceCardClass,
          "flex min-h-[calc(100dvh-16.5rem)] flex-1 flex-col overflow-hidden py-0 lg:min-h-[calc(100dvh-14.5rem)]",
        )}
      >
        <CardHeader className={cn(crmSurfaceHeaderClass, "shrink-0 px-4 py-3.5 pl-5 sm:px-5 sm:pl-6")}>
          <CrmSurfaceHeaderBackdrop />
          <div className="relative space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className={crmSurfaceSegmentedRootClass}>
              <button
                type="button"
                onClick={() => setPipelineTab("vendas")}
                className={crmSurfaceSegmentedTabClass(pipelineTab === "vendas")}
              >
                Vendas
                <span className="ml-1.5 tabular-nums opacity-80">({salesBoardCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setPipelineTab("pos_venda")}
                className={crmSurfaceSegmentedTabClass(pipelineTab === "pos_venda")}
              >
                Pós-venda
                <span className="ml-1.5 tabular-nums opacity-80">({posVendaBoardCount})</span>
              </button>
            </div>
            <div
              className={cn(
                crmSurfaceHeaderPanelClass,
                "flex shrink-0 items-center justify-between gap-3 sm:justify-end sm:py-1.5",
              )}
            >
              <div className="min-w-0 sm:text-right">
                <Label
                  htmlFor="kanban-toggle-rd-leads"
                  className="cursor-pointer text-xs font-bold text-[#102033]"
                >
                  Leads do RD Station
                </Label>
                <p
                  className={cn(
                    "text-[10px] leading-snug sm:ml-auto sm:max-w-[200px]",
                    crmSurfaceHeaderSubtitleClass,
                  )}
                >
                  {mostrarLeadsRd
                    ? "Negociações com sincronização RD aparecem no quadro."
                    : "Ocultas do kanban; demais leads inalterados."}
                </p>
              </div>
              <Switch
                id="kanban-toggle-rd-leads"
                checked={mostrarLeadsRd}
                onCheckedChange={setMostrarLeadsRd}
                aria-label={
                  mostrarLeadsRd
                    ? "Desligar exibição de leads do RD Station no kanban"
                    : "Ligar exibição de leads do RD Station no kanban"
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <CardTitle className={cn("text-lg sm:text-xl", crmSurfaceHeaderTitleClass)}>
              {pipelineTab === "vendas"
                ? "Pipeline de vendas (kanban)"
                : "Pipeline de pós-venda (kanban)"}
            </CardTitle>
            <p
              className={cn(
                "flex flex-wrap items-center gap-2 text-xs sm:text-sm",
                crmSurfaceHeaderSubtitleClass,
              )}
            >
              <span>
                {loading
                  ? "Carregando leads do banco..."
                  : pipelineTab === "vendas"
                    ? `${filteredOpportunities.length} lead(s) com os filtros atuais${mostrarLeadsRd ? "" : " (RD oculto)"}. Arraste os cards entre colunas; cada coluna rola sozinha quando houver muitos itens.`
                    : `${filteredOpportunities.length} oportunidade(s) no pós-venda${mostrarLeadsRd ? "" : " (RD oculto)"}. Etapas alinhadas ao funil RD após “Marcar venda”. Itens sincronizados do RD mostram o chip “RD Station”.`}
              </span>
              {!loading && lastRefreshedAt ? (
                <PipelineKanbanRefreshIndicator
                  lastRefreshedAt={lastRefreshedAt}
                  justRefreshed={justRefreshed}
                  silentRefreshing={silentRefreshing}
                />
              ) : null}
            </p>
            {loadError && opportunities.length > 0 ? (
              <p className="text-sm font-medium text-red-600">{loadError}</p>
            ) : null}
          </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-1.5 sm:p-2 md:p-3">
          {loading ? (
            <PipelineBoardSkeleton columns={activeStageColumns} />
          ) : loadError && opportunities.length === 0 ? (
            <PipelineKanbanErrorState
              message={loadError}
              onRetry={handleRetryLoad}
              retrying={retrying}
            />
          ) : (
            <PipelineBoard
              opportunities={filteredOpportunities}
              stageColumns={activeStageColumns}
              pipelineCode={pipelineTab === "vendas" ? "vendas" : "pos_venda"}
              appUsersByEmail={appUsersByEmail}
              onDataChange={() => void refreshLeadsSilently()}
              onAfterTransition={({ from, to, opportunityId }) => {
                if (from === "reuniao" && to === "confeccao_proposta") {
                  router.push(`/crm/leads/${opportunityId}`);
                }
                if (to === "confeccao_contrato") {
                  router.push(`/crm/leads/${opportunityId}`);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
      </motion.div>

      {mounted && isCadastroOpen
        ? createPortal(
            <div
              className="font-new-lead-modal fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,12,20,0.72)] p-3 backdrop-blur-md sm:p-5"
              role="dialog"
              aria-modal="true"
              aria-label="Cadastro de novo lead"
              onClick={() => setIsCadastroOpen(false)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-[min(100vw-1.5rem,1280px)] flex-col"
                onClick={(event) => event.stopPropagation()}
              >
                <NewDemandForm
                  onRequestClose={() => setIsCadastroOpen(false)}
                  onSuccess={() => {
                    setIsCadastroOpen(false);
                    void refreshLeadsSilently();
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
