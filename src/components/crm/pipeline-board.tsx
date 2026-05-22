"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PipelineLeadCardContent } from "@/components/crm/pipeline-lead-card-content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateInputBr } from "@/components/ui/date-input-br";
import { TimeInputBr } from "@/components/ui/time-input-br";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DynamicField,
  evaluateCondition,
  type FieldCondition,
  type FieldDefinition,
} from "@/components/crm/dynamic-form";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import {
  isCpNomeFocalSingleTokenOnly,
  listBlockingCustomFields,
  type PipelineCode,
} from "@/lib/crm/compute-transition-requirements";
import type { PipelineBoardColumn } from "@/lib/crm/pipeline-board-config";
import { OPPORTUNITY_STAGE_LABELS } from "@/lib/crm/stage-labels";
import { getLeadPipelineSituation } from "@/modules/crm/application/lead-pipeline-situation";
import { isRdKanbanViewOnlyLead, RD_KANBAN_VIEW_ONLY_MESSAGE } from "@/lib/crm/rd-kanban-view";
import { canMoveToStage } from "@/modules/crm/domain/workflow";
import { Oportunidade, OpportunityStage } from "@/modules/crm/domain/entities";
import { cn } from "@/lib/utils";
import type { SignerAppUserLookup } from "@/lib/crm/signer-avatar-catalog";
import {
  buildCpQualificacaoText,
  ConfeccaoReuniaoModalSection,
  parsePropostaEmpresasJson,
  type EmpresaIntakeRow,
} from "@/components/crm/confeccao-reuniao-modal-section";
import { PROPOSTA_TIPOS_CATALOG, type PropostaAreaKey } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { areaHasEscopoTipoFilled, extractTiposByAreaFromEscopoJson } from "@/lib/crm/proposta-escopo-direcionamento";
import {
  ModalHeader,
  newLeadModalFieldClass,
  SectionCard,
  StickyFooter,
} from "@/components/crm/new-lead-modal";
import { AlertCircle, Calendar, FileText, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface PipelineBoardProps {
  opportunities: Oportunidade[];
  stageColumns: PipelineBoardColumn[];
  /** Funil atual (campos obrigatórios por etapa vêm de `field_definitions`). */
  pipelineCode: PipelineCode;
  appUsersByEmail?: SignerAppUserLookup;
  /** Chamado após transição persistida no servidor (ex.: atualizar lista / timeline). */
  onDataChange?: () => void;
  /** Ex.: redirecionar ao detalhe do lead após Reunião → elaboração da proposta. */
  onAfterTransition?: (ctx: {
    opportunityId: string;
    from: OpportunityStage;
    to: OpportunityStage;
  }) => void;
}

/** Campos tratados pelo bloco dedicado Reunião → elaboração da proposta (não repetir no formulário genérico). */
const REUNIAO_CONFECCAO_MANAGED_CODES = new Set([
  "cp_gestor_contrato",
  "cp_proposta_empresas_json",
  "cp_cliente_cep",
  "cp_cliente_logradouro",
  "cp_cliente_bairro",
  "cp_cliente_cidade",
  "cp_cliente_uf",
  "cp_cliente_numero",
  "cp_cliente_complemento",
  "cp_qualificacao",
  "cp_areas_objeto",
  "cp_escopo_detalhe_json",
  "cp_prazo_entrega",
  "cp_objeto_proposta",
]);

/**
 * Campos cc_* preenchidos exclusivamente no builder (não no modal de transição).
 * O modal mostra apenas cc_tipo_instrumento e cc_tipo_pagamento — o resto fica no builder.
 * Campos desativados (cc_prazo_confeccao, cc_limite_processos, cc_limite_horas, cc_exito_areas)
 * não retornam da API (is_active = false) mas ficam listados aqui como segurança extra.
 */
const CONFECCAO_CONTRATO_BUILDER_ONLY_CODES = new Set([
  // Campos do builder (preenchimento no dialog de elaboração)
  "cc_objeto",
  "cc_valores",
  "cc_prazo_revisao",       // deadline interno para Societário e Contratos
  // Campos de área (toggles + sub-campos — exclusivos do builder)
  "cc_incluir_trabalhista",
  "cc_trabalhista_limite_acoes",
  "cc_trabalhista_horas_consultivas",
  "cc_incluir_civel",
  "cc_civel_limite_processos",
  "cc_civel_horas_consultivas",
  "cc_incluir_contratual",
  "cc_contratual_horas_mensais",
  "cc_incluir_tributario",
  "cc_tributario_limite_acoes",
  "cc_incluir_exito",
  "cc_exito_percentual",
  // Campos desativados (is_active = false) — listados apenas como garantia
  "cc_prazo_confeccao",
  "cc_limite_processos",
  "cc_limite_horas",
  "cc_exito_areas",
]);

/** Ocultos neste modal (preenchimento no detalhe do lead ou fora deste passo). */
const REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC = new Set([
  "cp_nome_focal",
  "cp_email_focal",
  "cp_tel_focal",
  "cp_realizou_due",
  "cp_captador",
  "cp_info_adicionais",
  "cp_primeiro_vencimento",
  /** Preenchido no builder da proposta, não neste modal de transição. */
  "cp_tributacao",
]);
const MEETING_TIME_SUGGESTIONS = ["09:30", "11:30", "14:30", "16:30"];
const MEETING_LOCATION_PENDING = "Não definido ainda";

type TransitionModalState = {
  item: Oportunidade;
  /** Etapa de origem ao abrir o modal (drag). */
  sourceStage: OpportunityStage;
  nextStage: OpportunityStage;
  missing: ("linkProposta" | "linkContrato")[];
  linkProposta: string;
  linkContrato: string;
  leadIntakeNeeded: boolean;
  localReuniao: string;
  dataReuniao: string;
  horarioReuniao: string;
  empresasIntake: EmpresaIntakeRow[];
  customFields: FieldDefinition[];
  customValues: Record<string, string | string[] | undefined>;
  /** Avisos não bloqueantes vindos do servidor (ex.: prazo &lt; 2 dias úteis). */
  transitionWarnings: string[];
};

function transitionModalIsDirty(m: TransitionModalState): boolean {
  const customDirty = Object.values(m.customValues).some((v) => {
    if (Array.isArray(v)) return v.length > 0;
    return Boolean(v && String(v).trim() !== "");
  });
  return (
    (m.missing.includes("linkProposta") && m.linkProposta.trim() !== "") ||
    (m.missing.includes("linkContrato") && m.linkContrato.trim() !== "") ||
    (m.leadIntakeNeeded &&
      (m.localReuniao.trim() !== "" ||
        m.dataReuniao.trim() !== "" ||
        m.horarioReuniao.trim() !== "")) ||
    customDirty
  );
}

function LeadCard({
  item,
  appUsersByEmail,
}: {
  item: Oportunidade;
  appUsersByEmail?: SignerAppUserLookup;
}) {
  const rdViewOnly = isRdKanbanViewOnlyLead(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: rdViewOnly });
  const situacao = getLeadPipelineSituation(item);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    /** Com DragOverlay: o item some da coluna; só o preview segue o rato (sem “fantasma”). */
    opacity: isDragging ? 0 : undefined,
    pointerEvents: isDragging ? ("none" as const) : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(rdViewOnly ? {} : listeners)}
      data-situacao={situacao}
      data-rd-view-only={rdViewOnly ? "true" : undefined}
      aria-hidden={isDragging}
      className={cn(
        "rounded-[14px] border p-3 shadow-sm transition-[box-shadow,transform,opacity] duration-150",
        rdViewOnly
          ? "cursor-default border-dashed border-orange-200/90 bg-orange-50/25 shadow-none hover:shadow-sm"
          : cn(
              "cursor-grab shadow-primary-dark/[0.025] hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(16,31,46,0.08)] active:cursor-grabbing",
              situacao === "em_andamento" && "border-primary-dark/10 bg-white/80",
              situacao === "vendidas" &&
                "border-emerald-600/28 bg-emerald-50/80 shadow-[inset_0_1px_0_0_rgba(16,185,129,0.22)] ring-1 ring-emerald-800/10",
              situacao === "perdidas" &&
                "border-rose-400/35 bg-rose-50/80 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.18)] ring-1 ring-rose-900/10",
            ),
      )}
      data-dragging={isDragging}
    >
      <PipelineLeadCardContent
        item={item}
        showOpenLink
        daysCompact
        appUsersByEmail={appUsersByEmail}
      />
    </div>
  );
}

