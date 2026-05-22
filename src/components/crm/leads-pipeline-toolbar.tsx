"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, SlidersHorizontal, UserPlus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CrmSurfaceHeaderIcon,
  crmSurfaceCardClass,
  crmSurfaceHeaderClass,
  crmSurfaceHeaderTitleClass,
  crmSurfaceSegmentedRootClass,
} from "@/components/crm/crm-surface-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DaysInStagePanel } from "@/components/crm/days-in-stage-panel";
import { cn } from "@/lib/utils";
import {
  getLeadPipelineSituation,
  type LeadPipelineSituation,
} from "@/modules/crm/application/lead-pipeline-situation";
import type { DemandType, Oportunidade } from "@/modules/crm/domain/entities";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function OwnerAvatar({
  name,
  avatarUrl,
  className,
}: {
  name: string;
  avatarUrl: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0 border border-zinc-200 bg-zinc-50", className)}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className="bg-emerald-50 text-[10px] font-medium text-emerald-800">
        {initialsFromName(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export type SituationFilter = "todos" | LeadPipelineSituation;

const tipoLeadLabel: Record<DemandType, string> = {
  novo_lead: "Novo lead",
  novo_contrato: "Novo contrato",
  aditivo: "Aditivo",
};

const LEAD_SEARCH_SITUATION_BADGE: Record<LeadPipelineSituation, string> = {
  em_andamento:
    "border-emerald-200/90 bg-emerald-50 text-emerald-800",
  vendidas: "border-teal-200/90 bg-teal-50 text-teal-800",
  perdidas: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

function LeadSearchSituationBadge({ situ }: { situ: LeadPipelineSituation }) {
  const label =
    situ === "vendidas" ? "Vendida" : situ === "perdidas" ? "Perdida" : "Em andamento";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        LEAD_SEARCH_SITUATION_BADGE[situ],
      )}
      title={label}
    >
      {label}
    </span>
  );
}

function leadSearchOptionClassName(isActive: boolean) {
  return cn(
    "lead-search-option flex w-full flex-col gap-1.5 border-b border-zinc-100 px-3 py-2.5 text-left text-sm transition-colors last:border-b-0",
    "outline-none [-webkit-tap-highlight-color:transparent] [accent-color:var(--accent-teal)]",
    "hover:bg-emerald-50",
    "focus:outline-none focus:bg-emerald-50 focus:shadow-[inset_0_0_0_2px_rgba(15,159,143,0.35)]",
    "focus-visible:outline-none focus-visible:bg-emerald-50 focus-visible:shadow-[inset_0_0_0_2px_rgba(15,159,143,0.35)]",
    "active:bg-emerald-100",
    isActive && "bg-emerald-50 shadow-[inset_0_0_0_2px_rgba(15,159,143,0.35)]",
  );
}

function situationFilterTabClass(active: boolean) {
  return cn(
    "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150",
    active
      ? "bg-accent-teal text-white shadow-sm"
      : "text-zinc-600 hover:bg-white hover:text-zinc-900",
  );
}

const situationOptions: { value: SituationFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "vendidas", label: "Vendidas" },
  { value: "perdidas", label: "Perdidas" },
];

interface LeadsPipelineToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  /** Leads que correspondem ao texto atual (mín. `searchMinChars`), já filtrados pelo pipeline na página. */
  searchSuggestions: Oportunidade[];
  searchMinChars: number;
  onPickSearchSuggestion: (lead: Oportunidade) => void;
  ownerFilter: string;
  onOwnerFilterChange: (value: string) => void;
  owners: Array<{ id: string; name: string; email: string; avatarUrl: string | null }>;
  situation: SituationFilter;
  onSituationChange: (value: SituationFilter) => void;
  onNovoCadastro: () => void;
  /** Lead escolhido na busca — mantém destaque verde no painel. */
  pinnedLeadId?: string | null;
}

