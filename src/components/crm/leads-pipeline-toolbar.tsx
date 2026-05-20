"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, UserPlus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
    <Avatar className={cn("h-8 w-8 shrink-0 border border-white/50 shadow-sm", className)}>
      {avatarUrl ? (
        <AvatarImage src={avatarUrl} alt="" className="object-cover" />
      ) : null}
      <AvatarFallback className="text-[10px]">{initialsFromName(name)}</AvatarFallback>
    </Avatar>
  );
}

export type SituationFilter = "todos" | LeadPipelineSituation;

const tipoLeadLabel: Record<DemandType, string> = {
  novo_lead: "Novo lead",
  novo_contrato: "Novo contrato",
  aditivo: "Aditivo",
};

function LeadSearchSituationBadge({ situ }: { situ: LeadPipelineSituation }) {
  if (situ === "vendidas") {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-emerald-600/35 bg-emerald-500/18 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950 dark:border-emerald-400/35 dark:bg-emerald-500/20 dark:text-emerald-100"
        title="Vendida"
      >
        Vendida
      </span>
    );
  }
  if (situ === "perdidas") {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-full border border-rose-400/45 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-950 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-100"
        title="Perdida"
      >
        Perdida
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border border-sky-500/40 bg-sky-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-950 dark:border-sky-400/35 dark:bg-sky-500/20 dark:text-sky-100"
      title="Em andamento"
    >
      Em andamento
    </span>
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
}: LeadsPipelineToolbarProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    >
    <Card className="glass-card-no-float shrink-0 overflow-visible rounded-[18px] border-primary-dark/10 bg-white p-0">
      <CardHeader className="relative overflow-hidden rounded-t-[18px] border-b border-primary-dark/10 bg-[#0b1724] px-4 py-3 text-white">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] border border-white/25 bg-white/15 text-white shadow-lg shadow-black/20 backdrop-blur">
              <SlidersHorizontal className="size-4" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="inline-flex rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                Controle do kanban
              </p>
              <CardTitle className="mt-1 text-lg font-extrabold tracking-[-0.04em] text-white">
                Filtros do pipeline
              </CardTitle>
              <p className="mt-0.5 text-xs text-slate-100/85">
                Encontre leads, ajuste responsáveis e refine a situação em segundos.
              </p>
            </div>
          </div>
          <Button
            variant="hero"
            size="lg"
            onClick={onNovoCadastro}
            className="h-10 shrink-0 gap-2 px-5 text-sm font-bold sm:min-w-[176px]"
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
              <Label htmlFor="lead-search" className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-light">
                Buscar lead
              </Label>
              <span className="hidden text-[11px] text-slate-400 sm:inline">
                mínimo {searchMinChars} letras
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                placeholder="Nome da oportunidade, tipo ou solicitante…"
                autoComplete="off"
                className="h-10 rounded-[13px] border-primary-dark/10 bg-white pl-10 text-sm shadow-[0_1px_2px_rgba(16,31,46,0.03)]"
              />
              {showSuggestionPanel ? (
                <div
                  id="lead-search-suggestions"
                  role="listbox"
                  aria-label="Leads encontrados"
                  className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(24rem,70dvh)] overflow-y-auto rounded-[16px] border border-primary-dark/10 bg-white py-1 shadow-[0_22px_60px_rgba(49,70,96,0.16)] dark:border-white/15 dark:bg-primary-dark/95"
                  onMouseEnter={cancelCloseSuggestions}
                >
                  {searchSuggestions.length === 0 ? (
                    <p className="px-3 py-2.5 text-sm text-muted-foreground">
                      Nenhum lead encontrado com os filtros atuais.
                    </p>
                  ) : (
                    searchSuggestions.map((lead) => {
                      const situ = getLeadPipelineSituation(lead);
                      const nomeNegociacao = lead.solicitante.trim() || "—";
                      const usuarioNome = lead.solicitanteUsuarioNome?.trim() ?? "";
                      const temUsuarioSolicitante = usuarioNome.length > 0;
                      const avatarSolicitante = lead.solicitanteUsuarioAvatarUrl ?? null;
                      const rdNome = lead.solicitanteRd?.trim();

                      return (
                        <button
                          key={lead.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="flex w-full flex-col gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary-dark/5 dark:hover:bg-white/10"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handlePick(lead)}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-base font-bold leading-snug text-primary-dark dark:text-white">
                                  {nomeNegociacao}
                                </span>
                                <LeadSearchSituationBadge situ={situ} />
                              </div>
                              {temUsuarioSolicitante ? (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <Avatar className="h-8 w-8 shrink-0 border border-white/55 shadow-sm dark:border-white/20">
                                    {avatarSolicitante ? (
                                      <AvatarImage
                                        src={avatarSolicitante}
                                        alt=""
                                        className="object-cover"
                                      />
                                    ) : null}
                                    <AvatarFallback className="text-[10px]">
                                      {initialsFromName(usuarioNome)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Solicitante
                                    </p>
                                    <p className="truncate text-sm font-medium text-primary-dark/90 dark:text-white/90">
                                      {usuarioNome}
                                    </p>
                                  </div>
                                </div>
                              ) : null}
                              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                                {tipoLeadLabel[lead.tipo]}
                                {rdNome && rdNome.toLowerCase() !== nomeNegociacao.toLowerCase()
                                  ? ` · RD: ${rdNome}`
                                  : ""}
                              </p>
                            </div>
                            {situ === "em_andamento" ? (
                              <span
                                className="shrink-0 self-start pt-0.5"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <DaysInStagePanel item={lead} compact />
                              </span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
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
              <SelectContent className="max-h-[min(320px,70dvh)]">
                <SelectItem value="todos">
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-dark/10 text-primary-dark">
                      <Users className="h-4 w-4" />
                    </span>
                    <span>Todos os usuários</span>
                  </span>
                </SelectItem>
                {owners.map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    <span className="flex items-center gap-2.5">
                      <OwnerAvatar
                        name={owner.name}
                        avatarUrl={owner.avatarUrl}
                        className="h-7 w-7"
                      />
                      <span className="truncate">{owner.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 lg:col-span-2 xl:col-span-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary-light">
              Situação
            </p>
            <div className="flex flex-wrap gap-1.5 rounded-[13px] border border-primary-dark/10 bg-[#f8f9fb] p-1">
            {situationOptions.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                variant={situation === opt.value ? "default" : "outline"}
                size="sm"
                onClick={() => onSituationChange(opt.value)}
                className={cn(
                  "h-8 rounded-[10px] border-transparent px-2.5 text-xs font-semibold shadow-none",
                  situation === opt.value
                    ? "bg-primary-dark text-white"
                    : "bg-transparent text-slate-600 hover:bg-white hover:text-primary-dark"
                )}
              >
                {opt.label}
              </Button>
            ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </motion.div>
  );
}