function Column({
  stage,
  title,
  items,
  appUsersByEmail,
}: {
  stage: OpportunityStage;
  title: string;
  items: Oportunidade[];
  appUsersByEmail?: SignerAppUserLookup;
}) {
  const { setNodeRef } = useDroppable({ id: stage });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="h-full min-h-0 w-[min(19vw,300px)] min-w-[250px] max-w-[320px] shrink-0 sm:min-w-[268px]"
    >
    <Card className="glass-card-no-float flex h-full min-h-0 w-full flex-col gap-0 rounded-[16px] border-primary-dark/10 py-0">
      <CardHeader
        className={cn(
          "relative z-0 flex shrink-0 flex-row items-center justify-between gap-3",
          "border-b border-primary-dark/[0.08] bg-[#fbfbfc] px-3.5 py-3",
        )}
      >
        <CardTitle className="min-w-0 flex-1 pr-1 text-left text-[12px] font-bold leading-snug tracking-[-0.02em] text-foreground/90">
          {title}
        </CardTitle>
        <span
          className="shrink-0 rounded-full border border-accent-teal/20 bg-accent-teal/10 px-2 py-0.5 text-[10px] font-bold tabular-nums tracking-[0.06em] text-accent-teal"
          aria-label={`${items.length} ${items.length === 1 ? "oportunidade nesta etapa" : "oportunidades nesta etapa"}`}
        >
          {items.length}
        </span>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-0 pb-0 pt-0">
        <div
          ref={setNodeRef}
          className="crm-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-2.5 pb-3 pt-2.5"
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.length === 0 ? (
              <div
                className="rounded-[14px] border border-dashed border-slate-200 bg-[#f8f9fb] p-4 text-center text-xs text-muted-foreground"
                data-stage={stage}
              >
                Arraste uma oportunidade para esta etapa.
              </div>
            ) : (
              items.map((item) => (
                <LeadCard key={item.id} item={item} appUsersByEmail={appUsersByEmail} />
              ))
            )}
          </SortableContext>
        </div>
      </CardContent>
    </Card>
    </motion.div>
  );
}

