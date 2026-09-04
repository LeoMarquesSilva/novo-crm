"use client";

import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertCircle,
  Bell,
  BookText,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  History,
  Loader2,
  Lock,
  MapPin,
  PenLine,
  Plus,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { DateInputBr } from "@/components/ui/date-input-br";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { evaluateCondition, type FieldCondition } from "@/lib/crm/field-condition";
import {
  buildContratoDocumentPagePreview,
  type ContratoDocumentPagePreview,
  type ContratoPendingField,
} from "@/lib/crm/contrato-docx-data";
import {
  buildDefaultSignaturePins,
  D4SIGN_A4_HEIGHT,
  D4SIGN_A4_WIDTH,
  isSignaturePagePin,
  normalizeLegacySignaturePins,
  SIGNATURE_PAGE_LAST,
} from "@/lib/crm/contrato-signature-pins";
import type { LeadDetailData } from "./page";
import { useContractReviewTaskRealtime } from "@/lib/crm/use-contract-review-task-realtime";
import {
  canSendContractToD4Sign,
  getContractSendBlockReason,
  isContractReviewApproved,
} from "@/lib/crm/contract-send-gate";
import { useOportunidadeRealtime } from "@/lib/crm/use-d4sign-realtime";
import { D4SignViewDialog } from "@/components/crm/d4sign-view-dialog";
import {
  contractAreaTogglesFromProposal,
  mergeInheritedContractAreaToggles,
} from "@/lib/crm/contract-engine/inherit-areas";
import { buildCanonicalContract } from "@/lib/crm/contract-engine/build-canonical";
import { SECTION_ORDER } from "@/lib/crm/contract-engine/clause-engine";
import { buildCanonicalContratoPage } from "@/lib/crm/contract-engine/legacy-preview";
import { applyObjectOverride } from "@/lib/crm/contract-engine/object-engine";
import { appendContractEngineEvent } from "@/lib/crm/contract-engine/object-events";
import { resolveContractScopes } from "@/lib/crm/contract-engine/proposal-snapshot";
import type { ContractObjectDraft } from "@/lib/crm/contract-engine/persist";
import type {
  CanonicalContractBuildResult,
  ContractClauseTemplate,
  ContractEngineEvent,
  ContractObjectOverride,
  ContractScopeAdjustment,
} from "@/lib/crm/contract-engine/types";
import type { ProposalContractSnapshot } from "@/lib/crm/contract-engine/proposal-snapshot";
import {
  AlterarEscoposDialog,
  EscoposContratadosSection,
  ObjetoContratoSection,
  SectionHeading,
} from "./contrato-object-panels";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  templatePath: string;
  version: number;
};

type CcFieldDef = {
  definitionId: string;
  fieldCode: string;
  label: string;
  fieldType: string;
  fieldOptions: string[] | null;
  conditionJson: unknown;
  value: string;
  required: boolean;
};

/** Template de cláusula da biblioteca (admin gerencia) */
type ClauseTemplate = {
  id: string;
  title: string;
  content: string;
  category: string;
  sort_order: number;
  /** `ClauseRole` bruto do banco — usado só p/ agrupar por seção do contrato no builder. */
  role?: string | null;
  /** Cláusula obrigatória — o motor sempre a inclui, independente de "seleção
   * manual" aqui; não pode ser adicionada/removida por este picker. */
  is_required?: boolean | null;
  /** Chave estável (`ResolvedContractClause.stableKey`) — usada pra checar se
   * o motor canônico já está gerando esta cláusula sozinho (ver `liveBuild`
   * em `ContratoBuilderDialog`), mesmo quando `is_required` está `false`. */
  stable_key?: string | null;
};

/** Cláusula selecionada + editada para este contrato específico */
type SelectedClause = {
  id: string;
  title: string;
  content: string;
  order: number;
};

/** Pin de assinatura/rubrica/carimbo posicionado no contrato */
type SignaturePin = {
  /** E-mail do signatário OU `"__client__"` (placeholder p/ CONTRATANTE) */
  email: string;
  page: number;
  position_x: number;   // pixels (referência A4: 794×1123)
  position_y: number;
  page_width: number;
  page_height: number;
  /** 0 = assinatura, 1 = rubrica, 2 = carimbo */
  type?: 0 | 1 | 2;
};

/** Signatários conhecidos no momento da elaboração */
const BUILDER_SIGNERS = [
  { key: "gustavo@bpplaw.com.br", label: "Gustavo Bismarchi", role: "CONTRATADA" as const, color: "teal" },
  { key: "ricardo@bpplaw.com.br", label: "Ricardo Pires",     role: "CONTRATADA" as const, color: "emerald" },
  { key: "__client__",            label: "Cliente",            role: "CONTRATANTE" as const, color: "amber" },
] as const;

type ContratoState = {
  template: Template;
  templates: Template[];
  instance: {
    id: string;
    status: string;
    current_version: number;
    updated_at: string;
  } | null;
  versions: Array<{
    id: string;
    version_number: number;
    generated_file_path: string | null;
    generated_at: string;
  }>;
  pending: ContratoPendingField[];
  snapshot: {
    fieldByCode: Record<string, string>;
    empresa: {
      razaoSocial: string | null;
      documentoFormatado: string | null;
    };
  };
  ccFieldDefs: CcFieldDef[];
  availableClauses: ClauseTemplate[];
  /** Biblioteca de cláusulas ativa (banco > catálogo fixo) usada no preview ao vivo. */
  clauseLibrary?: ContractClauseTemplate[];
  selectedClauses: SelectedClause[];
  signaturePins: SignaturePin[];
  reviewTask: {
    id: string;
    prazo_revisao: string | null;
    status: "pendente" | "em_revisao" | "concluido";
    observacao: string | null;
    notificado_em: string | null;
    concluido_em: string | null;
    created_at: string;
  } | null;
  engine: CanonicalContractBuildResult | null;
  proposalSnapshot: ProposalContractSnapshot | null;
  objectDraft?: ContractObjectDraft;
  proposalChanged?: boolean;
};

// ─── Seções e códigos dos campos ─────────────────────────────────────────────

/** Campos agrupados por seção do formulário do builder. */
const SECTION_VALORES = [
  "cc_tipo_pagamento",
  "cc_valores",
] as const;
const SECTION_PRAZO = ["cc_prazo_revisao"] as const;

type InclusionToggle = {
  toggleCode: string;
  label: string;
  detailCodes: readonly string[];
};

const EXITO_CONFIG: InclusionToggle = {
  toggleCode: "cc_incluir_exito",
  label: "Honorários de êxito",
  detailCodes: ["cc_exito_percentual"],
};

// ─── Componente principal ─────────────────────────────────────────────────────

