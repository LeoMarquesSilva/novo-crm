"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  LeadsPipelineToolbar,
  type SituationFilter,
} from "@/components/crm/leads-pipeline-toolbar";
import { NewDemandForm } from "@/components/crm/new-demand-form";
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
  const [mostrarLeadsRd, setMostrarLeadsRd] = useState(true);
  const [opportunities, setOpportunities] = useState<LeadsPageOpportunity[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
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

  const refreshLeadsSilently = useCallback(async () => {
    try {
      const response = await fetch("/api/crm/leads", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        opportunities?: LeadsPageOpportunity[];
        owners?: OwnerOption[];
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        return;
      }

      setOpportunities(payload.opportunities ?? []);
      setOwnerOptions(payload.owners ?? []);
    } catch {
      // mantém lista atual em caso de falha no refresh pós-cadastro
    }

  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeads() {
      try {
        setLoading(true);
        setLoadError(null);

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

        if (!cancelled) {
          setOpportunities(payload.opportunities ?? []);
          setOwnerOptions(payload.owners ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Falha ao carregar os leads.";
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchLeads();
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Card className="glass-card-no-float flex min-h-[calc(100dvh-16.5rem)] flex-1 flex-col overflow-hidden border-primary-dark/10 py-0 lg:min-h-[calc(100dvh-14.5rem)]">
        <CardHeader className="relative shrink-0 overflow-hidden border-b border-primary-dark/10 bg-[#0b1724] px-4 py-3 text-white sm:px-5">
          <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.22),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
          <div className="relative space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex rounded-[14px] border border-white/20 bg-white/10 p-1 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => setPipelineTab("vendas")}
                className={cn(
                  "rounded-[11px] px-3 py-1.5 text-[13px] font-bold transition-colors",
                  pipelineTab === "vendas"
                    ? "bg-white text-primary-dark shadow-md"
                    : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                Vendas
                <span className="ml-1.5 tabular-nums opacity-90">({salesBoardCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setPipelineTab("pos_venda")}
                className={cn(
                  "rounded-[11px] px-3 py-1.5 text-[13px] font-bold transition-colors",
                  pipelineTab === "pos_venda"
                    ? "bg-white text-primary-dark shadow-md"
                    : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                Pós-venda
                <span className="ml-1.5 tabular-nums opacity-90">({posVendaBoardCount})</span>
              </button>
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 rounded-[14px] border border-white/20 bg-white/10 px-3 py-2 shadow-sm backdrop-blur sm:justify-end sm:py-1.5">
              <div className="min-w-0 sm:text-right">
                <Label
                  htmlFor="kanban-toggle-rd-leads"
                  className="cursor-pointer text-xs font-bold text-white"
                >
                  Leads do RD Station
                </Label>
                <p className="text-[10px] leading-snug text-slate-100/80 sm:ml-auto sm:max-w-[200px]">
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
            <CardTitle className="text-lg font-extrabold tracking-[-0.04em] text-white sm:text-xl">
              {pipelineTab === "vendas"
                ? "Pipeline de vendas (kanban)"
                : "Pipeline de pós-venda (kanban)"}
            </CardTitle>
            <p className="text-xs text-slate-100/85 sm:text-sm">
              {loading
                ? "Carregando leads do banco..."
                : pipelineTab === "vendas"
                  ? `${filteredOpportunities.length} lead(s) com os filtros atuais${mostrarLeadsRd ? "" : " (RD oculto)"}. Arraste os cards entre colunas; cada coluna rola sozinha quando houver muitos itens.`
                  : `${filteredOpportunities.length} oportunidade(s) no pós-venda${mostrarLeadsRd ? "" : " (RD oculto)"}. Etapas alinhadas ao funil RD após “Marcar venda”. Itens sincronizados do RD mostram o chip “RD Station”.`}
            </p>
            {loadError ? <p className="text-sm font-medium text-red-200">{loadError}</p> : null}
          </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-1.5 sm:p-2 md:p-3">
          <PipelineBoard
            opportunities={filteredOpportunities}
            stageColumns={activeStageColumns}
            pipelineCode={pipelineTab === "vendas" ? "vendas" : "pos_venda"}
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
        </CardContent>
      </Card>
      </motion.div>

      {mounted && isCadastroOpen
        ? createPortal(
            <div className="font-new-lead-modal fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(7,12,20,0.72)] p-3 backdrop-blur-md sm:p-5">
              <div className="flex max-h-[90vh] w-full max-w-[min(100vw-1.5rem,1280px)] flex-col">
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