function normalizeAreasObjetoFromServer(
  raw: string | string[] | undefined,
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
    return raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function validateReuniaoConfeccaoModal(m: TransitionModalState): string | null {
  const empresasPayload = parsePropostaEmpresasJson(
    typeof m.customValues.cp_proposta_empresas_json === "string"
      ? m.customValues.cp_proposta_empresas_json
      : "",
  );
  const cep = String(m.customValues.cp_cliente_cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) {
    return "Informe um CEP válido (8 dígitos).";
  }
  if (!String(m.customValues.cp_cliente_numero ?? "").trim()) {
    return "Informe o número do endereço.";
  }
  const log = String(m.customValues.cp_cliente_logradouro ?? "").trim();
  const cid = String(m.customValues.cp_cliente_cidade ?? "").trim();
  if (!log && !cid) {
    return "Busque o CEP ou preencha logradouro e cidade.";
  }
  const areas = normalizeAreasObjetoFromServer(m.customValues.cp_areas_objeto);
  if (!areas || areas.length === 0) {
    return "Selecione pelo menos uma área de escopo.";
  }
  const escopoRaw =
    typeof m.customValues.cp_escopo_detalhe_json === "string"
      ? m.customValues.cp_escopo_detalhe_json
      : "";
  const tiposByArea = extractTiposByAreaFromEscopoJson(escopoRaw, areas);
  for (const area of areas) {
    const catalogArea = normalizePracticeAreaKey(area) as PropostaAreaKey;
    const tipos = PROPOSTA_TIPOS_CATALOG[catalogArea] ?? [];
    if (tipos.length > 0 && !areaHasEscopoTipoFilled(tiposByArea, area)) {
      return `Selecione pelo menos um tipo de escopo para a área ${area}.`;
    }
  }
  if (!String(m.customValues.cp_prazo_entrega ?? "").trim()) {
    return "Informe o prazo para entrega.";
  }
  if (m.empresasIntake.length === 0) {
    const ok = empresasPayload.extras.some(
      (ex) => ex.razao_social.trim().length > 0 && ex.documento.trim().length > 0,
    );
    if (!ok) {
      return "Cadastre uma empresa na ficha do lead ou preencha razão social e CNPJ/CPF adicionais.";
    }
  }
  return null;
}

function prepareConfeccaoFieldValues(params: {
  fieldValues: Record<string, string | string[] | undefined>;
  empresasIntake: EmpresaIntakeRow[];
}): Record<string, string | string[] | undefined> {
  let out = { ...params.fieldValues };
  const areas = normalizeAreasObjetoFromServer(out.cp_areas_objeto);
  if (areas) out = { ...out, cp_areas_objeto: areas };
  if (params.empresasIntake.length > 0) {
    const raw = out.cp_proposta_empresas_json;
    const empty = !raw || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      out = {
        ...out,
        cp_proposta_empresas_json: JSON.stringify({
          primaryIndex: params.empresasIntake[0].index,
          extras: [],
        }),
      };
    }
  }
  return out;
}