export function LeadsPipelineToolbar({
  search,
  onSearchChange,
  searchSuggestions,
  searchMinChars,
  onPickSearchSuggestion,
  ownerFilter,
  onOwnerFilterChange,
  owners,
  situation,
  onSituationChange,
  onNovoCadastro,
  pinnedLeadId = null,
}: LeadsPipelineToolbarProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [hoveredLeadId, setHoveredLeadId] = useState<string | null>(null);
  const searchAnchorRef = useRef<HTMLDivElement | null>(null);
  const suggestionsPanelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestionsPanelStyle, setSuggestionsPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selectedOwner =
    ownerFilter !== "todos" ? owners.find((o) => o.id === ownerFilter) ?? null : null;

  const cancelCloseSuggestions = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleCloseSuggestions = useCallback(() => {
    cancelCloseSuggestions();
    closeTimer.current = setTimeout(() => {
      setSuggestionsOpen(false);
      closeTimer.current = null;
    }, 150);
  }, [cancelCloseSuggestions]);

  useEffect(() => {
    return () => cancelCloseSuggestions();
  }, [cancelCloseSuggestions]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSuggestionsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suggestionsOpen]);

  const qTrim = search.trim();
  const showSuggestionPanel =
    suggestionsOpen && qTrim.length >= searchMinChars;

  const updateSuggestionsPosition = useCallback(() => {
    const el = searchAnchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.max(rect.width, 320);
    const left = Math.min(rect.left, window.innerWidth - width - 12);
    setSuggestionsPanelStyle({ top: rect.bottom + 6, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!showSuggestionPanel) {
      setSuggestionsPanelStyle(null);
      return;
    }
    updateSuggestionsPosition();
    const onReflow = () => updateSuggestionsPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [showSuggestionPanel, updateSuggestionsPosition, searchSuggestions.length]);

  const handlePick = (lead: Oportunidade) => {
    cancelCloseSuggestions();
    setSuggestionsOpen(false);
    onPickSearchSuggestion(lead);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="relative z-20"
    >
    <Card className={cn(crmSurfaceCardClass, "shrink-0")}>
      <CardHeader className={cn(crmSurfaceHeaderClass, "rounded-t-xl px-4 py-3")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <CrmSurfaceHeaderIcon>
              <SlidersHorizontal className="size-3.5" strokeWidth={2} aria-hidden />
            </CrmSurfaceHeaderIcon>
            <CardTitle className={crmSurfaceHeaderTitleClass}>Filtros</CardTitle>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={onNovoCadastro}
            className="h-9 shrink-0 gap-1.5 px-4 sm:min-w-[140px]"
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Novo cadastro
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_minmax(200px,240px)] xl:grid-cols-[minmax(320px,1fr)_minmax(200px,240px)_minmax(250px,auto)]">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="lead-search" className="text-xs font-medium text-zinc-600">
                Buscar lead
              </Label>
              <span className="hidden text-[11px] text-zinc-400 sm:inline">
                mín. {searchMinChars} letras
              </span>
            </div>
            <div ref={searchAnchorRef} className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                id="lead-search"
                role="combobox"
                aria-expanded={showSuggestionPanel}
                aria-autocomplete="list"
                aria-controls="lead-search-suggestions"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onFocus={() => {
                  cancelCloseSuggestions();
                  setSuggestionsOpen(true);
                }}
                onBlur={scheduleCloseSuggestions}
                placeholder="Nome, tipo ou solicitante…"
                autoComplete="off"
                className="h-10 rounded-lg border-zinc-200 bg-white pl-10 text-sm shadow-sm focus-visible:border-accent-teal/45 focus-visible:ring-accent-teal/30"
              />
              {showSuggestionPanel &&
              suggestionsPanelStyle &&
              typeof document !== "undefined"
                ? createPortal(
                    <div
                      ref={suggestionsPanelRef}
                      id="lead-search-suggestions"
                      role="listbox"
                      aria-label="Leads encontrados"
                      className="lead-search-suggestions crm-scrollbar fixed z-[100] max-h-[min(24rem,70dvh)] overflow-y-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg"
                      style={{
                        top: suggestionsPanelStyle.top,
                        left: suggestionsPanelStyle.left,
                        width: suggestionsPanelStyle.width,
                      }}
                      onMouseEnter={cancelCloseSuggestions}
                    >
                      {searchSuggestions.length === 0 ? (
                        <p className="px-3 py-2.5 text-sm text-zinc-500">
                          Nenhum lead com os filtros atuais.
                        </p>
                      ) : (
                        searchSuggestions.map((lead) => {
                          const situ = getLeadPipelineSituation(lead);
                          const nomeNegociacao = lead.solicitante.trim() || "—";
                          const usuarioNome = lead.solicitanteUsuarioNome?.trim() ?? "";
                          const temUsuarioSolicitante = usuarioNome.length > 0;
                          const avatarSolicitante = lead.solicitanteUsuarioAvatarUrl ?? null;
                          const rdNome = lead.solicitanteRd?.trim();

                          const isActive =
                            hoveredLeadId === lead.id || pinnedLeadId === lead.id;

                          return (
                            <button
                              key={lead.id}
                              type="button"
                              role="option"
                              aria-selected={pinnedLeadId === lead.id}
                              className={leadSearchOptionClassName(isActive)}
                              onMouseEnter={() => setHoveredLeadId(lead.id)}
                              onMouseLeave={() =>
                                setHoveredLeadId((prev) => (prev === lead.id ? null : prev))
                              }
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handlePick(lead)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-semibold text-zinc-900">
                                      {nomeNegociacao}
                                    </span>
                                    <LeadSearchSituationBadge situ={situ} />
                                  </div>
                                  {temUsuarioSolicitante ? (
                                    <div className="mt-1.5 flex items-center gap-2">
                                      <OwnerAvatar
                                        name={usuarioNome}
                                        avatarUrl={avatarSolicitante}
                                        className="h-7 w-7"
                                      />
                                      <div className="min-w-0">
                                        <p className="truncate text-xs text-zinc-600">
                                          {usuarioNome}
                                        </p>
                                      </div>
                                    </div>
                                  ) : null}
                                  <p className="mt-0.5 text-xs text-zinc-500">
                                    {tipoLeadLabel[lead.tipo]}
                                    {rdNome &&
                                    rdNome.toLowerCase() !== nomeNegociacao.toLowerCase()
                                      ? ` · ${rdNome}`
                                      : ""}
                                  </p>
                                </div>
                                {situ === "em_andamento" ? (
                                  <span
                                    className="shrink-0 self-start pt-0.5"
                                    onClick={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                  >
                                    <DaysInStagePanel
                                      item={lead}
                                      compact
                                      className="focus-visible:border-accent-teal/40 focus-visible:ring-accent-teal/25"
                                    />
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>,
                    document.body,
                  )
                : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-owner" className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-light">
              Responsável (usuário)
            </Label>
            <Select value={ownerFilter} onValueChange={(v) => onOwnerFilterChange(v ?? "todos")}>
              <SelectTrigger
                id="lead-owner"
                size="default"
                className="h-10 w-full min-w-0 rounded-[13px] border border-primary-dark/10 bg-white px-3 text-sm font-medium text-primary-dark shadow-[0_1px_2px_rgba(16,31,46,0.03)] data-placeholder:text-primary-dark"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  {ownerFilter === "todos" || !selectedOwner ? (
                    <>
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-dark/10 text-primary-dark"
                        aria-hidden
                      >
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <span className="truncate">Todos os usuários</span>
                    </>
                  ) : (
                    <>
                      <OwnerAvatar
                        name={selectedOwner.name}
                        avatarUrl={selectedOwner.avatarUrl}
                      />
                      <span className="truncate">{selectedOwner.name}</span>
                    </>
                  )}
                </span>
              </SelectTrigger>
              <CrmSelectContent className="max-h-[min(320px,70dvh)]">
                <CrmSelectItem value="todos">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-dark/10 text-primary-dark">
                      <Users className="h-4 w-4" />
                    </span>
                    <span>Todos os usuários</span>
                  </span>
                </CrmSelectItem>
                {owners.map((owner) => (
                  <CrmSelectItem key={owner.id} value={owner.id}>
                    <span className="flex items-center gap-2.5">
                      <OwnerAvatar
                        name={owner.name}
                        avatarUrl={owner.avatarUrl}
                        className="h-7 w-7"
                      />
                      <span className="truncate">{owner.name}</span>
                    </span>
                  </CrmSelectItem>
                ))}
              </CrmSelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:col-span-2 xl:col-span-1">
            <p className="text-xs font-medium text-zinc-600">Situação</p>
            <div className={cn(crmSurfaceSegmentedRootClass, "flex flex-wrap gap-0.5")}>
              {situationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={situation === opt.value}
                  onClick={() => onSituationChange(opt.value)}
                  className={situationFilterTabClass(situation === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </motion.div>
  );
}