export function ContratoDocumentBuilder({
  lead,
  propostaEmpresaPrincipalNome,
  appUsersByEmail = {},
}: {
  lead: LeadDetailData;
  propostaEmpresaPrincipalNome: string | null;
  appUsersByEmail?: Record<string, { avatarUrl: string | null; fullName: string }>;
}) {
  const router = useRouter();
  const [contratoState, setContratoState] = useState<ContratoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  const refreshState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato`, {
        cache: "no-store",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: ContratoState;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Falha ao carregar contrato.");
      }
      setContratoState(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contrato.");
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  // Realtime: atualiza ReviewTaskCard quando Societário muda o status
  useContractReviewTaskRealtime(lead.id, refreshState);

  // Realtime: atualiza lista de signatários quando webhook D4Sign marca alguém como assinado
  useOportunidadeRealtime(lead.id, () => router.refresh());

  const pending = contratoState?.pending ?? [];
  const versions = contratoState?.versions ?? [];
  const hasInstance = Boolean(contratoState?.instance);
  const inheritedFields = lead.pipelineFields.filter((f) =>
    ["cp_cliente_cidade", "cp_cliente_uf", "cp_investimento_resumo"].includes(f.fieldCode),
  );

  function goToPendingItem(item: ContratoPendingField) {
    setBuilderOpen(true);
    if (!item.sectionId) return;
    const sectionId = item.sectionId;
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-crm-border-warm-strong bg-crm-surface-warm shadow-[0_28px_80px_rgba(16,31,46,0.12)]">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/20 bg-[#0b1724] px-5 py-5 text-white sm:px-6">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-teal/35 bg-accent-teal/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100">
              <FileText className="size-3.5" aria-hidden />
              Elaboração de Contrato
            </div>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.045em] text-white">
              Workspace de contrato
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-100/85">
              {hasInstance
                ? "Rascunho em andamento. Clique em “Continuar Elaboração” para editar."
                : "Selecione o modelo, preencha os dados e visualize o preview ao vivo."}
            </p>
          </div>
          <Button
            type="button"
            variant="teal"
            size="sm"
            className="h-11 gap-2 px-5 text-sm font-bold"
            disabled={loading}
            onClick={() => setBuilderOpen(true)}
          >
            <PenLine className="size-4" aria-hidden />
            {hasInstance ? "Continuar Elaboração" : "Elaborar Contrato"}
          </Button>
        </div>
      </div>

      {/* Status overview */}
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/55 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Carregando...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}

        {/* Dados herdados */}
        {(propostaEmpresaPrincipalNome || inheritedFields.length > 0) && !loading ? (
          <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="size-4 text-accent-teal" aria-hidden />
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark">
                Dados da proposta
              </h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {propostaEmpresaPrincipalNome ? (
                <div className="rounded-xl border border-teal-200/60 bg-white/80 p-3 sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-teal/80">
                    Empresa principal
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-primary-dark">
                    {propostaEmpresaPrincipalNome}
                  </p>
                </div>
              ) : null}
              {inheritedFields.map((f) => (
                <div key={f.definitionId} className="rounded-xl border border-teal-200/60 bg-white/80 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-teal/80">
                    {f.label.replace(" [CP]", "")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary-dark">
                    {f.value.trim() || <span className="text-muted-foreground">Não preenchido</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Status cards */}
        {!loading && contratoState ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <ContratStatusCard
              title={pending.length === 0 ? "Pronto para gerar" : "Pendências"}
              icon={pending.length === 0 ? CheckCircle2 : TriangleAlert}
              tone={pending.length === 0 ? "ok" : "warn"}
            >
              {pending.length === 0 ? (
                <p className="text-sm text-primary-dark/80">
                  Todos os campos obrigatórios estão preenchidos.
                </p>
              ) : (
                <ul className="space-y-1">
                  {pending.slice(0, 6).map((item) => (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => goToPendingItem(item)}
                        className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-sm text-primary-dark/80 transition-colors hover:bg-amber-100/60"
                      >
                        <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
                        <span className="flex-1">{item.label}</span>
                        <ChevronRight
                          className="size-3.5 shrink-0 text-amber-400 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                  {pending.length > 6 ? (
                    <li className="px-1.5 text-xs text-muted-foreground">
                      + {pending.length - 6} pendências
                    </li>
                  ) : null}
                </ul>
              )}
            </ContratStatusCard>

            <ContratStatusCard title="Histórico" icon={History} tone="neutral">
              <div className="space-y-2 text-sm">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma versão gerada ainda.</p>
                ) : (
                  versions.slice(0, 4).map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between rounded-lg border border-stone-200 bg-white/70 px-3 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-primary-dark">v{v.version_number}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(v.generated_at).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ContratStatusCard>
          </div>
        ) : null}

        {/* Tarefa de revisão */}
        {!loading && contratoState ? (
          <ReviewTaskCard
            reviewTask={contratoState.reviewTask}
            leadId={lead.id}
            onRefresh={refreshState}
          />
        ) : null}

        {/* Envio D4Sign */}
        {!loading && contratoState ? (
          <D4SignSendSection
            lead={lead}
            pending={pending}
            reviewTask={contratoState.reviewTask}
            onRefresh={refreshState}
            appUsersByEmail={appUsersByEmail}
          />
        ) : null}
      </div>

      {/* Dialog do builder */}
      {builderOpen && contratoState ? (
        <ContratoBuilderDialog
          lead={lead}
          propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
          contratoState={contratoState}
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          onRefresh={refreshState}
        />
      ) : null}
    </section>
  );
}

// ─── Dialog split-pane ────────────────────────────────────────────────────────

function ContratoBuilderDialog({
  lead,
  propostaEmpresaPrincipalNome,
  contratoState,
  open,
  onOpenChange,
  onRefresh,
}: {
  lead: LeadDetailData;
  propostaEmpresaPrincipalNome: string | null;
  contratoState: ContratoState;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const initDraft = () =>
    mergeInheritedContractAreaToggles(
      Object.fromEntries(contratoState.ccFieldDefs.map((f) => [f.fieldCode, f.value])),
      contractAreaTogglesFromProposal(contratoState.snapshot.fieldByCode),
    );

  const [draftValues, setDraftValues] = useState<Record<string, string>>(initDraft);
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initDraft);
  // Sem seletor visível: "modelo" não afeta o conteúdo gerado (o Word é montado
  // programaticamente a partir dos dados, não de um arquivo de template — os 4
  // arquivos que essas linhas antigas apontavam nem existem mais no repo). Mantém
  // só o id do template padrão, exigido internamente pelas chamadas de
  // salvar/gerar.
  const [selectedTemplateId] = useState(
    contratoState.template?.id ?? (contratoState.templates[0]?.id ?? ""),
  );
  const [savedTemplateId, setSavedTemplateId] = useState(
    contratoState.template?.id ?? (contratoState.templates[0]?.id ?? ""),
  );

  const [draftSelectedClauses, setDraftSelectedClauses] = useState<SelectedClause[]>(
    contratoState.selectedClauses ?? [],
  );
  const [savedSelectedClauses, setSavedSelectedClauses] = useState<SelectedClause[]>(
    contratoState.selectedClauses ?? [],
  );

  // ── Pins de assinatura (folha dedicada — última página do PDF) ───────────
  const initialPins = normalizeLegacySignaturePins(contratoState.signaturePins ?? []);
  const [draftPins, setDraftPins] = useState<SignaturePin[]>(initialPins);
  const [savedPins, setSavedPins] = useState<SignaturePin[]>(initialPins);
  /** Modo de posicionamento: null = inativo, ou {signerKey, type} ativo */
  const [pinMode, setPinMode] = useState<{
    signerKey: string;
    type: 0 | 1 | 2;
  } | null>(null);

  // Presets padrão na folha de assinaturas quando ainda não há pins salvos no servidor
  useEffect(() => {
    if (!open) return;
    if ((contratoState.signaturePins ?? []).length > 0) return;
    const defaults = buildDefaultSignaturePins();
    setDraftPins(defaults);
    setSavedPins(defaults);
  }, [open, contratoState.signaturePins]);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  const [confirmClose, setConfirmClose] = useState(false);
  const [alterarEscoposOpen, setAlterarEscoposOpen] = useState(false);

  const initialObjectDraft = contratoState.objectDraft ?? {
    objectFieldValues: {},
    objectOverrides: [] as ContractObjectOverride[],
    scopeAdjustment: null as ContractScopeAdjustment | null,
    engineEvents: [] as ContractEngineEvent[],
    explicitCompositionKey: null as string | null,
  };
  const [objectFields, setObjectFields] = useState<Record<string, string>>(
    initialObjectDraft.objectFieldValues,
  );
  const [savedObjectFields, setSavedObjectFields] = useState<Record<string, string>>(
    initialObjectDraft.objectFieldValues,
  );
  const [objectOverrides, setObjectOverrides] = useState<ContractObjectOverride[]>(
    initialObjectDraft.objectOverrides,
  );
  const [savedObjectOverrides, setSavedObjectOverrides] = useState<ContractObjectOverride[]>(
    initialObjectDraft.objectOverrides,
  );
  const [scopeAdjustment, setScopeAdjustment] = useState<ContractScopeAdjustment | null>(
    initialObjectDraft.scopeAdjustment,
  );
  const [savedScopeAdjustment, setSavedScopeAdjustment] = useState<ContractScopeAdjustment | null>(
    initialObjectDraft.scopeAdjustment,
  );
  const [engineEvents, setEngineEvents] = useState<ContractEngineEvent[]>(
    initialObjectDraft.engineEvents,
  );

  // ── Computed ───────────────────────────────────────────────────────────────
  const isDirty =
    JSON.stringify(draftValues) !== JSON.stringify(savedValues) ||
    selectedTemplateId !== savedTemplateId ||
    JSON.stringify(draftSelectedClauses) !== JSON.stringify(savedSelectedClauses) ||
    JSON.stringify(draftPins) !== JSON.stringify(savedPins) ||
    JSON.stringify(objectFields) !== JSON.stringify(savedObjectFields) ||
    JSON.stringify(objectOverrides) !== JSON.stringify(savedObjectOverrides) ||
    JSON.stringify(scopeAdjustment) !== JSON.stringify(savedScopeAdjustment);

  const fieldByCode = Object.fromEntries(
    contratoState.ccFieldDefs.map((f) => [f.fieldCode, f]),
  );

  /** Verifica se um campo cc_* está visível dado os draftValues atuais. */
  function isVisible(code: string): boolean {
    const f = fieldByCode[code];
    if (!f) return false;
    return evaluateCondition(f.conditionJson as FieldCondition, draftValues);
  }

  const clauseLibrary = useMemo(() => {
    if (!contratoState.clauseLibrary) return undefined;
    return new Map(contratoState.clauseLibrary.map((clause) => [clause.stableKey, clause]));
  }, [contratoState.clauseLibrary]);

  const liveBuild = useMemo((): CanonicalContractBuildResult | null => {
    if (!contratoState.proposalSnapshot) return contratoState.engine;
    return buildCanonicalContract({
      snapshot: contratoState.proposalSnapshot,
      fieldByCode: { ...contratoState.snapshot.fieldByCode, ...draftValues },
      objectFieldValues: objectFields,
      objectOverrides,
      scopeAdjustment,
      explicitCompositionKey: initialObjectDraft.explicitCompositionKey,
      engineEvents,
      clauseLibrary,
    });
  }, [
    clauseLibrary,
    contratoState.engine,
    contratoState.proposalSnapshot,
    contratoState.snapshot.fieldByCode,
    draftValues,
    engineEvents,
    initialObjectDraft.explicitCompositionKey,
    objectFields,
    objectOverrides,
    scopeAdjustment,
  ]);

  // Texto de verdade (placeholders resolvidos) de tudo que o motor já está
  // gerando pra este contrato AGORA (escopo contratado, reavaliado a cada
  // mudança de draft), por chave estável — usado pra travar essas linhas na
  // barra lateral de Cláusulas Adicionais (mesmo quando o catálogo não marca
  // a cláusula como `is_required` — ex.: exclusões específicas de área, que
  // só existem quando aquele escopo foi contratado) e pro "Visualizar".
  const engineClauseContent = useMemo(
    () =>
      liveBuild
        ? new Map(liveBuild.data.clauses.map((c) => [c.stableKey, c.content]))
        : undefined,
    [liveBuild],
  );

  // ── Preview client-side (instantâneo, sem API) ────────────────────────────
  const livePreview = useMemo((): ContratoDocumentPagePreview => {
    const { fieldByCode: baseFields, empresa } = contratoState.snapshot;
    const merged = { ...baseFields, ...draftValues };
    const f = (code: string) => String(merged[code] ?? "").trim();
    const fmtCep = (raw: string) => {
      const d = raw.replace(/\D/g, "").slice(0, 8);
      return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
    };
    const data: Record<string, string> = {
      EMPRESA: empresa.razaoSocial ?? "",
      DOCUMENTO: empresa.documentoFormatado ?? "",
      LOGRADOURO: f("cp_cliente_logradouro"),
      NUMERO: f("cp_cliente_numero"),
      BAIRRO: f("cp_cliente_bairro"),
      CIDADE: f("cp_cliente_cidade"),
      UF: f("cp_cliente_uf"),
      CEP: fmtCep(f("cp_cliente_cep")),
      INVESTIMENTO: f("cp_investimento_resumo"),
      TIPO_INSTRUMENTO: f("cc_tipo_instrumento"),
      OBJETO_CONTRATO: f("cc_objeto"),
      LIMITE_PROCESSOS: f("cc_limite_processos"),
      LIMITE_HORAS: f("cc_limite_horas"),
      EXITO_AREAS: f("cc_exito_areas"),
      VALORES: f("cc_valores"),
      TIPO_PAGAMENTO: f("cc_tipo_pagamento"),
      PRAZO_CONFECCAO: f("cc_prazo_confeccao"),
      PRAZO_REVISAO: f("cc_prazo_revisao"),
      INCLUIR_TRABALHISTA: f("cc_incluir_trabalhista"),
      TRABALHISTA_LIMITE_ACOES: f("cc_trabalhista_limite_acoes"),
      TRABALHISTA_HORAS_CONSULTIVAS: f("cc_trabalhista_horas_consultivas"),
      INCLUIR_CIVEL: f("cc_incluir_civel"),
      CIVEL_LIMITE_PROCESSOS: f("cc_civel_limite_processos"),
      CIVEL_HORAS_CONSULTIVAS: f("cc_civel_horas_consultivas"),
      INCLUIR_CONTRATUAL: f("cc_incluir_contratual"),
      CONTRATUAL_HORAS_MENSAIS: f("cc_contratual_horas_mensais"),
      INCLUIR_TRIBUTARIO: f("cc_incluir_tributario"),
      TRIBUTARIO_LIMITE_ACOES: f("cc_tributario_limite_acoes"),
      INCLUIR_EXITO: f("cc_incluir_exito"),
      EXITO_PERCENTUAL: f("cc_exito_percentual"),
      DATA_ASSINATURA: format(new Date(), "dd/MM/yyyy"),
      P: "1",
      F: "1",
    };
    const base = buildContratoDocumentPagePreview(data, draftSelectedClauses);
    if (!liveBuild) return base;
    // Motor canônico ativo: usa a mesma função (buildCanonicalContratoPage) que
    // o botão "Gerar DOCX" e o envio ao D4Sign, para os três nunca divergirem.
    return buildCanonicalContratoPage({
      canonicalData: liveBuild.data,
      userExtras: draftSelectedClauses,
    });
  }, [contratoState, draftValues, draftSelectedClauses, liveBuild]);

  const objectComplete = Boolean(
    liveBuild &&
      liveBuild.data.contractObject.missingScopeIds.length === 0 &&
      liveBuild.data.contractObject.missingRequiredFields.length === 0 &&
      liveBuild.data.scopes.every((s) => !s.missingProfile),
  );
  const scopesComplete = Boolean(
    liveBuild && liveBuild.data.scopes.length > 0 && liveBuild.data.scopes.every((s) => !s.missingProfile),
  );
  const valsComplete = Boolean(draftValues.cc_tipo_pagamento?.trim());
  const prazComplete = Boolean(draftValues.cc_prazo_revisao?.trim());

  // ── Handlers ───────────────────────────────────────────────────────────────
  function fieldChange(code: string, value: string) {
    setDraftValues((prev) => ({ ...prev, [code]: value }));
    setSaveFeedback(null);
  }

  async function persistAllFields() {
    const fieldDefs = contratoState.ccFieldDefs;
    const patches = fieldDefs.map((f) =>
      fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipelineField: {
            fieldDefinitionId: f.definitionId,
            value: draftValues[f.fieldCode] ?? "",
          },
        }),
      }),
    );
    await Promise.all(patches);
    const completedFields = Object.entries(objectFields).filter(
      ([key, value]) => value.trim() && !String(savedObjectFields[key] ?? "").trim(),
    );
    const nextEvents = completedFields.reduce(
      (events, [key]) =>
        appendContractEngineEvent(events, {
          type: "contract_object_field_completed",
          payload: { key },
        }),
      engineEvents,
    );
    if (nextEvents !== engineEvents) setEngineEvents(nextEvents);
    // Salvar seleção de template + cláusulas adicionais + pins
    const persistRes = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        status: "draft",
        expectedUpdatedAt: contratoState.instance?.updated_at,
        data: {
          clausulas_selecionadas: draftSelectedClauses,
          pins_signatarios: draftPins,
          contract_object_fields: objectFields,
          contract_object_overrides: objectOverrides,
          contract_scope_adjustments: scopeAdjustment,
          contract_engine_events: nextEvents,
          explicit_composition_key: initialObjectDraft.explicitCompositionKey,
        },
      }),
    });
    if (!persistRes.ok) {
      const json = (await persistRes.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "Falha ao salvar o rascunho do contrato.");
    }

    // Se prazo de revisão foi definido ou alterado, notificar Societário e Contratos
    const prazoRevisao = draftValues.cc_prazo_revisao?.trim() ?? "";
    const savedPrazoRevisao = savedValues.cc_prazo_revisao?.trim() ?? "";
    if (prazoRevisao && prazoRevisao !== savedPrazoRevisao) {
      if (!objectComplete) {
        throw new Error(
          "Não é possível enviar o contrato para revisão. Complete o Objeto do Contrato e os escopos sem perfil.",
        );
      }
      const reviewRes = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato/review-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prazoRevisao }),
      });
      if (!reviewRes.ok) {
        const json = (await reviewRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Não foi possível enviar o contrato para revisão.");
      }
    }

    setSavedValues({ ...draftValues });
    setSavedTemplateId(selectedTemplateId);
    setSavedSelectedClauses([...draftSelectedClauses]);
    setSavedPins([...draftPins]);
    setSavedObjectFields({ ...objectFields });
    setSavedObjectOverrides([...objectOverrides]);
    setSavedScopeAdjustment(scopeAdjustment);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveFeedback(null);
    try {
      await persistAllFields();
      setSaveFeedback("Rascunho salvo com sucesso.");
      await onRefresh();
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setSaveError(null);
    setSaveFeedback(null);
    try {
      await persistAllFields();
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(lead.id)}/contrato/generate-docx`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: selectedTemplateId }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? "Contrato.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSaveFeedback("Contrato gerado e baixado.");
      await onRefresh();
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao gerar contrato.");
    } finally {
      setGenerating(false);
    }
  }

  function handleCloseAttempt() {
    if (isDirty) {
      setConfirmClose(true);
    } else {
      onOpenChange(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* modal=false + onOpenChange no-op: the dialog is only closeable via the X button.
          This prevents Radix DismissableLayer from closing the dialog when Base UI Select
          portals (rendered outside the Dialog DOM) receive focus or pointer events. */}
      <Dialog modal={false} open={open} onOpenChange={() => undefined}>
        <DialogContent
          hideCloseButton
          onPointerDownOutside={(event) => {
            // Bloqueia dismiss (incl. portal Base UI Select); fechar só pelo X
            event.preventDefault();
          }}
          onFocusOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCloseAttempt();
          }}
          className={cn(
            "flex flex-col gap-0 p-0",
            "fixed left-[50%] top-[50%] z-[110]",
            "w-[98vw] max-w-[98vw] h-[95vh]",
            "translate-x-[-50%] translate-y-[-50%]",
            "rounded-2xl border border-white/30 bg-white shadow-2xl",
            "overflow-hidden",
          )}
        >
          {/* ── Header ── */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#0b1724] px-5 py-4 text-white sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-teal/20 text-accent-teal">
                  <PenLine className="size-4" aria-hidden />
                </span>
                <DialogTitle className="text-base font-extrabold tracking-[-0.02em] text-white">
                  Elaborar Contrato
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Edição do contrato herdado automaticamente da proposta aprovada.
                </DialogDescription>
                {isDirty ? (
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Não salvo
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 border-white/25 bg-white/15 text-white shadow-sm backdrop-blur hover:bg-white/20"
                disabled={saving || generating}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Save className="size-3.5" aria-hidden />
                )}
                Salvar
              </Button>

              <Button
                type="button"
                variant="teal"
                size="sm"
                className="h-9 gap-1.5"
                disabled={generating || saving}
                onClick={() => void handleGenerate()}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="size-3.5" aria-hidden />
                )}
                Gerar Word
              </Button>

              <button
                type="button"
                onClick={handleCloseAttempt}
                className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Fechar"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Feedback / erro */}
          {(saveFeedback ?? saveError) ? (
            <div
              className={cn(
                "shrink-0 px-5 py-2 text-sm font-semibold sm:px-6",
                saveError
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {saveError ?? saveFeedback}
            </div>
          ) : null}

          {/* ── Body split-pane ── */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Painel esquerdo — Formulário */}
            <aside className="crm-scrollbar w-[46%] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
              <SectionNav
                sections={[
                  { id: "section-partes", num: 1, label: "Partes", state: propostaEmpresaPrincipalNome ? "complete" : "pending" },
                  { id: "section-escopos", num: 2, label: "Escopos", state: scopesComplete ? "complete" : "pending" },
                  { id: "section-objeto", num: 3, label: "Objeto", state: objectComplete ? "complete" : "pending" },
                  { id: "section-condicoes", num: 4, label: "Condições", state: valsComplete ? "complete" : "pending" },
                  { id: "section-vigencia", num: 5, label: "Vigência", state: prazComplete || Boolean(liveBuild) ? "complete" : "pending" },
                  { id: "section-clausulas", num: 6, label: "Cláusulas", state: "neutral" },
                  { id: "section-assinaturas", num: 7, label: "Assinaturas", state: "neutral" },
                ]}
              />
              <div className="space-y-8 px-5 py-6 sm:px-6">
                {/* Seção: Partes (read-only) */}
                <FormSection id="section-partes" num={1} title="Partes" isComplete={Boolean(propostaEmpresaPrincipalNome)}>
                  {propostaEmpresaPrincipalNome ? (
                    <div className="rounded-xl border border-teal-200/60 bg-teal-50/50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent-teal/80">
                        Empresa principal
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-primary-dark">
                        {propostaEmpresaPrincipalNome}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Empresa não identificada. Verifique os dados da proposta.
                    </p>
                  )}
                </FormSection>

                <div id="section-escopos" className="scroll-mt-16">
                  <EscoposContratadosSection
                    num={2}
                    scopes={liveBuild?.data.scopes ?? []}
                    proposalAligned={!scopeAdjustment}
                    disabled={saving || generating}
                    onRequestChange={() => setAlterarEscoposOpen(true)}
                  />
                </div>

                <div id="section-objeto" className="scroll-mt-16">
                  <ObjetoContratoSection
                    num={3}
                    build={liveBuild}
                    disabled={saving || generating}
                    onFieldChange={(key, value) => {
                      setObjectFields((prev) => ({ ...prev, [key]: value }));
                      setSaveFeedback(null);
                    }}
                    onOverride={(blockStableKey, content, reason) => {
                      if (!liveBuild) return;
                      const next = applyObjectOverride({
                        object: liveBuild.data.contractObject,
                        blockStableKey,
                        overrideContent: content,
                        reason,
                        changedBy: "comercial",
                      });
                      setObjectOverrides(next.overrides);
                      setEngineEvents((prev) =>
                        appendContractEngineEvent(prev, {
                          type: "contract_object_overridden",
                          payload: { blockStableKey, reason, invalidatesReview: true },
                        }),
                      );
                      if (contratoState.reviewTask && contratoState.reviewTask.status !== "pendente") {
                        void fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato/review-task`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            status: "pendente",
                            observacao: "Revisão invalidada: objeto do contrato foi ajustado.",
                          }),
                        });
                      }
                      setSaveFeedback(null);
                    }}
                  />
                </div>

                {/* Seção: Condições comerciais */}
                <FormSection
                  id="section-condicoes"
                  num={4}
                  title="Condições Comerciais"
                  isComplete={valsComplete}
                >
                  {(SECTION_VALORES as readonly string[]).map((code) => {
                    if (!isVisible(code)) return null;
                    const f = fieldByCode[code];
                    if (!f) return null;
                    // cc_valores é obrigatório sempre que há forma de pagamento definida e
                    // ela não é "Êxito" puro (mesma regra de listContratoPendingFields) —
                    // is_required no banco é false porque a obrigatoriedade é condicional,
                    // então o asterisco precisa desse override pontual pra não ficar errado.
                    const requiredOverride =
                      code === "cc_valores"
                        ? Boolean(draftValues.cc_tipo_pagamento?.trim()) &&
                          draftValues.cc_tipo_pagamento?.trim() !== "Êxito"
                        : undefined;
                    return (
                      <CcFieldInput
                        key={code}
                        field={f}
                        value={draftValues[code] ?? ""}
                        onChange={(v) => fieldChange(code, v)}
                        disabled={saving || generating}
                        requiredOverride={requiredOverride}
                      />
                    );
                  })}
                  <InclusionToggleCard
                    item={EXITO_CONFIG}
                    fieldByCode={fieldByCode}
                    draftValues={draftValues}
                    onChange={fieldChange}
                    disabled={saving || generating}
                  />
                </FormSection>

                {/* Seção 5: Vigência e início */}
                <FormSection id="section-vigencia" num={5} title="Vigência e Início" isComplete={prazComplete || Boolean(liveBuild)}>
                  {liveBuild ? (
                    <div className="rounded-xl border border-teal-200/60 bg-teal-50/40 p-3 text-xs text-primary-dark">
                      <p>
                        <span className="font-bold">Vigência: </span>
                        {liveBuild.data.term.kind === "indefinite"
                          ? "Prazo indeterminado"
                          : liveBuild.data.term.estimateLabel || liveBuild.data.term.kind}
                      </p>
                      <p className="mt-1">
                        <span className="font-bold">Início: </span>
                        {liveBuild.data.startRule.kind === "on_signature"
                          ? "Na assinatura"
                          : liveBuild.data.startRule.kind === "on_first_payment"
                            ? "No primeiro pagamento"
                            : liveBuild.data.startRule.date || "Data definida"}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">Resolvida pelo perfil contratual ✓</p>
                    </div>
                  ) : null}
                  {(SECTION_PRAZO as readonly string[]).map((code) => {
                    const f = fieldByCode[code];
                    if (!f) return null;
                    return (
                      <CcFieldInput
                        key={code}
                        field={f}
                        value={draftValues[code] ?? ""}
                        onChange={(v) => fieldChange(code, v)}
                        disabled={saving || generating}
                      />
                    );
                  })}
                  {prazComplete && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                      <div className="flex items-start gap-2">
                        <Bell className="mt-0.5 size-3.5 shrink-0 text-blue-600" aria-hidden />
                        <p>
                          <strong>Ao salvar</strong>, a área{" "}
                          <span className="font-semibold">Societário e Contratos</span> será notificada
                          para revisar este contrato até{" "}
                          <strong>{draftValues.cc_prazo_revisao}</strong>.
                        </p>
                      </div>
                    </div>
                  )}
                </FormSection>

                {/* Seção 6: Cláusulas Adicionais */}
                <div id="section-clausulas" className="scroll-mt-16">
                  <ClausulasSection
                    available={contratoState.availableClauses ?? []}
                    selected={draftSelectedClauses}
                    onChange={setDraftSelectedClauses}
                    disabled={saving || generating}
                    engineClauseContent={engineClauseContent}
                  />
                </div>

                {/* Seção 7: Posicionar Assinaturas (rubrica/pin) */}
                <div id="section-assinaturas" className="scroll-mt-16">
                  <PinsSection
                    pins={draftPins}
                    onChange={setDraftPins}
                    pinMode={pinMode}
                    onPinModeChange={setPinMode}
                    disabled={saving || generating}
                  />
                </div>

              </div>
            </aside>

            {/* Painel direito — Preview ao vivo */}
            <main className="relative flex w-[54%] flex-1 flex-col overflow-hidden bg-slate-50">
              {/* Cabeçalho do preview */}
              <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-[#f0f9f8] px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-teal">
                <FileText className="size-3.5 shrink-0" aria-hidden />
                Preview ao vivo
                <span className="ml-1 size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              </div>

              {/* Banner: modo posicionamento ativo */}
              {pinMode ? (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-800">
                  <MapPin className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">
                    Clique na <strong>folha de assinaturas</strong> (abaixo) para posicionar{" "}
                    {pinMode.type === 1 ? "rubrica" : pinMode.type === 2 ? "carimbo" : "assinatura"}{" "}
                    de{" "}
                    <strong>
                      {BUILDER_SIGNERS.find((s) => s.key === pinMode.signerKey)?.label ?? "?"}
                    </strong>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => setPinMode(null)}
                  >
                    <X className="size-3.5" />
                    Cancelar
                  </Button>
                </div>
              ) : null}

              {/* Preview content */}
              <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto">
                <div className="bg-[radial-gradient(circle_at_top,#e8f5f3_0%,#e2eceb_36%,#d8e8e7_100%)] p-3 sm:p-4">
                  <ClickablePreview
                    page={livePreview}
                    pins={draftPins}
                    pinMode={pinMode}
                    onPlace={(x, y, pageEl) => {
                      if (!pinMode) return;
                      const rect = pageEl.getBoundingClientRect();
                      const newPin: SignaturePin = {
                        email: pinMode.signerKey,
                        page: SIGNATURE_PAGE_LAST,
                        position_x: Math.round((x / rect.width) * D4SIGN_A4_WIDTH),
                        position_y: Math.round((y / rect.height) * D4SIGN_A4_HEIGHT),
                        page_width: D4SIGN_A4_WIDTH,
                        page_height: D4SIGN_A4_HEIGHT,
                        type: pinMode.type,
                      };
                      setDraftPins((prev) => [
                        ...prev.filter(
                          (p) =>
                            !(p.email === newPin.email && (p.type ?? 0) === (newPin.type ?? 0)),
                        ),
                        newPin,
                      ]);
                      setPinMode(null);
                    }}
                  />
                </div>
              </div>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      <AlterarEscoposDialog
        open={alterarEscoposOpen}
        onOpenChange={setAlterarEscoposOpen}
        scopes={
          contratoState.proposalSnapshot
            ? resolveContractScopes(contratoState.proposalSnapshot.escopoJson)
            : (contratoState.engine?.data.scopes ?? [])
        }
        current={scopeAdjustment}
        onConfirm={(adjustment) => {
          const removed = new Set(adjustment.removedEntryIds);
          const prevRemoved = new Set(scopeAdjustment?.removedEntryIds ?? []);
          let events = engineEvents;
          for (const id of removed) {
            if (!prevRemoved.has(id)) {
              events = appendContractEngineEvent(events, {
                type: "contract_scope_removed_from_object",
                payload: { entryId: id, reason: adjustment.reason },
              });
            }
          }
          for (const id of prevRemoved) {
            if (!removed.has(id)) {
              events = appendContractEngineEvent(events, {
                type: "contract_scope_added_to_object",
                payload: { entryId: id, reason: adjustment.reason },
              });
            }
          }
          setEngineEvents(events);
          setScopeAdjustment(adjustment);
          setSaveFeedback(null);
        }}
      />

      {/* Confirmação de descarte — z acima do builder (z-[110]) */}
      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent overlayClassName="z-[120]" className="z-[130]">
          <AlertDialogHeader>
            <AlertDialogTitle>Há alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados preenchidos ainda não foram salvos. Deseja descartar as alterações e
              fechar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmClose(false)}>
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmClose(false);
                onOpenChange(false);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Descartar e fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── D4Sign — status por tipo_post ───────────────────────────────────────────

const D4SIGN_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  sent:       { label: "Enviado para assinatura", color: "text-blue-700 bg-blue-50 border-blue-200" },
  "2":        { label: "Documento visualizado",   color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  "3":        { label: "Assinado por um signatário", color: "text-amber-700 bg-amber-50 border-amber-200" },
  "1":        { label: "Assinado por todos ✓",    color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  "4":        { label: "Cancelado",               color: "text-rose-700 bg-rose-50 border-rose-200" },
};

type FirmSignerRow = {
  email: string;
  name: string;
  oab: string;
  foreign: "0" | "1";
};

type ContratanteSignerRow = {
  /** id local apenas para a chave do React */
  id: string;
  name: string;
  email: string;
  /** "0" = CPF brasileiro, "1" = estrangeiro / sem CPF */
  foreign: "0" | "1";
};

function D4SignSendSection({
  lead,
  pending,
  reviewTask,
  onRefresh,
  appUsersByEmail = {},
}: {
  lead: LeadDetailData;
  pending: ContratoPendingField[];
  reviewTask: ContratoState["reviewTask"];
  onRefresh: () => Promise<void>;
  appUsersByEmail?: Record<string, { avatarUrl: string | null; fullName: string }>;
}) {
  const router = useRouter();
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  const alreadySent = Boolean(lead.d4signDocumentUuid);
  const isSigned = lead.d4signStatus === "1";

  const reviewApproved = isContractReviewApproved(reviewTask);
  const reviewBlockReason = getContractSendBlockReason(reviewTask);
  const canSend = canSendContractToD4Sign({
    reviewTask,
    pendingFieldCount: pending.length,
  });
  const formLocked = !isSigned && !reviewApproved;

  // ── Firm signers (CONTRATADA) — vindos do servidor ─────────────────────
  const [firmSigners, setFirmSigners] = useState<FirmSignerRow[]>([]);
  const [includeFirmSigners, setIncludeFirmSigners] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/crm/d4sign/firm-signers", { cache: "no-store" });
        const json = (await res.json()) as { ok?: boolean; data?: FirmSignerRow[] };
        if (active && res.ok && json.ok && Array.isArray(json.data)) {
          setFirmSigners(json.data);
        }
      } catch {
        /* mantém vazio */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ── CONTRATANTE signers (cliente) — pré-preenchido com ponto focal do lead ─
  const [contratantes, setContratantes] = useState<ContratanteSignerRow[]>(() => {
    const focalNome = lead.pipelineFields.find((f) => f.fieldCode === "cp_nome_focal")?.value ?? "";
    const focalEmail = lead.pipelineFields.find((f) => f.fieldCode === "cp_email_focal")?.value ?? "";
    return [
      {
        id: `c-${Math.random().toString(36).slice(2, 8)}`,
        name: focalNome,
        email: focalEmail,
        foreign: "0",
      },
    ];
  });

  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ linkContrato: string | null; documentUuid: string } | null>(null);

  const statusInfo = lead.d4signStatus ? (D4SIGN_STATUS_LABELS[lead.d4signStatus] ?? null) : null;

  function addContratante() {
    setContratantes((prev) => [
      ...prev,
      { id: `c-${Math.random().toString(36).slice(2, 8)}`, name: "", email: "", foreign: "0" },
    ]);
  }
  function removeContratante(id: string) {
    setContratantes((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function updateContratante(id: string, patch: Partial<ContratanteSignerRow>) {
    setContratantes((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleSend() {
    if (!canSend) {
      setSendError(reviewBlockReason ?? "Revisão do contrato pendente.");
      return;
    }
    // Valida CONTRATANTE
    const cleaned = contratantes
      .map((r) => ({ ...r, email: r.email.trim() }))
      .filter((r) => r.email.length > 0);
    if (cleaned.length === 0) {
      setSendError("Informe pelo menos um signatário CONTRATANTE.");
      return;
    }
    const invalid = cleaned.find((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
    if (invalid) {
      setSendError(`E-mail inválido: ${invalid.email}`);
      return;
    }
    // Valida que pelo menos um signatário existe (firma OU cliente)
    if (!includeFirmSigners && cleaned.length === 0) {
      setSendError("Inclua pelo menos um signatário (firma ou cliente).");
      return;
    }

    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(lead.id)}/contrato/send-d4sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            includeFirmSigners,
            signers: cleaned.map((r) => ({
              email: r.email,
              foreign: r.foreign,
              role: "CONTRATANTE",
              ...(r.name.trim() ? { name: r.name.trim() } : {}),
            })),
            message: message.trim() || undefined,
          }),
        },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        documentUuid?: string;
        linkContrato?: string | null;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Erro ${res.status}`);
      }
      setSendResult({ linkContrato: json.linkContrato ?? null, documentUuid: json.documentUuid ?? "" });
      await onRefresh();
      router.refresh();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erro ao enviar para D4Sign.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
        <span className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          isSigned ? "bg-emerald-100 text-emerald-700" : alreadySent ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500",
        )}>
          {isSigned ? <CheckCircle2 className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}
        </span>
        <div>
          <p className="text-sm font-bold text-primary-dark">Assinatura Digital — D4Sign</p>
          {statusInfo ? (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", statusInfo.color)}>
              {statusInfo.label}
            </span>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {reviewApproved
                ? "Revisão aprovada — pronto para enviar à D4Sign"
                : "Envio liberado após ok da área Societário e Contratos"}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Já enviado: mostrar info + link + signatários */}
        {alreadySent && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
            {/* UUID */}
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                UUID do documento D4Sign
              </p>
              <p className="font-mono text-xs text-slate-700 break-all">{lead.d4signDocumentUuid}</p>
            </div>

            {/* Ações: ver PDF + link de assinatura */}
            <div className="flex flex-wrap gap-2">
              {lead.d4signDocumentUuid ? (
                <button
                  type="button"
                  onClick={() => setViewDialogOpen(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
                >
                  <Eye className="size-3" aria-hidden />
                  Ver contrato
                </button>
              ) : null}
              {(lead.linkContrato ?? sendResult?.linkContrato) ? (
                <a
                  href={(lead.linkContrato ?? sendResult?.linkContrato)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  Link de assinatura
                </a>
              ) : null}
            </div>

            {/* Signatários — agrupados por papel */}
            {lead.d4signSigners && lead.d4signSigners.length > 0 ? (
              <SignersStatusList signers={lead.d4signSigners} appUsersByEmail={appUsersByEmail} />
            ) : null}
          </div>
        )}

        {/* Resultado de envio recente */}
        {sendResult && !alreadySent && sendResult.linkContrato && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-700">
              ✓ Contrato enviado com sucesso. Link de assinatura primário:
            </p>
            <a
              href={sendResult.linkContrato}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
            >
              <ExternalLink className="size-3" aria-hidden />
              Abrir link
            </a>
          </div>
        )}

        {/* Revisão Societário — gate de envio */}
        {!isSigned && !reviewApproved && reviewBlockReason ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 space-y-2">
            <div className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 size-4 shrink-0 text-blue-700" aria-hidden />
              <div>
                <p className="text-xs font-bold text-blue-900">Envio bloqueado — revisão pendente</p>
                <p className="mt-1 text-xs text-blue-800/90">{reviewBlockReason}</p>
                {reviewTask ? (
                  <p className="mt-2 text-[10px] font-semibold text-blue-700/80">
                    Status:{" "}
                    {reviewTask.status === "pendente"
                      ? "Aguardando revisão"
                      : reviewTask.status === "em_revisao"
                        ? "Em revisão"
                        : "Concluída"}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {!isSigned && reviewApproved ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
            <p className="text-xs font-semibold text-emerald-800">
              Revisão Societário e Contratos concluída — envio liberado.
            </p>
          </div>
        ) : null}

        {/* Pendências bloqueando envio */}
        {pending.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">
              Preencha os campos pendentes no builder antes de enviar:
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-600">
              {pending.slice(0, 4).map((p) => (
                <li key={p.label} className="flex items-center gap-1.5">
                  <TriangleAlert className="size-3 shrink-0" aria-hidden />
                  {p.label}
                </li>
              ))}
              {pending.length > 4 && <li>+ {pending.length - 4} campos</li>}
            </ul>
          </div>
        )}

        {/* Formulário de envio */}
        {!isSigned && (
          <div className="space-y-4">
            {/* ── CONTRATADA (sócios da firma) ─────────────────────────── */}
            <div
              className={cn(
                "rounded-xl border border-teal-200 bg-teal-50/50 p-3.5",
                formLocked && "opacity-60",
              )}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-700">
                    CONTRATADA · sócios administradores
                  </p>
                  <p className="text-[10px] text-teal-900/60">
                    Assinam todo contrato em nome de Bismarchi | Pires.
                  </p>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-teal-800">
                  <input
                    type="checkbox"
                    checked={includeFirmSigners}
                    onChange={(e) => setIncludeFirmSigners(e.target.checked)}
                    disabled={sending || formLocked}
                    className="size-3.5 rounded border-teal-400 text-teal-600"
                  />
                  Incluir
                </label>
              </div>
              {firmSigners.length === 0 ? (
                <p className="text-xs text-muted-foreground">Carregando signatários da firma…</p>
              ) : (
                <ul className={cn("space-y-1.5", !includeFirmSigners && "opacity-50")}>
                  {firmSigners.map((s) => (
                    <li
                      key={s.email}
                      className="flex items-center gap-2.5 rounded-lg border border-teal-200 bg-white px-3 py-2"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-black text-teal-700">
                        {s.name
                          .split(/\s+/)
                          .map((p) => p[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-primary-dark">{s.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {s.email}
                          {s.oab ? <span className="ml-2 text-teal-700">· {s.oab}</span> : null}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── CONTRATANTE (cliente) ────────────────────────────────── */}
            <div
              className={cn(
                "rounded-xl border border-amber-200 bg-amber-50/40 p-3.5",
                formLocked && "opacity-60",
              )}
            >
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-800">
                    CONTRATANTE · cliente
                  </p>
                  <p className="text-[10px] text-amber-900/60">
                    {lead.pipelineFields.some((f) => f.fieldCode === "cp_email_focal" && f.value)
                      ? "Pré-preenchido com o ponto focal do lead — edite se necessário."
                      : "Informe o e-mail de quem assina pelo cliente. Adicione mais de um se necessário."}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[11px] font-semibold"
                  onClick={addContratante}
                  disabled={sending || formLocked}
                >
                  <Plus className="size-3" aria-hidden />
                  Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {contratantes.map((row, idx) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-amber-200 bg-white px-2.5 py-2 space-y-1.5"
                  >
                    {/* Linha: número + nome + botão remover */}
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-black text-amber-700">
                        {idx + 1}
                      </span>
                      <Input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateContratante(row.id, { name: e.target.value })}
                        disabled={sending || formLocked}
                        placeholder="Nome completo do signatário"
                        className="h-8 flex-1 border-slate-200 bg-white text-xs"
                      />
                      {contratantes.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeContratante(row.id)}
                          disabled={sending || formLocked}
                          className="flex size-7 shrink-0 items-center justify-center rounded border border-rose-200 text-rose-500 hover:border-rose-300 hover:bg-rose-50 disabled:opacity-30"
                          aria-label="Remover"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    {/* Linha: email + tipo documento */}
                    <div className="flex items-center gap-2 pl-8">
                      <Input
                        type="email"
                        value={row.email}
                        onChange={(e) => updateContratante(row.id, { email: e.target.value })}
                        disabled={sending || formLocked}
                        placeholder="email@empresa.com"
                        className="h-8 flex-1 border-slate-200 bg-white text-xs"
                      />
                      <Select
                        value={row.foreign}
                        onValueChange={(v) => {
                          if (v === "0" || v === "1") updateContratante(row.id, { foreign: v });
                        }}
                        disabled={sending || formLocked}
                      >
                        <SelectTrigger className="h-8 w-[88px] border-slate-200 bg-white text-[11px]">
                          <span>{row.foreign === "0" ? "CPF BR" : "Sem CPF"}</span>
                        </SelectTrigger>
                        <CrmSelectContent className="max-h-[min(280px,50dvh)]">
                          <CrmSelectItem value="0">CPF brasileiro</CrmSelectItem>
                          <CrmSelectItem value="1">Sem CPF / estrangeiro</CrmSelectItem>
                        </CrmSelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Mensagem opcional ────────────────────────────────────── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-primary-dark">
                Mensagem (opcional)
              </Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending || formLocked}
                placeholder="Mensagem que vai no e-mail da D4Sign…"
                className="h-10 border-slate-200 bg-white text-sm"
              />
            </div>

            {sendError && (
              <p className="text-xs font-semibold text-rose-600">{sendError}</p>
            )}

            <Button
              type="button"
              variant="teal"
              size="sm"
              className="h-10 w-full gap-2 text-sm font-bold"
              disabled={sending || !canSend}
              onClick={() => void handleSend()}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              {sending
                ? "Gerando e enviando…"
                : alreadySent
                  ? "Reenviar para assinatura"
                  : "Enviar para assinatura D4Sign"}
            </Button>
            <p className="text-[10px] text-muted-foreground text-center">
              O contrato será gerado automaticamente e enviado para todos os signatários listados.
              {alreadySent ? " Um novo envio substituirá o documento anterior." : ""}
            </p>
          </div>
        )}
      </div>

      {/* View dialog — visualizar PDF do contrato */}
      {lead.d4signDocumentUuid ? (
        <D4SignViewDialog
          open={viewDialogOpen}
          onOpenChange={setViewDialogOpen}
          documentUuid={lead.d4signDocumentUuid}
        />
      ) : null}
    </div>
  );
}

// ─── Lista de signatários (com agrupamento por papel) ─────────────────────────

function SignersStatusList({
  signers,
  appUsersByEmail = {},
}: {
  signers: NonNullable<LeadDetailData["d4signSigners"]>;
  appUsersByEmail?: Record<string, { avatarUrl: string | null; fullName: string }>;
}) {
  const totalSigned = signers.filter((s) => s.signed).length;
  const contratada = signers.filter((s) => s.role === "CONTRATADA");
  const contratante = signers.filter((s) => s.role !== "CONTRATADA");

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Signatários&nbsp;
        <span className="normal-case font-normal text-slate-400">
          ({totalSigned}/{signers.length} assinaram)
        </span>
      </p>

      {contratada.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-teal-700">
            CONTRATADA
          </p>
          <ul className="space-y-1.5">
            {contratada.map((s) => (
              <SignerRow key={s.email} signer={s} accent="teal" appUsersByEmail={appUsersByEmail} />
            ))}
          </ul>
        </div>
      ) : null}

      {contratante.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-amber-800">
            CONTRATANTE
          </p>
          <ul className="space-y-1.5">
            {contratante.map((s) => (
              <SignerRow key={s.email} signer={s} accent="amber" appUsersByEmail={appUsersByEmail} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function signerInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function SignerRow({
  signer,
  accent,
  appUsersByEmail = {},
}: {
  signer: NonNullable<LeadDetailData["d4signSigners"]>[number];
  accent: "teal" | "amber";
  appUsersByEmail?: Record<string, { avatarUrl: string | null; fullName: string }>;
}) {
  const displayName = signer.name?.trim() || null;
  const initials = signerInitials(displayName, signer.email);
  const signedDate = signer.signed_at
    ? new Date(signer.signed_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : null;
  const appUser = signer.email ? appUsersByEmail[signer.email.toLowerCase()] : undefined;

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5",
        signer.signed
          ? "border-emerald-200"
          : accent === "teal" ? "border-teal-200" : "border-amber-200",
      )}
    >
      {/* Avatar */}
      {appUser?.avatarUrl ? (
        <img
          src={appUser.avatarUrl}
          alt={displayName ?? signer.email ?? ""}
          className="size-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
          signer.signed
            ? "bg-emerald-100 text-emerald-700"
            : accent === "teal" ? "bg-teal-100 text-teal-700" : "bg-amber-100 text-amber-700",
        )}>
          {initials}
        </span>
      )}

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-primary-dark leading-tight">
          {displayName ?? signer.email}
        </p>
        {displayName ? (
          <p className="truncate text-[10px] text-muted-foreground leading-tight">{signer.email}</p>
        ) : null}
        <p className={cn(
          "text-[10px] font-semibold leading-tight mt-0.5",
          signer.signed ? "text-emerald-600" : "text-amber-600",
        )}>
          {signer.signed
            ? signedDate ? `✓ Assinou em ${signedDate}` : "✓ Assinou"
            : "⏳ Aguardando assinatura"}
        </p>
      </div>

      {/* Badge de status */}
      <span className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold",
        signer.signed
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-400",
      )}>
        {signer.signed ? "Assinou" : "Pendente"}
      </span>
    </li>
  );
}

// ─── Seção: Áreas de Atuação ─────────────────────────────────────────────────

function InclusionToggleCard({
  item,
  fieldByCode,
  draftValues,
  onChange,
  disabled,
}: {
  item: InclusionToggle;
  fieldByCode: Record<string, CcFieldDef>;
  draftValues: Record<string, string>;
  onChange: (code: string, value: string) => void;
  disabled?: boolean;
}) {
  const isIncluded = draftValues[item.toggleCode]?.trim() === "Sim";
  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        isIncluded ? "border-teal-200 bg-teal-50/50" : "border-slate-200 bg-white",
      )}
    >
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={isIncluded}
            disabled={disabled}
            onChange={(e) => onChange(item.toggleCode, e.target.checked ? "Sim" : "Não")}
          />
          <div
            className={cn(
              "flex size-5 items-center justify-center rounded-md border-2 transition-colors",
              isIncluded ? "border-teal-500 bg-teal-500" : "border-slate-300 bg-white",
            )}
          >
            {isIncluded && <Check className="size-3 text-white" aria-hidden />}
          </div>
        </div>
        <span
          className={cn(
            "flex-1 text-sm font-semibold",
            isIncluded ? "text-teal-900" : "text-slate-600",
          )}
        >
          {item.label}
        </span>
        {isIncluded ? (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            Incluído
          </span>
        ) : null}
      </label>
      {isIncluded && item.detailCodes.length > 0 ? (
        <div className="space-y-3 border-t border-teal-100 px-4 pb-4 pt-3">
          {item.detailCodes.map((code) => {
            const f = fieldByCode[code];
            if (!f) return null;
            return (
              <CcFieldInput
                key={code}
                field={f}
                value={draftValues[code] ?? ""}
                onChange={(v) => onChange(code, v)}
                disabled={disabled}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ─── Card: Tarefa de Revisão ──────────────────────────────────────────────────

type ReviewTask = NonNullable<ContratoState["reviewTask"]>;

const REVIEW_STATUS_CFG: Record<
  ReviewTask["status"],
  { label: string; color: string; bg: string; border: string }
> = {
  pendente:    { label: "Aguardando revisão", color: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
  em_revisao:  { label: "Em revisão",          color: "text-blue-700",   bg: "bg-blue-50",   border: "border-blue-200"   },
  concluido:   { label: "Revisão concluída ✓", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

function ReviewTaskCard({
  reviewTask,
  leadId,
  onRefresh,
}: {
  reviewTask: ContratoState["reviewTask"];
  leadId: string;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  if (!reviewTask) return null;

  const cfg = REVIEW_STATUS_CFG[reviewTask.status];
  const prazoDate = reviewTask.prazo_revisao
    ? new Date(reviewTask.prazo_revisao)
    : null;
  const prazoStr = prazoDate
    ? prazoDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;
  const hoje = new Date();
  const diasRestantes = prazoDate
    ? Math.ceil((prazoDate.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const atrasado = diasRestantes !== null && diasRestantes < 0 && reviewTask.status !== "concluido";

  async function updateStatus(status: ReviewTask["status"]) {
    setUpdating(true);
    try {
      await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/contrato/review-task`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await onRefresh();
      router.refresh();
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden shadow-sm",
        cfg.border,
        cfg.bg,
      )}
    >
      <div className="flex items-center gap-3 border-b border-current/10 px-5 py-3.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg",
            reviewTask.status === "concluido"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700",
          )}
        >
          <ClipboardList className="size-4" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-primary-dark">Revisão do Contrato — Societário e Contratos</p>
          <span className={cn("text-[11px] font-semibold", cfg.color)}>{cfg.label}</span>
        </div>
        {reviewTask.notificado_em && (
          <span className="flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            <Bell className="size-2.5" />
            Notificado
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {prazoStr && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Prazo</p>
              <p className={cn("text-sm font-bold", atrasado ? "text-rose-600" : "text-primary-dark")}>
                {prazoStr}
                {diasRestantes !== null && reviewTask.status !== "concluido" && (
                  <span className={cn("ml-2 text-xs font-normal", atrasado ? "text-rose-500" : "text-muted-foreground")}>
                    {atrasado ? `${Math.abs(diasRestantes)}d atrasado` : diasRestantes === 0 ? "hoje" : `${diasRestantes}d restantes`}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {reviewTask.observacao && (
          <p className="text-xs text-slate-600 border-l-2 border-slate-300 pl-3">
            {reviewTask.observacao}
          </p>
        )}

        {/* Ações de revisão */}
        {reviewTask.status !== "concluido" && (
          <div className="flex flex-wrap gap-2">
            {reviewTask.status === "pendente" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs"
                disabled={updating}
                onClick={() => void updateStatus("em_revisao")}
              >
                {updating ? <Loader2 className="size-3 animate-spin" /> : <ClipboardList className="size-3" />}
                Iniciar revisão
              </Button>
            )}
            {reviewTask.status === "em_revisao" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs"
                disabled={updating}
                onClick={() => void updateStatus("concluido")}
              >
                {updating ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                Marcar como concluído
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Seção de cláusulas adicionais ───────────────────────────────────────────

// ─── Agrupamento de cláusulas pela estrutura do contrato ─────────────────────

/** Sem `role` reconhecido (ou cláusula legada sem template correspondente na
 * biblioteca atual — ex.: fragmento salvo antes do motor de Objeto existir). */
const CLAUSE_FALLBACK_SECTION_TITLE = "OUTRAS / SEM VÍNCULO COM A BIBLIOTECA ATUAL";

/** "Objeto" e "Preço/Pagamento" são gerados automaticamente pelo motor a partir
 * do escopo contratado (`data.sections`) — cláusula adicionada manualmente aqui
 * NÃO se funde com esse texto; vira um bloco redundante à parte. Diferente de
 * "Objetos Excluídos" (ver `EXCLUSION_MERGE_SECTION_TITLE` abaixo), que se junta
 * automaticamente. */
const ENGINE_CONTROLLED_SECTION_TITLES = new Set([
  "OBJETO DO CONTRATO",
  "PREÇO E FORMA DE PAGAMENTO",
]);

/** Cláusula adicionada manualmente aqui se junta como sub-item dentro da seção
 * "OBJETOS EXCLUÍDOS DO CONTRATO" do documento final (não vira cláusula solta) —
 * ver `mergeExclusionExtrasIntoObjetosExcluidos` em legacy-preview.ts. */
const EXCLUSION_MERGE_SECTION_TITLE = "OBJETOS EXCLUÍDOS DO CONTRATO";

function resolveClauseSectionTitle(role: string | null | undefined): string {
  if (!role) return CLAUSE_FALLBACK_SECTION_TITLE;
  const spec = SECTION_ORDER.find((s) => (s.roles as readonly string[]).includes(role));
  return spec?.title ?? CLAUSE_FALLBACK_SECTION_TITLE;
}

type ClauseRow = {
  id: string;
  title: string;
  /** Conteúdo do template (biblioteca) — referência para quem ainda vai adicionar. */
  templateContent: string;
  isAdded: boolean;
  selectedClause: SelectedClause | null;
  /** Motor gera esta cláusula sozinho — adicionar/remover aqui não tem efeito
   * nenhum sobre o contrato real. Cobre tanto cláusulas marcadas obrigatórias
   * no catálogo (`is_required`) quanto cláusulas que o motor já está gerando
   * pra este contrato específico a partir do escopo contratado (mesmo com
   * `is_required: false` — ex.: exclusões específicas de área). */
  isEngineControlled: boolean;
  /** Texto de verdade que o motor gerou pra esta cláusula NESTE contrato
   * (placeholders já resolvidos) — só presente quando `isEngineControlled` via
   * geração ativa; usado pro "Visualizar" somente-leitura na barra lateral.
   * `null` quando travada só pela flag `is_required` sem geração ativa agora. */
  engineContent: string | null;
  /** `isAdded` (extra manual de verdade) OU o motor já gerou esta cláusula
   * pra este contrato agora — usado pra contar/abrir o grupo por padrão.
   * Sem isso, um grupo cheio de cláusulas travadas (geradas pelo motor)
   * aparecia como "vazio" e ficava fechado, escondendo tudo. */
  isIncludedInContract: boolean;
};

type ClauseGroup = {
  title: string;
  rows: ClauseRow[];
  addedCount: number;
};

function groupClausesBySection(
  available: ClauseTemplate[],
  selected: SelectedClause[],
  engineClauseContent?: ReadonlyMap<string, string>,
): ClauseGroup[] {
  const selectedById = new Map(selected.map((c) => [c.id, c]));
  const availableIds = new Set(available.map((t) => t.id));
  const bySection = new Map<string, ClauseRow[]>();

  const pushRow = (sectionTitle: string, row: ClauseRow) => {
    const arr = bySection.get(sectionTitle) ?? [];
    arr.push(row);
    bySection.set(sectionTitle, arr);
  };

  for (const tpl of available) {
    const sel = selectedById.get(tpl.id) ?? null;
    const engineContent = tpl.stable_key ? engineClauseContent?.get(tpl.stable_key) ?? null : null;
    const isAdded = Boolean(sel);
    pushRow(resolveClauseSectionTitle(tpl.role), {
      id: tpl.id,
      title: tpl.title,
      templateContent: tpl.content,
      isAdded,
      selectedClause: sel,
      isEngineControlled: Boolean(tpl.is_required) || engineContent !== null,
      engineContent,
      isIncludedInContract: isAdded || engineContent !== null,
    });
  }
  // Cláusulas adicionadas cujo template não existe mais na biblioteca ativa
  // (removido/desativado no admin) — ainda precisam aparecer, com opção de remover.
  for (const sel of selected) {
    if (availableIds.has(sel.id)) continue;
    pushRow(CLAUSE_FALLBACK_SECTION_TITLE, {
      id: sel.id,
      title: sel.title,
      templateContent: sel.content,
      isAdded: true,
      selectedClause: sel,
      isEngineControlled: false,
      engineContent: null,
      isIncludedInContract: true,
    });
  }

  const orderedTitles = [...SECTION_ORDER.map((s) => s.title), CLAUSE_FALLBACK_SECTION_TITLE];
  const groups = orderedTitles
    .filter((title) => bySection.has(title))
    .map((title) => {
      const rows = bySection.get(title)!;
      return { title, rows, addedCount: rows.filter((r) => r.isIncludedInContract).length };
    });
  // Grupos com cláusula(s) já adicionada(s) primeiro — mais relevante pra quem
  // está revisando o que já foi incluído do que a ordem em que a seção aparece
  // no documento final. `.sort` é estável, então a ordem de documento é mantida
  // dentro de cada bucket (com added / sem added).
  return groups.sort((a, b) => Number(b.addedCount > 0) - Number(a.addedCount > 0));
}

function ClausulasSection({
  available,
  selected,
  onChange,
  disabled,
  engineClauseContent,
}: {
  available: ClauseTemplate[];
  selected: SelectedClause[];
  onChange: (clauses: SelectedClause[]) => void;
  disabled?: boolean;
  /** Texto de verdade (placeholders resolvidos) que o motor canônico já está
   * gerando pra este contrato agora, por chave estável — ver `liveBuild` no
   * dialog pai. Usado tanto pra travar a linha quanto pro "Visualizar". */
  engineClauseContent?: ReadonlyMap<string, string>;
}) {
  const groups = useMemo(
    () => groupClausesBySection(available, selected, engineClauseContent),
    [available, selected, engineClauseContent],
  );

  function addClause(row: ClauseRow) {
    const next: SelectedClause = {
      id: row.id,
      title: row.title,
      content: row.templateContent,
      order: selected.length,
    };
    onChange([...selected, next]);
  }

  function removeClause(id: string) {
    onChange(selected.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i })));
  }

  function updateContent(id: string, content: string) {
    onChange(selected.map((c) => (c.id === id ? { ...c, content } : c)));
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho da seção */}
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
          <BookText className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-bold tracking-[-0.01em] text-primary-dark">
          Cláusulas Adicionais
        </h3>
        {selected.length > 0 ? (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            {selected.length} adicionada{selected.length > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            Opcional
          </span>
        )}
      </div>

      <div className="ml-10 space-y-2.5">
        {available.length === 0 && selected.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma cláusula cadastrada. Acesse{" "}
            <span className="font-semibold">Admin → Cláusulas</span> para criar modelos.
          </p>
        ) : (
          groups.map((group) => (
            <ClauseGroupBlock
              key={group.title}
              group={group}
              disabled={disabled}
              onAdd={addClause}
              onRemove={removeClause}
              onUpdateContent={updateContent}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Bloco recolhível de uma seção do contrato (ex.: "OBJETOS EXCLUÍDOS DO CONTRATO"),
 * com todas as cláusulas da biblioteca que pertencem a ela — adicionadas ou não. */
function ClauseGroupBlock({
  group,
  disabled,
  onAdd,
  onRemove,
  onUpdateContent,
}: {
  group: ClauseGroup;
  disabled?: boolean;
  onAdd: (row: ClauseRow) => void;
  onRemove: (id: string) => void;
  onUpdateContent: (id: string, content: string) => void;
}) {
  const [open, setOpen] = useState(group.addedCount > 0);
  const isEngineControlled = ENGINE_CONTROLLED_SECTION_TITLES.has(group.title);
  const isExclusionMerge = group.title === EXCLUSION_MERGE_SECTION_TITLE;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronRight
          className={cn("size-3.5 shrink-0 text-slate-400 transition-transform duration-150", open && "rotate-90")}
          aria-hidden
        />
        <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-slate-600">
          {group.title}
        </span>
        {group.addedCount > 0 ? (
          <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            {group.addedCount} no contrato
          </span>
        ) : null}
        <span className="shrink-0 text-[10px] font-semibold text-slate-400">{group.rows.length}</span>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-slate-200 px-3 pb-3 pt-2.5">
          {isEngineControlled ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
              Esta seção já é gerada automaticamente pelo motor a partir do escopo contratado.
              Cláusulas adicionadas aqui viram um bloco separado no contrato — normalmente não é
              necessário adicionar nada nesta seção manualmente.
            </p>
          ) : null}
          {isExclusionMerge ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-[11px] leading-relaxed text-sky-800">
              <Check className="mt-0.5 size-3 shrink-0" aria-hidden />
              Cláusulas adicionadas aqui se juntam automaticamente à seção &ldquo;2. Objetos
              Excluídos do Contrato&rdquo; no documento final, sem repetir &ldquo;Exclusão&rdquo;
              no título.
            </p>
          ) : null}
          {group.rows.map((row) => (
            <ClauseRowItem
              key={row.id}
              row={row}
              disabled={disabled}
              onAdd={() => onAdd(row)}
              onRemove={() => onRemove(row.id)}
              onUpdateContent={(content) => onUpdateContent(row.id, content)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Uma cláusula dentro de um grupo: estado adicionada/não-adicionada, com
 * adicionar/remover, e edição de conteúdo escondida atrás de um toggle
 * (evita que a lista fique gigante quando há muitas cláusulas adicionadas). */
function ClauseRowItem({
  row,
  disabled,
  onAdd,
  onRemove,
  onUpdateContent,
}: {
  row: ClauseRow;
  disabled?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onUpdateContent: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (row.isEngineControlled) {
    // Presente de verdade no contrato AGORA (o motor já resolveu essa chave
    // pro escopo contratado) vs. só marcada obrigatória no catálogo mas sem
    // geração ativa no momento (raro — ex.: escopo ainda incompleto).
    const inContractNow = row.engineContent !== null;
    const viewContent = row.engineContent ?? row.templateContent;
    return (
      <div
        className={cn(
          "rounded-lg border p-2.5",
          inContractNow ? "border-teal-200/70 bg-teal-50/40" : "border-amber-200/70 bg-amber-50/50",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-white",
              inContractNow ? "bg-teal-500" : "bg-amber-400",
            )}
          >
            {inContractNow ? <Check className="size-2.5" aria-hidden /> : <Lock className="size-2.5" aria-hidden />}
          </span>
          <span className="flex-1 truncate text-xs font-semibold text-primary-dark">{row.title}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                  inContractNow
                    ? "border-teal-300 bg-teal-100 text-teal-800"
                    : "border-amber-300 bg-amber-100 text-amber-800",
                )}
              >
                <Lock className="size-2.5" aria-hidden />
                {inContractNow ? "No contrato atual" : "Obrigatória"}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[240px] text-center">
              {inContractNow
                ? "O motor já gerou e incluiu esta cláusula no contrato atual, a partir do escopo contratado. Não pode ser removida por aqui."
                : "Cláusula obrigatória no catálogo, mas o motor ainda não a gerou pra este contrato (escopo pode estar incompleto). Não pode ser adicionada por aqui."}
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-[11px]"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Ocultar" : "Visualizar"}
          </Button>
        </div>
        {editing ? (
          <p
            className={cn(
              "mt-2 whitespace-pre-wrap rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-600",
              inContractNow ? "border-teal-200/70" : "border-amber-200/70",
            )}
          >
            {viewContent || "—"}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-2.5",
        row.isAdded ? "border-teal-200/70 shadow-sm" : "border-slate-200",
      )}
    >
      <div className="flex items-center gap-2">
        {row.isAdded ? (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-teal-500 text-white">
            <Check className="size-2.5" aria-hidden />
          </span>
        ) : (
          <span className="size-4 shrink-0 rounded-full border-2 border-slate-300" aria-hidden />
        )}
        <span className="flex-1 truncate text-xs font-semibold text-primary-dark">{row.title}</span>
        {row.isAdded ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-[11px]"
              disabled={disabled}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Ocultar" : "Editar"}
            </Button>
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              className="flex size-6 shrink-0 items-center justify-center rounded border border-rose-200 text-rose-400 hover:border-rose-300 hover:text-rose-600 disabled:opacity-30"
              aria-label="Remover cláusula"
            >
              <X className="size-3" aria-hidden />
            </button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 gap-1 px-2 text-[11px]"
            disabled={disabled}
            onClick={onAdd}
          >
            <Plus className="size-3" aria-hidden />
            Adicionar
          </Button>
        )}
      </div>
      {row.isAdded && editing ? (
        <Textarea
          value={row.selectedClause?.content ?? ""}
          onChange={(e) => onUpdateContent(e.target.value)}
          disabled={disabled}
          placeholder="Conteúdo da cláusula…"
          className="mt-2 min-h-[90px] resize-y border-slate-200 bg-slate-50 text-xs leading-relaxed"
        />
      ) : null}
    </div>
  );
}

// ─── Seção: Posicionar Assinaturas (pins/rubrica) ─────────────────────────────

function PinsSection({
  pins,
  onChange,
  pinMode,
  onPinModeChange,
  disabled,
}: {
  pins: SignaturePin[];
  onChange: (pins: SignaturePin[]) => void;
  pinMode: { signerKey: string; type: 0 | 1 | 2 } | null;
  onPinModeChange: (mode: { signerKey: string; type: 0 | 1 | 2 } | null) => void;
  disabled?: boolean;
}) {
  function removePin(idx: number) {
    onChange(pins.filter((_, i) => i !== idx));
  }
  function clearAll() {
    onChange([]);
    onPinModeChange(null);
  }
  function getSignerLabel(email: string): string {
    return BUILDER_SIGNERS.find((s) => s.key === email)?.label ?? email;
  }
  function getSignerColor(email: string): string {
    const cfg = BUILDER_SIGNERS.find((s) => s.key === email);
    if (!cfg) return "slate";
    return cfg.color;
  }

  const pinsByRole = {
    contratada: pins.filter((p) =>
      BUILDER_SIGNERS.find((s) => s.key === p.email)?.role === "CONTRATADA"
    ),
    contratante: pins.filter((p) =>
      BUILDER_SIGNERS.find((s) => s.key === p.email)?.role === "CONTRATANTE"
    ),
  };

  return (
    <div className="space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-500">
          <MapPin className="size-3.5" aria-hidden />
        </span>
        <h3 className="text-sm font-bold tracking-[-0.01em] text-primary-dark">
          Posicionar Assinaturas
        </h3>
        {pins.length > 0 ? (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
            {pins.length} pin{pins.length > 1 ? "s" : ""}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Folha dedicada
          </span>
        )}
      </div>

      <div className="ml-10 space-y-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          As assinaturas ficam sempre na <strong>última página</strong> do PDF (folha dedicada).
          Use o botão abaixo para aplicar a posição padrão ou clique na folha de assinaturas no preview.
        </p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 border-teal-200 text-[11px] text-teal-800"
          disabled={disabled}
          onClick={() => onChange(buildDefaultSignaturePins())}
        >
          <MapPin className="size-3" />
          Aplicar posição padrão
        </Button>

        {/* Botões por signatário */}
        <div className="space-y-1.5">
          {BUILDER_SIGNERS.map((signer) => {
            const isActiveAssin =
              pinMode?.signerKey === signer.key && pinMode.type === 0;
            const isActiveRubr =
              pinMode?.signerKey === signer.key && pinMode.type === 1;
            return (
              <div
                key={signer.key}
                className={cn(
                  "flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5",
                  signer.color === "teal" && "border-teal-200",
                  signer.color === "emerald" && "border-emerald-200",
                  signer.color === "amber" && "border-amber-200",
                )}
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-full",
                    signer.color === "teal" && "bg-teal-500",
                    signer.color === "emerald" && "bg-emerald-500",
                    signer.color === "amber" && "bg-amber-500",
                  )}
                />
                <span className="flex-1 text-[12px] font-semibold text-slate-700">
                  {signer.label}
                  <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {signer.role}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={isActiveAssin ? "default" : "outline"}
                  className={cn(
                    "h-7 gap-1 px-2 text-[10px]",
                    isActiveAssin && "bg-accent-teal text-white",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    onPinModeChange(
                      isActiveAssin ? null : { signerKey: signer.key, type: 0 },
                    )
                  }
                >
                  <PenLine className="size-2.5" />
                  Assinatura
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={isActiveRubr ? "default" : "outline"}
                  className={cn(
                    "h-7 gap-1 px-2 text-[10px]",
                    isActiveRubr && "bg-accent-teal text-white",
                  )}
                  disabled={disabled}
                  onClick={() =>
                    onPinModeChange(
                      isActiveRubr ? null : { signerKey: signer.key, type: 1 },
                    )
                  }
                >
                  <MapPin className="size-2.5" />
                  Rubrica
                </Button>
              </div>
            );
          })}
        </div>

        {/* Lista de pins colocados */}
        {pins.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Pins posicionados
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-[10px] text-rose-600 hover:text-rose-700"
                disabled={disabled}
                onClick={clearAll}
              >
                <Trash2 className="size-2.5" />
                Limpar tudo
              </Button>
            </div>
            {(["contratada", "contratante"] as const).map((roleKey) => {
              const list = pinsByRole[roleKey];
              if (list.length === 0) return null;
              return (
                <div key={roleKey} className="space-y-1">
                  {list.map((pin) => {
                    const idx = pins.indexOf(pin);
                    const color = getSignerColor(pin.email);
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2 py-1",
                          color === "teal" && "border-teal-200 bg-teal-50/60",
                          color === "emerald" && "border-emerald-200 bg-emerald-50/60",
                          color === "amber" && "border-amber-200 bg-amber-50/60",
                        )}
                      >
                        <span className="text-[10px] font-bold text-slate-600">
                          {pin.type === 1 ? "🖋" : pin.type === 2 ? "🔖" : "✍️"}
                        </span>
                        <span className="flex-1 text-[11px] font-semibold text-slate-700">
                          {getSignerLabel(pin.email)}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          última p. ({pin.position_x},{pin.position_y})
                        </span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-500"
                          disabled={disabled}
                          onClick={() => removePin(idx)}
                          aria-label="Remover pin"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Preview clicável — corpo + folha de assinaturas dedicada ─────────────────

function ClickablePreview({
  page,
  pins,
  pinMode,
  onPlace,
}: {
  page: ContratoDocumentPagePreview;
  pins: SignaturePin[];
  pinMode: { signerKey: string; type: 0 | 1 | 2 } | null;
  onPlace: (relX: number, relY: number, pageEl: HTMLDivElement) => void;
}) {
  function handleSignatureClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode) return;
    e.stopPropagation();
    onPlace(
      e.clientX - e.currentTarget.getBoundingClientRect().left,
      e.clientY - e.currentTarget.getBoundingClientRect().top,
      e.currentTarget,
    );
  }

  const signaturePins = pins.filter(isSignaturePagePin);

  return (
    <div className="mx-auto max-w-[794px] space-y-4">
      {/* Corpo do contrato — paginado por altura medida (somente leitura) */}
      <ContratoBodyPages page={page} />

      {/* Folha de assinaturas — pins D4Sign */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-teal-700">
          Folha de assinaturas — última página do PDF
        </p>
        <div
          className={cn(
            "relative",
            pinMode &&
              "cursor-crosshair ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent",
          )}
          onClick={handleSignatureClick}
        >
          <ContratoSignaturePageDocument page={page} />
          <div className="pointer-events-none absolute inset-0">
            {signaturePins.map((pin, i) => {
              const signerCfg = BUILDER_SIGNERS.find((s) => s.key === pin.email);
              const color = signerCfg?.color ?? "slate";
              const xPct = (pin.position_x / pin.page_width) * 100;
              const yPct = (pin.position_y / pin.page_height) * 100;
              return (
                <div
                  key={i}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  title={`${signerCfg?.label ?? pin.email} — ${pin.type === 1 ? "rubrica" : pin.type === 2 ? "carimbo" : "assinatura"}`}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-md border-2 border-dashed px-2 py-0.5 shadow-sm",
                      color === "teal" && "border-teal-500 bg-teal-100/90",
                      color === "emerald" && "border-emerald-500 bg-emerald-100/90",
                      color === "amber" && "border-amber-500 bg-amber-100/90",
                    )}
                  >
                    <MapPin
                      className={cn(
                        "size-3",
                        color === "teal" && "text-teal-700",
                        color === "emerald" && "text-emerald-700",
                        color === "amber" && "text-amber-700",
                      )}
                    />
                    <span
                      className={cn(
                        "text-[9px] font-bold uppercase tracking-wide",
                        color === "teal" && "text-teal-800",
                        color === "emerald" && "text-emerald-800",
                        color === "amber" && "text-amber-800",
                      )}
                    >
                      {pin.type === 1 ? "rubrica" : pin.type === 2 ? "carimbo" : "assinatura"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Seção do formulário ──────────────────────────────────────────────────────

// ─── Índice fixo de seções (navegação rápida no painel esquerdo) ─────────────

type NavSectionState = "complete" | "pending" | "neutral";

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function SectionNav({
  sections,
}: {
  sections: Array<{ id: string; num: number; label: string; state: NavSectionState }>;
}) {
  return (
    <div className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-5 py-2 backdrop-blur sm:px-6">
      {sections.map((s) => (
        <button
          key={s.id}
          type="button"
          title={s.label}
          onClick={() => scrollToSection(s.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors",
            s.state === "complete"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : s.state === "pending"
                ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
          )}
        >
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-full text-[9px]",
              s.state === "complete"
                ? "bg-emerald-600 text-white"
                : s.state === "pending"
                  ? "bg-amber-500 text-white"
                  : "bg-slate-300 text-white",
            )}
          >
            {s.state === "complete" ? <Check className="size-2.5" aria-hidden /> : s.num}
          </span>
          <span className="hidden md:inline">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function FormSection({
  id,
  num,
  title,
  isComplete,
  children,
}: {
  id?: string;
  num: number;
  title: string;
  isComplete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-16 space-y-3">
      <SectionHeading num={num} title={title} complete={isComplete} />
      <div className="ml-10 space-y-4">{children}</div>
    </div>
  );
}

// ─── Input de campo cc_* ──────────────────────────────────────────────────────

/** Dicas de preenchimento por código de campo — evita repetir a própria label como placeholder. */
const CC_FIELD_PLACEHOLDER_HINTS: Record<string, string> = {
  cc_valores: "Ex.: R$ 2.000,00/mês",
  cc_tipo_pagamento: "Ex.: Boleto mensal, dia 10",
  cc_prazo_revisao: "Data limite para o Societário revisar",
  cc_prazo_confeccao: "Prazo para elaboração do contrato",
  cc_exito_percentual: "Ex.: 10% sobre o proveito econômico",
  cc_exito_areas: "Áreas em que o êxito se aplica",
  cc_trabalhista_limite_acoes: "Quantidade de ações inclusas no pacote",
  cc_trabalhista_horas_consultivas: "Ex.: 10 horas/mês",
  cc_civel_limite_processos: "Quantidade de processos inclusos no pacote",
  cc_civel_horas_consultivas: "Ex.: 10 horas/mês",
  cc_contratual_horas_mensais: "Ex.: 10 horas/mês",
  cc_tributario_limite_acoes: "Quantidade de ações inclusas no pacote",
  cc_objeto: "Descrição livre do objeto contratado",
};

function ccFieldPlaceholder(field: CcFieldDef, label: string): string {
  return CC_FIELD_PLACEHOLDER_HINTS[field.fieldCode] ?? `Preencha: ${label.toLowerCase()}`;
}

function CcFieldInput({
  field,
  value,
  onChange,
  disabled,
  requiredOverride,
}: {
  field: CcFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Sobrepõe `field.required` quando a obrigatoriedade é condicional (não fixa no banco). */
  requiredOverride?: boolean;
}) {
  const label = field.label.replace(" [CC]", "");
  const isRequired = requiredOverride ?? field.required;
  const labelNode = (
    <Label className="flex items-center gap-1 text-xs font-medium text-primary-dark">
      {label}
      {isRequired ? <span className="text-rose-500" aria-hidden>*</span> : null}
      {isRequired ? <span className="sr-only"> (obrigatório)</span> : null}
    </Label>
  );

  if (field.fieldType === "select" && Array.isArray(field.fieldOptions)) {
    return (
      <div className="space-y-1.5">
        {labelNode}
        <Select value={value} onValueChange={(v) => { if (v) onChange(v); }} disabled={disabled}>
          <SelectTrigger className="h-10 border-slate-200 bg-white text-sm">
            <CrmSelectValue value={value} placeholder="Selecionar..." />
          </SelectTrigger>
          <CrmSelectContent className="max-h-[min(280px,50dvh)]">
            {field.fieldOptions.map((opt) => (
              <CrmSelectItem key={opt} value={opt}>
                {opt}
              </CrmSelectItem>
            ))}
          </CrmSelectContent>
        </Select>
      </div>
    );
  }

  if (field.fieldType === "date") {
    return (
      <div className="space-y-1.5">
        {labelNode}
        <DateInputBr
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="h-10 border-slate-200 bg-white text-sm"
        />
      </div>
    );
  }

  if (field.fieldType === "textarea") {
    return (
      <div className="space-y-1.5">
        {labelNode}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={ccFieldPlaceholder(field, label)}
          className="min-h-[110px] resize-y border-slate-200 bg-white text-sm leading-relaxed"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {labelNode}
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={ccFieldPlaceholder(field, label)}
        className="h-10 border-slate-200 bg-white text-sm"
      />
    </div>
  );
}

// ─── Status card ──────────────────────────────────────────────────────────────

function ContratStatusCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  icon: LucideIcon;
  tone: "ok" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white/75 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg",
            tone === "ok" && "bg-emerald-100 text-emerald-700",
            tone === "warn" && "bg-amber-100 text-amber-700",
            tone === "neutral" && "bg-slate-100 text-slate-700",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-sm font-bold text-primary-dark">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ─── Documento de preview — estilo contrato jurídico ──────────────────────────

const CONTRACT_BODY_STYLE: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: "11pt",
  lineHeight: "1.65",
  color: "#111111",
  textAlign: "justify",
};

const A4_PAGE_CLASS =
  "mx-auto w-full max-w-[794px] bg-white px-[11%] shadow-[0_24px_70px_rgba(16,31,46,0.22)] ring-1 ring-black/5";

/**
 * Cabeçalho/rodapé reais do modelo Word oficial (`templates/contrato/
 * MODELO_CONTRATO_RODAPE.docx`) — uma única imagem do tamanho de uma página A4
 * inteira (logo no topo, endereço no rodapé, miolo transparente), extraída de
 * `word/media/image2.png` do modelo e salva em `public/contrato-assets/`.
 * `backgroundSize` usa a proporção exata de A4 (794×1123, mesma referência já
 * usada para a folha de assinaturas do D4Sign). Aplicada uma vez por página
 * real (ver `ContratoBodyPages`), sem repetição — o conteúdo é cortado por
 * altura medida antes de renderizar, então o timbrado nunca é cortado no meio.
 */
const CONTRACT_LETTERHEAD_STYLE: React.CSSProperties = {
  backgroundImage: "url(/contrato-assets/letterhead.png)",
  backgroundSize: `${D4SIGN_A4_WIDTH}px ${D4SIGN_A4_HEIGHT}px`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "top center",
};

/** Espaço reservado no topo/base de cada página pro cabeçalho/rodapé do papel
 * timbrado (mesmo valor de `pt-28`/`pb-16` usado no container da página) —
 * usado pra calcular quanto de conteúdo cabe por página na paginação real. */
const PAGE_TOP_SAFE_ZONE = 112; // pt-28
const PAGE_BOTTOM_SAFE_ZONE = 64; // pb-16
const PAGE_CONTENT_HEIGHT = D4SIGN_A4_HEIGHT - PAGE_TOP_SAFE_ZONE - PAGE_BOTTOM_SAFE_ZONE;

type PreviewBlock = { key: string; node: React.ReactNode; forceBreakBefore?: boolean };

/**
 * Corta os blocos do corpo do contrato em páginas de verdade — mede a altura
 * real de cada bloco (renderizado escondido, mesma largura da página) e
 * agrupa até estourar `PAGE_CONTENT_HEIGHT`, começando página nova a cada
 * estouro. Sem isso, a imagem do cabeçalho/rodapé do papel timbrado repetia a
 * cada "altura de página" num fluxo contínuo, sem relação nenhuma com onde o
 * conteúdo realmente cabia — cortava o timbrado no meio de qualquer jeito.
 */
function ContratoBodyPages({ page }: { page: ContratoDocumentPagePreview }) {
  const blocks = useMemo(() => buildContratoBodyBlocks(page), [page]);
  const measureHostRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<PreviewBlock[][]>(() => [blocks]);

  useLayoutEffect(() => {
    const host = measureHostRef.current;
    if (!host) return;
    // Mede pela POSIÇÃO real de cada bloco (topo em relação ao host), não
    // pela altura isolada de cada `<div>` — somar alturas individuais é
    // sujeito a erro por causa do colapso de margem do CSS (a margin-bottom
    // de um parágrafo "escapa" do próprio elemento e não entra no
    // getBoundingClientRect() dele, mas ainda desloca o próximo elemento).
    // Medindo a diferença entre o topo de um bloco e o do próximo, o efeito
    // do colapso de margem já vem embutido automaticamente — é exatamente
    // o espaço real que aquele bloco ocupa no fluxo, sem precisar adivinhar.
    // `children` inclui o sentinela final (ver JSX abaixo) — usado só pra
    // capturar a posição real do fim do último bloco, já que a própria altura
    // do host não inclui a margin-bottom do último filho quando ela colapsa
    // "através" do host (o host não tem padding/borda pra conter a margem).
    const hostTop = host.getBoundingClientRect().top;
    const children = Array.from(host.children);
    const tops = children.map((el) => el.getBoundingClientRect().top - hostTop);
    const heights = blocks.map((_, i) => (tops[i + 1] ?? 0) - tops[i]);

    const result: PreviewBlock[][] = [];
    let current: PreviewBlock[] = [];
    let currentHeight = 0;
    blocks.forEach((block, i) => {
      const h = heights[i] ?? 0;
      const mustBreak = Boolean(block.forceBreakBefore) && current.length > 0;
      const overflows = current.length > 0 && currentHeight + h > PAGE_CONTENT_HEIGHT;
      if (mustBreak || overflows) {
        result.push(current);
        current = [];
        currentHeight = 0;
      }
      current.push(block);
      currentHeight += h;
    });
    if (current.length > 0) result.push(current);
    // Paginação depende da altura real renderizada (fonte, largura, quebra de
    // linha) — não dá pra calcular isso durante o render, só depois que o DOM
    // de medição existe. Mesmo padrão de "measure then setState" documentado
    // pelo React para useLayoutEffect (react.dev/learn/you-might-not-need-an-effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPages(result.length > 0 ? result : [[]]);
  }, [blocks]);

  return (
    <>
      {/* Medição escondida: mesma largura/padding da página real, pra cada
          bloco quebrar linha igualzinho ao que vai aparecer de verdade. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          visibility: "hidden",
          pointerEvents: "none",
          top: 0,
          left: -99999,
          width: D4SIGN_A4_WIDTH,
        }}
      >
        <div ref={measureHostRef} className={cn(A4_PAGE_CLASS, "space-y-0")} style={CONTRACT_BODY_STYLE}>
          {blocks.map((b) => (
            <div key={b.key}>{b.node}</div>
          ))}
          {/* Sentinela: marca o fim real do último bloco (ver comentário no
              useLayoutEffect acima) — não é um bloco de conteúdo. */}
          <div key="__end-sentinel__" />
        </div>
      </div>

      {pages.map((pageBlocks, i) => (
        <div key={i}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Folha {i + 1} — Corpo do contrato
          </p>
          <div
            className={cn(A4_PAGE_CLASS, "pt-28 pb-16")}
            style={{ ...CONTRACT_BODY_STYLE, ...CONTRACT_LETTERHEAD_STYLE, minHeight: D4SIGN_A4_HEIGHT }}
          >
            {pageBlocks.map((b) => (
              <div key={b.key}>{b.node}</div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function buildContratoBodyBlocks(page: ContratoDocumentPagePreview): PreviewBlock[] {
  const ELLIPSIS = "…";

  // Separar o nome da empresa (bold) do restante da qualificação
  const qualRaw = page.qualificacao || "";
  const qualNoPoint = qualRaw.replace(/\.\s*$/, ""); // remove ponto final
  const firstComma = qualNoPoint.indexOf(",");
  const companyName = firstComma >= 0 ? qualNoPoint.slice(0, firstComma).trim() : qualNoPoint;
  const companyDetail = firstComma >= 0 ? qualNoPoint.slice(firstComma) : ""; // já começa com ","

  // Numeração dinâmica de cláusulas
  const hasAreas  = page.areas && page.areas.length > 0;
  // Compatibilidade legada com campos antigos (sem novas áreas)
  const hasLimitacoes = !hasAreas && !!(page.limiteProcessos || page.limiteHoras);
  const hasExitoLegado = !hasAreas && !!page.exitoAreas;
  // cc_prazo_confeccao: campo desativado — mantido apenas para contratos antigos
  // cc_prazo_revisao: deadline interno para o Societário; NÃO aparece no corpo do contrato
  const hasPrazoConfeccao = !!page.prazoConfeccao && !page.prazoRevisao;

  // Numera as áreas (cada área não-êxito vira uma cláusula)
  const areasClauses = hasAreas
    ? (page.areas ?? []).filter((a) => a.key !== "exito")
    : [];
  const exitoArea = hasAreas
    ? (page.areas ?? []).find((a) => a.key === "exito")
    : null;

  let clauseCounter = 3; // 1=objeto, 2=objetos excluídos, 3=honorários
  const nObjeto    = 1;
  const nObjetosExcluidos = 2;
  const nHonorarios = 3;

  // Áreas não-êxito: cada uma recebe um número
  const areaClauseNums = areasClauses.map(() => ++clauseCounter);
  if (exitoArea) clauseCounter++;
  const nExitoArea = exitoArea ? clauseCounter : 0;

  // Legado (dados antigos sem novas áreas)
  const nLimitacoes  = hasLimitacoes ? ++clauseCounter : 0;
  const nExitoLegado = hasExitoLegado ? ++clauseCounter : 0;

  // Prazo de confecção legado (cc_prazo_confeccao — campo desativado, compatibilidade)
  // cc_prazo_revisao é internal workflow; NÃO aparece no contrato
  const nPrazo = hasPrazoConfeccao ? ++clauseCounter : 0;
  const nBaseAdicionais = clauseCounter;

  const blocks: PreviewBlock[] = [];

  blocks.push({
    key: "titulo",
    node: (
      <div className="mb-6">
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.55)" }} />
        <p
          className="py-1.5 text-center font-bold"
          style={{ letterSpacing: "0.06em", fontSize: "11pt" }}
        >
          CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS
        </p>
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.55)" }} />
      </div>
    ),
  });

  blocks.push({
    key: "abertura",
    node: (
      <p className="mb-4">
        Pelo presente instrumento particular, as partes a seguir identificadas e qualificadas:
      </p>
    ),
  });

  blocks.push({
    key: "qual-contratante",
    node: (
      <p className="mb-4">
        <strong>{companyName || ELLIPSIS}</strong>
        {companyDetail}, doravante denominada{" "}
        <strong>&ldquo;CONTRATANTE&rdquo;</strong>.
      </p>
    ),
  });

  blocks.push({
    key: "qual-contratada",
    node: (
      <p className="mb-4">
        <strong>BISMARCHI | PIRES – SOCIEDADE DE ADVOGADOS</strong>, pessoa jurídica de direito
        privado, inscrita no CNPJ sob o n° 26.080.152/0001-35, com sede na Rua Coronel Quirino,
        n° 1.266, bairro Cambuí, na Cidade de Campinas, Estado de São Paulo, CEP 13025-002, neste
        ato representada por seus sócios administradores{" "}
        <strong>GUSTAVO BISMARCHI MOTTA</strong>, inscrito na OAB/SP sob o n° 275.477, e{" "}
        <strong>RICARDO VISCARDI PIRES</strong>, inscrito na OAB/SP sob o n° 353.389, doravante
        denominada <strong>&ldquo;CONTRATADA&rdquo;</strong>.
      </p>
    ),
  });

  blocks.push({
    key: "conjuncao",
    node: (
      <p className="mb-7">
        <strong>CONTRATANTE</strong> e <strong>CONTRATADA</strong>, quando em conjunto, doravante
        denominadas <strong>&ldquo;Partes&rdquo;</strong> e, individual e indiscriminadamente,{" "}
        <strong>&ldquo;Parte&rdquo;</strong>, têm entre si, justo e acordado os termos do presente
        Contrato de Prestação de Serviços Advocatícios (
        <strong>&ldquo;Contrato&rdquo;</strong>), o qual reger-se-á pelas seguintes cláusulas e
        condições.
      </p>
    ),
  });

  blocks.push(...buildClauseBlocks("clausula-objeto", nObjeto, "OBJETO DO CONTRATO", { content: page.objeto }, ELLIPSIS));

  if (page.objetosExcluidos) {
    blocks.push(
      ...buildClauseBlocks(
        "clausula-objetos-excluidos",
        nObjetosExcluidos,
        page.objetosExcluidos.title.toUpperCase(),
        page.objetosExcluidos,
        ELLIPSIS,
      ),
    );
  }

  blocks.push({
    key: "clausula-honorarios",
    node: (
      <ContratoClause num={nHonorarios} title="DOS HONORÁRIOS CONTRATUAIS">
        <p className="whitespace-pre-wrap">{page.valores || ELLIPSIS}</p>
        {page.tipoPagamento ? (
          <p className="mt-2">
            <strong>Forma de pagamento:</strong> {page.tipoPagamento}.
          </p>
        ) : null}
        {page.investimento ? (
          <p className="mt-2">
            <strong>Proposta base:</strong> {page.investimento}.
          </p>
        ) : null}
      </ContratoClause>
    ),
  });

  areasClauses.forEach((area, i) => {
    blocks.push({
      key: `area-${area.key}`,
      node: (
        <ContratoClause num={areaClauseNums[i] ?? i + 3} title={area.label.toUpperCase()}>
          {area.details.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {area.details.map((det) => (
                <li key={det.label}>
                  <strong>{det.label}:</strong> {det.value}.
                </li>
              ))}
            </ul>
          ) : null}
        </ContratoClause>
      ),
    });
  });

  if (exitoArea && nExitoArea > 0) {
    blocks.push({
      key: "clausula-exito-area",
      node: (
        <ContratoClause num={nExitoArea} title="DOS HONORÁRIOS DE ÊXITO">
          {exitoArea.details.map((det) =>
            det.label === "Detalhamento" ? (
              <p key="det" className="whitespace-pre-wrap">{det.value}</p>
            ) : (
              <p key={det.label} className="mt-1">
                <strong>{det.label}:</strong> {det.value}.
              </p>
            ),
          )}
        </ContratoClause>
      ),
    });
  }

  if (hasLimitacoes && nLimitacoes > 0) {
    blocks.push({
      key: "clausula-limitacoes-legado",
      node: (
        <ContratoClause num={nLimitacoes} title="DAS LIMITAÇÕES DE SERVIÇOS">
          {page.limiteProcessos ? (
            <p><strong>Limite de processos:</strong> {page.limiteProcessos}.</p>
          ) : null}
          {page.limiteHoras ? (
            <p className="mt-2"><strong>Limite de horas mensais:</strong> {page.limiteHoras}.</p>
          ) : null}
        </ContratoClause>
      ),
    });
  }

  if (hasExitoLegado && nExitoLegado > 0) {
    blocks.push({
      key: "clausula-exito-legado",
      node: (
        <ContratoClause num={nExitoLegado} title="DOS HONORÁRIOS DE ÊXITO">
          <p className="whitespace-pre-wrap">{page.exitoAreas}</p>
        </ContratoClause>
      ),
    });
  }

  if (hasPrazoConfeccao && nPrazo > 0) {
    blocks.push({
      key: "clausula-prazo-legado",
      node: (
        <ContratoClause num={nPrazo} title="DO PRAZO PARA CONFECÇÃO DO CONTRATO DEFINITIVO">
          <p>{page.prazoConfeccao}.</p>
        </ContratoClause>
      ),
    });
  }

  page.clausulasAdicionais.forEach((c, i) => {
    const num = nBaseAdicionais + i + 1;
    blocks.push(...buildClauseBlocks(`adicional-${i}`, num, c.title.toUpperCase(), c, ELLIPSIS));
  });

  return blocks;
}

/**
 * Constrói os blocos medíveis de uma cláusula. Cláusulas com sub-itens (N.1,
 * N.2...) — como "Disposições Gerais", que pode ter 10+ itens — viram UM
 * bloco por item, não um bloco gigante só. Sem isso, uma cláusula longa não
 * cabia inteira no espaço restante da página e o paginador (que só decide
 * onde cortar ENTRE blocos, nunca dentro de um) deixava o bloco inteiro
 * estourar pro fundo da página, sobrepondo o rodapé do papel timbrado.
 */
function buildClauseBlocks(
  baseKey: string,
  num: number,
  title: string,
  clausula: { content: string; items?: Array<{ title: string; content: string }> },
  ellipsis: string,
): PreviewBlock[] {
  if (!clausula.items || clausula.items.length === 0) {
    // Conteúdo de parágrafo único também pode ser longo o bastante pra não
    // caber no espaço restante de uma página (ex.: Objeto de um Full Service,
    // que junta Contencioso + Consultivo em várias linhas numeradas separadas
    // por linha em branco) — separa em um bloco por parágrafo, mesma lógica
    // usada abaixo pros sub-itens, senão o bloco inteiro pula pra próxima
    // página e deixa a atual com metade do espaço vazio.
    const paragraphs = (clausula.content || ellipsis).split(/\n{2,}/).filter((p) => p.trim());
    const paras = paragraphs.length > 0 ? paragraphs : [ellipsis];
    return paras.map((paragraph, j) => ({
      key: `${baseKey}-p-${j}`,
      node: (
        <div className={j === paras.length - 1 ? "mb-5" : "mb-2"}>
          {j === 0 ? (
            <p className="mb-1.5 font-bold" style={{ fontSize: "11pt" }}>
              {num}.&emsp;{title}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap">{paragraph}</p>
        </div>
      ),
    }));
  }

  const items = clausula.items;
  return items.map((item, j) => ({
    key: `${baseKey}-item-${j}`,
    node: (
      <div className={cn(j === items.length - 1 ? "mb-5" : "mb-2")}>
        {j === 0 ? (
          <p className="mb-1.5 font-bold" style={{ fontSize: "11pt" }}>
            {num}.&emsp;{title}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap">
          <strong>
            {num}.{j + 1}. {item.title}.
          </strong>{" "}
          {item.content}
        </p>
      </div>
    ),
  }));
}

/** Folha dedicada de assinaturas — sempre a última página do PDF enviado à D4Sign. */
function ContratoSignaturePageDocument({ page }: { page: ContratoDocumentPagePreview }) {
  const ELLIPSIS = "…";

  return (
    <div
      className={cn(A4_PAGE_CLASS, "pt-28 pb-16")}
      style={{ ...CONTRACT_BODY_STYLE, ...CONTRACT_LETTERHEAD_STYLE, minHeight: D4SIGN_A4_HEIGHT }}
    >
      <p
        className="mb-2 text-center text-[10pt] font-bold uppercase tracking-[0.12em]"
        style={{ color: "#6b7280" }}
      >
        Página de Assinaturas
      </p>
      <p className="mb-10 text-center text-[10pt]" style={{ color: "#6b7280" }}>
        Em continuação ao Contrato de Prestação de Serviços Advocatícios celebrado entre as Partes.
      </p>

      <p className="mb-14 text-center">
        Campinas/SP, {page.dataAssinatura || ELLIPSIS}.
      </p>
      <div className="grid grid-cols-2 gap-10">
        <div className="flex flex-col items-center text-center">
          <div className="mb-1 w-full" style={{ borderTop: "1px solid #333" }} />
          <p className="font-bold">CONTRATANTE</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="mb-1 w-full" style={{ borderTop: "1px solid #333" }} />
          <p className="font-bold">CONTRATADA</p>
          <p style={{ fontSize: "10pt" }}>Bismarchi | Pires – Sociedade de Advogados</p>
          <p className="mt-6 w-full" style={{ borderTop: "1px solid #333" }} />
          <p className="mt-1 text-[9pt] text-slate-500">Gustavo Bismarchi Motta</p>
          <p className="mt-4 w-full" style={{ borderTop: "1px solid #333" }} />
          <p className="mt-1 text-[9pt] text-slate-500">Ricardo Viscardi Pires</p>
        </div>
      </div>
    </div>
  );
}

// ─── Cláusula numerada ────────────────────────────────────────────────────────

function ContratoClause({
  num,
  title,
  children,
}: {
  num: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 font-bold" style={{ fontSize: "11pt" }}>
        {num}.&emsp;{title}
      </p>
      <div>{children}</div>
    </div>
  );
}