export function PipelineBoard({
  opportunities,
  stageColumns,
  pipelineCode,
  appUsersByEmail,
  onDataChange,
  onAfterTransition,
}: PipelineBoardProps) {
  const router = useRouter();
  const [boardItems, setBoardItems] = useState<Oportunidade[]>(opportunities);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [transitionModal, setTransitionModal] = useState<TransitionModalState | null>(
    null,
  );
  const [modalError, setModalError] = useState<string | null>(null);
  const [transitionSubmitting, setTransitionSubmitting] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const transitionModalRef = useRef(transitionModal);
  transitionModalRef.current = transitionModal;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    setBoardItems(opportunities);
  }, [opportunities]);

  const byStage = useMemo(() => {
    return stageColumns.map((column) => ({
      ...column,
      items: boardItems.filter((item) => item.etapa === column.stage),
    }));
  }, [boardItems, stageColumns]);

  const activeItem = activeId
    ? boardItems.find((item) => item.id === activeId) ?? null
    : null;
  const dragOverlaySituacao = activeItem ? getLeadPipelineSituation(activeItem) : null;

  const findStageByItem = (id: string): OpportunityStage | null => {
    const found = boardItems.find((item) => item.id === id);
    return found?.etapa ?? null;
  };

  const findItem = (id: string): Oportunidade | null =>
    boardItems.find((item) => item.id === id) ?? null;

  const isReuniaoConfeccaoModal =
    transitionModal != null &&
    transitionModal.sourceStage === "reuniao" &&
    transitionModal.nextStage === "confeccao_proposta" &&
    pipelineCode === "vendas";

  const visibleCustomFields = useMemo(() => {
    if (!transitionModal) return [];
    return transitionModal.customFields
      .filter((f) => f.is_active !== false)
      .filter((f) =>
        evaluateCondition(f.condition_json as FieldCondition, transitionModal.customValues),
      )
      .filter((f) => {
        if (transitionModal.nextStage === "confeccao_contrato") {
          return !CONFECCAO_CONTRATO_BUILDER_ONLY_CODES.has(f.field_code);
        }
        if (!isReuniaoConfeccaoModal) return true;
        if (REUNIAO_CONFECCAO_MANAGED_CODES.has(f.field_code)) return false;
        if (REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC.has(f.field_code)) return false;
        return true;
      });
  }, [transitionModal, isReuniaoConfeccaoModal]);

  const commitTransition = useCallback(
    async (
      item: Oportunidade,
      nextStage: OpportunityStage,
      payload: {
        linkProposta?: string;
        linkContrato?: string;
        leadIntake?: {
          local_reuniao: string;
          data_reuniao: string;
          horario_reuniao: string;
        };
        fieldValuesByCode?: Record<string, string | string[]>;
      },
    ) => {
      const body: Record<string, unknown> = {
        opportunityId: item.id,
        nextStage,
        linkProposta: payload.linkProposta ?? null,
        linkContrato: payload.linkContrato ?? null,
      };
      if (payload.leadIntake) {
        body.leadIntake = payload.leadIntake;
      }
      if (payload.fieldValuesByCode && Object.keys(payload.fieldValuesByCode).length > 0) {
        body.fieldValuesByCode = payload.fieldValuesByCode;
      }

      const response = await fetch("/api/crm/leads/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        errors?: string[];
        etapa?: OpportunityStage;
        linkProposta?: string | null;
        linkContrato?: string | null;
      };

      if (!response.ok || data.ok === false) {
        const msg =
          (Array.isArray(data.errors) && data.errors.join("; ")) ||
          data.error ||
          "Não foi possível atualizar a etapa.";
        throw new Error(msg);
      }

      const sentProposta = payload.linkProposta?.trim() ?? "";
      const sentContrato = payload.linkContrato?.trim() ?? "";
      const respProposta =
        data.linkProposta != null && String(data.linkProposta).trim() !== ""
          ? String(data.linkProposta).trim()
          : sentProposta || null;
      const respContrato =
        data.linkContrato != null && String(data.linkContrato).trim() !== ""
          ? String(data.linkContrato).trim()
          : sentContrato || null;

      setBoardItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                etapa: data.etapa ?? nextStage,
                linkProposta: respProposta ?? i.linkProposta ?? null,
                linkContrato: respContrato ?? i.linkContrato ?? null,
              }
            : i,
        ),
      );
      onDataChange?.();
      onAfterTransition?.({ opportunityId: item.id, from: item.etapa, to: nextStage });
    },
    [onDataChange, onAfterTransition],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setBoardError(null);

    if (!over) return;
    if (active.id === over.id) return;

    const item = findItem(String(active.id));
    const sourceStage = findStageByItem(String(active.id));
    const targetAsItemStage = findStageByItem(String(over.id));
    const targetStage =
      targetAsItemStage ??
      stageColumns.find((column) => String(column.stage) === String(over.id))?.stage ??
      null;

    if (!item || !sourceStage || !targetStage) return;
    if (sourceStage === targetStage) return;

    if (isRdKanbanViewOnlyLead(item)) {
      setBoardError(RD_KANBAN_VIEW_ONLY_MESSAGE);
      return;
    }

    const allowed = canMoveToStage({
      currentStage: sourceStage,
      nextStage: targetStage,
      hasDueDiligence: item.haveraDueDiligence,
    });
    if (!allowed) {
      setBoardError(
        "Só é permitido avançar ou voltar uma etapa por vez, na ordem do funil (sem pular).",
      );
      return;
    }

    void (async () => {
      try {
        const params = new URLSearchParams({
          opportunityId: item.id,
          nextStage: targetStage,
          pipeline: pipelineCode,
        });
        const res = await fetch(`/api/crm/leads/transition-requirements?${params.toString()}`);
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          needsModal?: boolean;
          leadIntakeBlockingReason?: string | null;
          missingLinkProposta?: boolean;
          missingLinkContrato?: boolean;
          leadIntake?: {
            needed?: boolean;
            local_reuniao?: string;
            data_reuniao?: string;
            horario_reuniao?: string;
          } | null;
          empresasIntake?: EmpresaIntakeRow[];
          customFields?: FieldDefinition[];
          fieldValues?: Record<string, string | string[] | undefined>;
          warnings?: string[];
        };

        if (!res.ok || data.ok === false) {
          setBoardError(data.error ?? "Não foi possível validar a transição.");
          return;
        }

        if (data.leadIntakeBlockingReason) {
          setBoardError(data.leadIntakeBlockingReason);
          return;
        }

        if (!data.needsModal) {
          await commitTransition(item, targetStage, {});
          return;
        }

        const empresasIntake = Array.isArray(data.empresasIntake) ? data.empresasIntake : [];
        const preparedValues = prepareConfeccaoFieldValues({
          fieldValues: data.fieldValues ?? {},
          empresasIntake,
        });

        setModalError(null);
        setTransitionModal({
          item,
          sourceStage,
          nextStage: targetStage,
          missing: [
            ...(data.missingLinkProposta ? (["linkProposta"] as const) : []),
            ...(data.missingLinkContrato ? (["linkContrato"] as const) : []),
          ],
          linkProposta: item.linkProposta ?? "",
          linkContrato: item.linkContrato ?? "",
          leadIntakeNeeded: Boolean(data.leadIntake?.needed),
          localReuniao: data.leadIntake?.local_reuniao ?? "",
          dataReuniao: data.leadIntake?.data_reuniao ?? "",
          horarioReuniao: data.leadIntake?.horario_reuniao ?? "",
          empresasIntake,
          customFields: data.customFields ?? [],
          customValues: preparedValues,
          transitionWarnings: Array.isArray(data.warnings) ? data.warnings : [],
        });
      } catch (e) {
        setBoardError(e instanceof Error ? e.message : "Falha ao validar a etapa.");
      }
    })();
  };

  const requestCloseTransitionModal = useCallback(() => {
    if (transitionSubmitting) return;
    const m = transitionModalRef.current;
    if (!m) return;
    if (!transitionModalIsDirty(m)) {
      setTransitionModal(null);
      return;
    }
    setDiscardDraftOpen(true);
  }, [transitionSubmitting]);

  const confirmDiscardTransitionDraft = useCallback(() => {
    setDiscardDraftOpen(false);
    setTransitionModal(null);
  }, []);

  useEffect(() => {
    if (transitionModal === null) {
      setModalError(null);
      setDiscardDraftOpen(false);
    }
  }, [transitionModal]);

  const handleModalSubmit = () => {
    if (!transitionModal) return;
    const m = transitionModal;
    const { item, nextStage, missing, linkProposta, linkContrato } = m;
    if (missing.includes("linkProposta") && !linkProposta.trim()) {
      setModalError("Informe o link da proposta (URL).");
      return;
    }
    if (missing.includes("linkContrato") && !linkContrato.trim()) {
      setModalError("Informe o link do contrato (URL).");
      return;
    }
    if (m.leadIntakeNeeded) {
      if (!m.localReuniao.trim() || !m.dataReuniao.trim() || !m.horarioReuniao.trim()) {
        setModalError("Preencha local, data e horário da reunião.");
        return;
      }
    }

    const isReuniaoConf =
      m.sourceStage === "reuniao" &&
      m.nextStage === "confeccao_proposta" &&
      pipelineCode === "vendas";

    let mergedValues = m.customValues;
    if (isReuniaoConf) {
      const vEmp = validateReuniaoConfeccaoModal(m);
      if (vEmp) {
        setModalError(vEmp);
        return;
      }
      const empresasPayload = parsePropostaEmpresasJson(
        typeof m.customValues.cp_proposta_empresas_json === "string"
          ? m.customValues.cp_proposta_empresas_json
          : "",
      );
      mergedValues = {
        ...m.customValues,
        cp_qualificacao: buildCpQualificacaoText({
          empresasIntake: m.empresasIntake,
          empresasPayload,
          endereco: {
            cep: String(m.customValues.cp_cliente_cep ?? ""),
            logradouro: String(m.customValues.cp_cliente_logradouro ?? ""),
            numero: String(m.customValues.cp_cliente_numero ?? ""),
            complemento: String(m.customValues.cp_cliente_complemento ?? ""),
            bairro: String(m.customValues.cp_cliente_bairro ?? ""),
            cidade: String(m.customValues.cp_cliente_cidade ?? ""),
            uf: String(m.customValues.cp_cliente_uf ?? ""),
          },
        }),
      };
    }

    let blocking = listBlockingCustomFields(m.customFields, mergedValues);
    if (isReuniaoConf) {
      blocking = blocking.filter(
        (f) =>
          !REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC.has(f.field_code) &&
          !REUNIAO_CONFECCAO_MANAGED_CODES.has(f.field_code),
      );
    }
    if (blocking.length > 0) {
      if (
        blocking.some((f) => f.field_code === "cp_nome_focal") &&
        isCpNomeFocalSingleTokenOnly(mergedValues)
      ) {
        setModalError(
          "Informe o nome completo (nome e sobrenome) do ponto focal / Comercial.",
        );
        return;
      }
      setModalError(
        `Preencha os campos obrigatórios: ${blocking.map((f) => f.label).join(", ")}.`,
      );
      return;
    }

    setModalError(null);
    setTransitionSubmitting(true);
    void (async () => {
      try {
        const fieldPayload: Record<string, string | string[]> = {};
        const codesOut = new Set<string>();
        for (const f of visibleCustomFields) {
          codesOut.add(f.field_code);
        }
        if (isReuniaoConf) {
          REUNIAO_CONFECCAO_MANAGED_CODES.forEach((c) => codesOut.add(c));
        }
        for (const code of codesOut) {
          const v = mergedValues[code];
          if (v !== undefined && v !== "") {
            if (Array.isArray(v) && v.length > 0) {
              fieldPayload[code] = v;
            } else if (!Array.isArray(v) && String(v).trim() !== "") {
              fieldPayload[code] = String(v).trim();
            }
          }
        }

        await commitTransition(item, nextStage, {
          linkProposta: linkProposta.trim() || undefined,
          linkContrato: linkContrato.trim() || undefined,
          leadIntake: m.leadIntakeNeeded
            ? {
                local_reuniao: m.localReuniao.trim(),
                data_reuniao: m.dataReuniao.trim(),
                horario_reuniao: m.horarioReuniao.trim(),
              }
            : undefined,
          fieldValuesByCode:
            Object.keys(fieldPayload).length > 0 ? fieldPayload : undefined,
        });
        setTransitionModal(null);
        // Após avançar para elaboração de contrato, redireciona direto para o detalhe do lead.
        // A aba "Contrato" abre automaticamente pois isContractStage === true.
        if (nextStage === "confeccao_contrato") {
          router.push(`/crm/leads/${encodeURIComponent(item.id)}`);
        }
      } catch (e) {
        setModalError(e instanceof Error ? e.message : "Falha ao salvar a etapa.");
      } finally {
        setTransitionSubmitting(false);
      }
    })();
  };

  const transitionFieldsEl =
    transitionModal == null ? null : (
      <>
        {transitionModal.transitionWarnings.length > 0 ? (
          <div className="space-y-2">
            {transitionModal.transitionWarnings.map((w, i) => (
              <Alert
                key={`tw-${i}`}
                variant="default"
                className="border-amber-500/40 bg-amber-50/90 text-amber-950"
              >
                <AlertTitle className="text-sm">Aviso</AlertTitle>
                <AlertDescription className="text-sm">{w}</AlertDescription>
              </Alert>
            ))}
          </div>
        ) : null}
        {isReuniaoConfeccaoModal ? (
          <ConfeccaoReuniaoModalSection
            gestorField={transitionModal.customFields.find(
              (f) => f.field_code === "cp_gestor_contrato" && f.is_active !== false,
            )}
            empresasIntake={transitionModal.empresasIntake}
            customValues={transitionModal.customValues}
            disabled={transitionSubmitting}
            onFieldChange={(fieldCode, value) =>
              setTransitionModal((tm) =>
                tm ? { ...tm, customValues: { ...tm.customValues, [fieldCode]: value } } : tm,
              )
            }
          />
        ) : null}
        {transitionModal.missing.includes("linkProposta") ||
        transitionModal.missing.includes("linkContrato") ? (
          isReuniaoConfeccaoModal ? (
            <SectionCard
              icon={Link2}
              title="Links da etapa"
              subtitle="Informe as URLs exigidas pelo funil antes de confirmar a transição."
            >
              {transitionModal.missing.includes("linkProposta") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="transition-link-proposta" className="text-xs font-medium text-[#111827]">
                    Link da proposta *
                  </Label>
                  <Input
                    id="transition-link-proposta"
                    type="url"
                    placeholder="https://..."
                    value={transitionModal.linkProposta}
                    onChange={(e) =>
                      setTransitionModal((m) =>
                        m ? { ...m, linkProposta: e.target.value } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className={newLeadModalFieldClass}
                  />
                </div>
              ) : null}
              {transitionModal.missing.includes("linkContrato") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="transition-link-contrato" className="text-xs font-medium text-[#111827]">
                    Link do contrato *
                  </Label>
                  <Input
                    id="transition-link-contrato"
                    type="url"
                    placeholder="https://..."
                    value={transitionModal.linkContrato}
                    onChange={(e) =>
                      setTransitionModal((m) =>
                        m ? { ...m, linkContrato: e.target.value } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className={newLeadModalFieldClass}
                  />
                </div>
              ) : null}
            </SectionCard>
          ) : (
            <>
              {transitionModal.missing.includes("linkProposta") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="transition-link-proposta">Link da proposta *</Label>
                  <Input
                    id="transition-link-proposta"
                    type="url"
                    placeholder="https://..."
                    value={transitionModal.linkProposta}
                    onChange={(e) =>
                      setTransitionModal((m) =>
                        m ? { ...m, linkProposta: e.target.value } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                  />
                </div>
              ) : null}
              {transitionModal.missing.includes("linkContrato") ? (
                <div className="space-y-1.5">
                  <Label htmlFor="transition-link-contrato">Link do contrato *</Label>
                  <Input
                    id="transition-link-contrato"
                    type="url"
                    placeholder="https://..."
                    value={transitionModal.linkContrato}
                    onChange={(e) =>
                      setTransitionModal((m) =>
                        m ? { ...m, linkContrato: e.target.value } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                  />
                </div>
              ) : null}
            </>
          )
        ) : null}
        {transitionModal.leadIntakeNeeded ? (
          isReuniaoConfeccaoModal ? (
            <SectionCard
              icon={Calendar}
              title="Reunião (due diligence finalizada)"
              subtitle="Local, data e horário obrigatórios para registrar o encerramento da due e a reunião."
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="tr-loc" className="text-xs font-medium text-[#111827]">
                    Local da reunião *
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTransitionModal((m) =>
                        m ? { ...m, localReuniao: MEETING_LOCATION_PENDING } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className="h-7 rounded-full border-[#dfe5ee] bg-white px-2.5 text-[11px] font-semibold text-[#536274] shadow-none hover:border-[#bfd2f6] hover:bg-[#eef5ff] hover:text-[#173a6a]"
                  >
                    Ainda sem local
                  </Button>
                </div>
                <Input
                  id="tr-loc"
                  value={transitionModal.localReuniao}
                  onChange={(e) =>
                    setTransitionModal((m) =>
                      m ? { ...m, localReuniao: e.target.value } : m,
                    )
                  }
                  disabled={transitionSubmitting}
                  className={newLeadModalFieldClass}
                  placeholder={`Ex.: Matriz São Paulo ou ${MEETING_LOCATION_PENDING}`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tr-dt" className="text-xs font-medium text-[#111827]">
                    Data *
                  </Label>
                  <DateInputBr
                    id="tr-dt"
                    value={transitionModal.dataReuniao}
                    onChange={(ymd) =>
                      setTransitionModal((m) =>
                        m ? { ...m, dataReuniao: ymd } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className={newLeadModalFieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tr-hr" className="text-xs font-medium text-[#111827]">
                    Horário *
                  </Label>
                  <TimeInputBr
                    id="tr-hr"
                    step={300}
                    value={transitionModal.horarioReuniao}
                    onChange={(hm) =>
                      setTransitionModal((m) =>
                        m ? { ...m, horarioReuniao: hm } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    suggestions={MEETING_TIME_SUGGESTIONS}
                    className={cn(newLeadModalFieldClass, "font-mono")}
                  />
                </div>
              </div>
            </SectionCard>
          ) : (
            <SectionCard
              icon={Calendar}
              title="Reunião (due diligence finalizada)"
              subtitle="Local, data e horário obrigatórios para concluir a DUE no funil."
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="tr-loc" className="text-xs font-medium text-[#111827]">
                    Local da reunião *
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setTransitionModal((m) =>
                        m ? { ...m, localReuniao: MEETING_LOCATION_PENDING } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className="h-7 rounded-full border-[#dfe5ee] bg-white px-2.5 text-[11px] font-semibold text-[#536274] shadow-none hover:border-[#bfd2f6] hover:bg-[#eef5ff] hover:text-[#173a6a]"
                  >
                    Ainda sem local
                  </Button>
                </div>
                <Input
                  id="tr-loc"
                  value={transitionModal.localReuniao}
                  onChange={(e) =>
                    setTransitionModal((m) =>
                      m ? { ...m, localReuniao: e.target.value } : m,
                    )
                  }
                  disabled={transitionSubmitting}
                  className={newLeadModalFieldClass}
                  placeholder={`Ex.: Matriz São Paulo ou ${MEETING_LOCATION_PENDING}`}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tr-dt" className="text-xs font-medium text-[#111827]">
                    Data *
                  </Label>
                  <DateInputBr
                    id="tr-dt"
                    value={transitionModal.dataReuniao}
                    onChange={(ymd) =>
                      setTransitionModal((m) =>
                        m ? { ...m, dataReuniao: ymd } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    className={newLeadModalFieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tr-hr" className="text-xs font-medium text-[#111827]">
                    Horário *
                  </Label>
                  <TimeInputBr
                    id="tr-hr"
                    step={300}
                    value={transitionModal.horarioReuniao}
                    onChange={(hm) =>
                      setTransitionModal((m) =>
                        m ? { ...m, horarioReuniao: hm } : m,
                      )
                    }
                    disabled={transitionSubmitting}
                    suggestions={MEETING_TIME_SUGGESTIONS}
                    className={cn(newLeadModalFieldClass, "font-mono")}
                  />
                </div>
              </div>
            </SectionCard>
          )
        ) : null}
        {visibleCustomFields.length > 0 ? (
          isReuniaoConfeccaoModal ? (
            <SectionCard
              icon={FileText}
              title="Campos adicionais da etapa"
              subtitle="Demais informações configuradas para esta transição."
            >
              {visibleCustomFields.map((field) => (
                <div key={field.field_code} className="space-y-1.5">
                  <Label className="text-xs font-medium text-[#111827]">
                    {field.label}
                    {field.is_required ? (
                      <span className="text-red-500" aria-hidden>
                        {" "}
                        *
                      </span>
                    ) : null}
                  </Label>
                  <DynamicField
                    field={field}
                    value={transitionModal.customValues[field.field_code]}
                    onChange={(code, value) =>
                      setTransitionModal((tm) =>
                        tm
                          ? {
                              ...tm,
                              customValues: { ...tm.customValues, [code]: value },
                            }
                          : tm,
                      )
                    }
                  />
                </div>
              ))}
            </SectionCard>
          ) : (
            <div className="space-y-3 rounded-xl border border-white/45 bg-white/45 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Campos da etapa
              </p>
              {visibleCustomFields.map((field) => (
                <div key={field.field_code} className="space-y-1.5">
                  <Label className="text-sm font-medium text-primary-dark">
                    {field.label}
                    {field.is_required ? (
                      <span className="text-red-500" aria-hidden>
                        {" "}
                        *
                      </span>
                    ) : null}
                  </Label>
                  <DynamicField
                    field={field}
                    value={transitionModal.customValues[field.field_code]}
                    onChange={(code, value) =>
                      setTransitionModal((tm) =>
                        tm
                          ? {
                              ...tm,
                              customValues: { ...tm.customValues, [code]: value },
                            }
                          : tm,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )
        ) : null}
      </>
    );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
      onDragStart={(event) => setActiveId(String(event.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="crm-scrollbar h-full min-h-0 overflow-x-auto overflow-y-hidden pb-1 [-webkit-overflow-scrolling:touch]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex h-full min-h-[min(70dvh,680px)] min-w-max items-stretch gap-2.5 sm:gap-3 md:h-[min(76dvh,800px)] lg:h-[min(80dvh,860px)]"
        >
          {byStage.map((column) => (
            <Column
              key={column.stage}
              stage={column.stage}
              title={column.title}
              items={column.items}
              appUsersByEmail={appUsersByEmail}
            />
          ))}
        </motion.div>
      </div>

      <Dialog
        modal={false}
        open={transitionModal !== null}
        onOpenChange={(open) => {
          if (!open && !transitionSubmitting) {
            requestCloseTransitionModal();
          }
        }}
      >
        <DialogContent
          hideCloseButton={isReuniaoConfeccaoModal}
          className={cn(
            isReuniaoConfeccaoModal
              ? "max-h-[min(90vh,860px)] max-w-[min(100vw-1.5rem,960px)] w-full gap-0 overflow-hidden rounded-[22px] border border-[#dfe5ee] bg-[#f8f9fb] p-0 shadow-[0_28px_80px_rgba(16,31,46,0.18),0_10px_30px_rgba(16,31,46,0.08)] backdrop-blur-xl sm:rounded-[22px]"
              : "max-h-[min(90vh,760px)] max-w-lg overflow-y-auto",
          )}
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
        >
          {transitionModal && isReuniaoConfeccaoModal ? (
            <div className="font-new-lead-modal flex max-h-[min(90vh,860px)] min-h-0 w-full flex-col overflow-hidden">
              <ModalHeader
                badge="TRANSIÇÃO DE ETAPA"
                title="Reunião → elaboração da proposta"
                subtitle={
                  <>
                    Complete os dados obrigatórios para mover{" "}
                    <span className="font-semibold text-white">
                      {transitionModal.item.solicitante ?? "esta oportunidade"}
                    </span>{" "}
                    no funil. O layout segue o mesmo padrão visual do cadastro de novo lead.
                  </>
                }
                pills={[
                  {
                    label: "De",
                    value: OPPORTUNITY_STAGE_LABELS[transitionModal.sourceStage],
                  },
                  {
                    label: "Para",
                    value: OPPORTUNITY_STAGE_LABELS[transitionModal.nextStage],
                  },
                  {
                    label: "Lead",
                    value:
                      (transitionModal.item.solicitante ?? "—").length > 42
                        ? `${(transitionModal.item.solicitante ?? "—").slice(0, 40)}…`
                        : (transitionModal.item.solicitante ?? "—"),
                  },
                ]}
                onRequestClose={() => requestCloseTransitionModal()}
              />
              <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                <div className="mx-auto max-w-[880px] space-y-5">
                  {modalError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Não foi possível validar</AlertTitle>
                      <AlertDescription>{modalError}</AlertDescription>
                    </Alert>
                  ) : null}
                  {transitionFieldsEl}
                </div>
              </div>
              <StickyFooter
                left={
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-[#111827]">Confirmar mudança de etapa</p>
                    <p className="text-xs font-normal leading-relaxed text-[#6b7280]">
                      Os dados serão gravados com a transição. Fechar (X ou Cancelar) com campos
                      preenchidos pede confirmação antes de descartar.
                    </p>
                  </div>
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full rounded-full border-[#e5e7eb] bg-white text-[#111827] transition-[transform,box-shadow] duration-180 hover:bg-[#f9fafb] sm:w-auto"
                      disabled={transitionSubmitting}
                      onClick={() => requestCloseTransitionModal()}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="w-full rounded-full border-0 bg-[#101f2e] px-8 text-white shadow-md shadow-[#101f2e]/25 transition-[transform,box-shadow,background-color] duration-180 hover:-translate-y-0.5 hover:bg-[#1b2d42] hover:shadow-lg disabled:translate-y-0 sm:w-auto"
                      disabled={transitionSubmitting}
                      onClick={handleModalSubmit}
                    >
                      {transitionSubmitting ? "Salvando…" : "Confirmar etapa"}
                    </Button>
                  </>
                }
              />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Dados obrigatórios para a etapa</DialogTitle>
                <DialogDescription>
                  Para mover{" "}
                  <strong className="text-primary-dark">
                    {transitionModal?.item.solicitante ?? "esta oportunidade"}
                  </strong>{" "}
                  para{" "}
                  <strong className="text-primary-dark">
                    {transitionModal
                      ? OPPORTUNITY_STAGE_LABELS[transitionModal.nextStage]
                      : ""}
                  </strong>
                  , preencha os campos abaixo (links, reunião e/ou formulário da etapa).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">{transitionFieldsEl}</div>
              {modalError ? (
                <Alert variant="destructive">
                  <AlertDescription>{modalError}</AlertDescription>
                </Alert>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  disabled={transitionSubmitting}
                  onClick={() => requestCloseTransitionModal()}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="cta"
                  disabled={transitionSubmitting}
                  onClick={handleModalSubmit}
                >
                  {transitionSubmitting ? "Salvando…" : "Confirmar etapa"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={boardError !== null}
        onOpenChange={(open) => {
          if (!open) setBoardError(null);
        }}
      >
        <DialogContent className="max-w-md gap-5 border-destructive/25 bg-white/95 sm:rounded-2xl">
          <DialogHeader className="gap-3 text-left sm:text-left">
            <div className="flex gap-3">
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/15"
                aria-hidden
              >
                <AlertCircle className="size-5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <DialogTitle className="text-base font-semibold text-primary-dark">
                  Transição não permitida
                </DialogTitle>
                {boardError ? (
                  <DialogDescription asChild>
                    <p className="text-sm font-normal leading-relaxed text-destructive">
                      {boardError}
                    </p>
                  </DialogDescription>
                ) : null}
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="cta" onClick={() => setBoardError(null)}>
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardDraftOpen} onOpenChange={setDiscardDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar o que foi digitado?</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa não será alterada até você confirmar a transição com os dados completos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={confirmDiscardTransitionDraft}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {typeof document !== "undefined"
        ? createPortal(
            <DragOverlay
              zIndex={10000}
              dropAnimation={{ duration: 160, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }}
            >
              {activeItem && dragOverlaySituacao ? (
                <div
                  data-situacao={dragOverlaySituacao}
                  className={cn(
                    "box-border max-w-none cursor-grabbing rounded-[14px] border p-3 shadow-xl touch-none",
                    dragOverlaySituacao === "em_andamento" && "border-primary-dark/10 bg-white",
                    dragOverlaySituacao === "vendidas" &&
                      "border-emerald-600/28 bg-emerald-50 shadow-[inset_0_1px_0_0_rgba(16,185,129,0.22)] ring-1 ring-emerald-800/10",
                    dragOverlaySituacao === "perdidas" &&
                      "border-rose-400/35 bg-rose-50 shadow-[inset_0_1px_0_0_rgba(244,63,94,0.18)] ring-1 ring-rose-900/10",
                  )}
                >
                  {/* Mesmo layout do card na coluna para o rect do overlay coincidir com o cursor */}
                  <PipelineLeadCardContent
                    item={activeItem}
                    showOpenLink
                    daysCompact
                    appUsersByEmail={appUsersByEmail}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}
