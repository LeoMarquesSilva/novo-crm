"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bell,
  BookText,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  FileDown,
  FileText,
  History,
  Loader2,
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
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { DateInputBr } from "@/components/ui/date-input-br";
import { cn } from "@/lib/utils";
import { evaluateCondition, type FieldCondition } from "@/lib/crm/field-condition";
import {
  buildContratoDocumentPagePreview,
  type ContratoDocumentPagePreview,
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
};

/** Template de cláusula da biblioteca (admin gerencia) */
type ClauseTemplate = {
  id: string;
  title: string;
  content: string;
  category: string;
  sort_order: number;
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
  pending: string[];
  snapshot: {
    fieldByCode: Record<string, string>;
    empresa: {
      razaoSocial: string | null;
      documentoFormatado: string | null;
    };
  };
  ccFieldDefs: CcFieldDef[];
  availableClauses: ClauseTemplate[];
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
};

// ─── Seções e códigos dos campos ─────────────────────────────────────────────

/** Campos agrupados por seção do formulário do builder. */
const SECTION_INSTRUMENTO = ["cc_tipo_instrumento", "cc_objeto"] as const;
const SECTION_VALORES = [
  "cc_tipo_pagamento",
  "cc_valores",
] as const;
const SECTION_PRAZO = ["cc_prazo_revisao"] as const;

/** Áreas de atuação — cada área tem um toggle "cc_incluir_X" e campos condicionais */
const AREAS_CONFIG = [
  {
    toggleCode: "cc_incluir_trabalhista",
    label: "Assessoria Trabalhista",
    detailCodes: ["cc_trabalhista_limite_acoes", "cc_trabalhista_horas_consultivas"],
  },
  {
    toggleCode: "cc_incluir_civel",
    label: "Assessoria Cível",
    detailCodes: ["cc_civel_limite_processos", "cc_civel_horas_consultivas"],
  },
  {
    toggleCode: "cc_incluir_contratual",
    label: "Assessoria Contratual/Societária",
    detailCodes: ["cc_contratual_horas_mensais"],
  },
  {
    toggleCode: "cc_incluir_tributario",
    label: "Assessoria Tributária",
    detailCodes: ["cc_tributario_limite_acoes"],
  },
  {
    toggleCode: "cc_incluir_exito",
    label: "Honorários de Êxito",
    detailCodes: ["cc_exito_percentual"],
  },
] as const;

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
                ? "Rascunho em andamento. Clique em &ldquo;Continuar Elaboração&rdquo; para editar."
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
                <ul className="space-y-1 text-sm text-primary-dark/80">
                  {pending.slice(0, 6).map((item) => (
                    <li key={item}>· {item}</li>
                  ))}
                  {pending.length > 6 ? (
                    <li className="text-xs text-muted-foreground">
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
    Object.fromEntries(contratoState.ccFieldDefs.map((f) => [f.fieldCode, f.value]));

  const [draftValues, setDraftValues] = useState<Record<string, string>>(initDraft);
  const [savedValues, setSavedValues] = useState<Record<string, string>>(initDraft);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
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

  // ── Computed ───────────────────────────────────────────────────────────────
  const isDirty =
    JSON.stringify(draftValues) !== JSON.stringify(savedValues) ||
    selectedTemplateId !== savedTemplateId ||
    JSON.stringify(draftSelectedClauses) !== JSON.stringify(savedSelectedClauses) ||
    JSON.stringify(draftPins) !== JSON.stringify(savedPins);

  const templates = contratoState.templates;
  const selectedTemplateName =
    templates.find((t) => t.id === selectedTemplateId)?.name ?? "Selecione um modelo";

  const fieldByCode = Object.fromEntries(
    contratoState.ccFieldDefs.map((f) => [f.fieldCode, f]),
  );

  /** Verifica se um campo cc_* está visível dado os draftValues atuais. */
  function isVisible(code: string): boolean {
    const f = fieldByCode[code];
    if (!f) return false;
    return evaluateCondition(f.conditionJson as FieldCondition, draftValues);
  }

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
      // Áreas de atuação
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
    return buildContratoDocumentPagePreview(data, draftSelectedClauses);
  }, [contratoState, draftValues, draftSelectedClauses]);

  /** Campos que obrigatoriamente precisam de valor dado o tipo de pagamento. */
  const instrComplete =
    Boolean(draftValues.cc_tipo_instrumento?.trim()) &&
    Boolean(draftValues.cc_objeto?.trim());
  const valsComplete = Boolean(draftValues.cc_tipo_pagamento?.trim());
  const prazComplete = Boolean(draftValues.cc_prazo_revisao?.trim());
  /** Pelo menos uma área de atuação selecionada */
  const areasComplete = AREAS_CONFIG.some(
    (a) => draftValues[a.toggleCode]?.trim() === "Sim",
  );

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
    // Salvar seleção de template + cláusulas adicionais + pins
    await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: selectedTemplateId,
        status: "draft",
        data: {
          clausulas_selecionadas: draftSelectedClauses,
          pins_signatarios: draftPins,
        },
      }),
    });

    // Se prazo de revisão foi definido ou alterado, notificar Societário e Contratos
    const prazoRevisao = draftValues.cc_prazo_revisao?.trim() ?? "";
    const savedPrazoRevisao = savedValues.cc_prazo_revisao?.trim() ?? "";
    if (prazoRevisao && prazoRevisao !== savedPrazoRevisao) {
      await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/contrato/review-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prazoRevisao }),
      });
    }

    setSavedValues({ ...draftValues });
    setSavedTemplateId(selectedTemplateId);
    setSavedSelectedClauses([...draftSelectedClauses]);
    setSavedPins([...draftPins]);
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
          onPointerDownOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
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
                {isDirty ? (
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Não salvo
                  </span>
                ) : null}
              </div>
            </div>

            {/* Template selector */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedTemplateId}
                onValueChange={(v) => {
                  if (v) setSelectedTemplateId(v);
                  setSaveFeedback(null);
                }}
                disabled={templates.length === 0}
              >
                <SelectTrigger className="h-9 min-w-[14rem] max-w-[22rem] border-white/25 bg-white/15 text-sm text-white shadow-sm backdrop-blur">
                  <span className="min-w-0 truncate text-left">{selectedTemplateName}</span>
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} v{t.version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
            <aside className="crm-scrollbar w-[46%] shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 sm:px-6">
              <div className="space-y-8">
                {/* Seção: Partes (read-only) */}
                <FormSection num={1} title="Partes" isComplete={Boolean(propostaEmpresaPrincipalNome)}>
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

                {/* Seção: Instrumento e Objeto */}
                <FormSection
                  num={2}
                  title="Instrumento e Objeto"
                  isComplete={instrComplete}
                >
                  {(SECTION_INSTRUMENTO as readonly string[]).map((code) => {
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
                </FormSection>

                {/* Seção 3: Áreas de Atuação */}
                <AreasSection
                  num={3}
                  areasConfig={AREAS_CONFIG}
                  fieldByCode={fieldByCode}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  isComplete={areasComplete}
                  disabled={saving || generating}
                />

                {/* Seção: Valores e Pagamento */}
                <FormSection
                  num={4}
                  title="Valores e Pagamento"
                  isComplete={valsComplete}
                >
                  {(SECTION_VALORES as readonly string[]).map((code) => {
                    if (!isVisible(code)) return null;
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
                </FormSection>

                {/* Seção 5: Prazo para Revisão */}
                <FormSection num={5} title="Prazo para Revisão" isComplete={prazComplete}>
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
                <ClausulasSection
                  available={contratoState.availableClauses ?? []}
                  selected={draftSelectedClauses}
                  onChange={setDraftSelectedClauses}
                  disabled={saving || generating}
                />

                {/* Seção 7: Posicionar Assinaturas (rubrica/pin) */}
                <PinsSection
                  pins={draftPins}
                  onChange={setDraftPins}
                  pinMode={pinMode}
                  onPinModeChange={setPinMode}
                  disabled={saving || generating}
                />
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
  pending: string[];
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
              {pending.slice(0, 4).map((p) => <li key={p}>· {p}</li>)}
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
                        <SelectContent>
                          <SelectItem value="0">CPF brasileiro</SelectItem>
                          <SelectItem value="1">Sem CPF / estrangeiro</SelectItem>
                        </SelectContent>
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

function AreasSection({
  num,
  areasConfig,
  fieldByCode,
  draftValues,
  onChange,
  isComplete,
  disabled,
}: {
  num: number;
  areasConfig: typeof AREAS_CONFIG;
  fieldByCode: Record<string, CcFieldDef>;
  draftValues: Record<string, string>;
  onChange: (code: string, value: string) => void;
  isComplete: boolean;
  disabled?: boolean;
}) {
  return (
    <FormSection num={num} title="Áreas de Atuação" isComplete={isComplete}>
      <p className="text-xs text-muted-foreground">
        Selecione quais áreas fazem parte deste contrato e preencha os limites correspondentes.
      </p>
      <div className="space-y-3">
        {areasConfig.map((area) => {
          const isIncluded = draftValues[area.toggleCode]?.trim() === "Sim";
          return (
            <div
              key={area.toggleCode}
              className={cn(
                "rounded-xl border transition-colors",
                isIncluded
                  ? "border-teal-200 bg-teal-50/50"
                  : "border-slate-200 bg-white",
              )}
            >
              {/* Toggle header */}
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isIncluded}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(area.toggleCode, e.target.checked ? "Sim" : "Não")
                    }
                  />
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded-md border-2 transition-colors",
                      isIncluded
                        ? "border-teal-500 bg-teal-500"
                        : "border-slate-300 bg-white",
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
                  {area.label}
                </span>
                {isIncluded && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    Incluído
                  </span>
                )}
              </label>

              {/* Detail fields (conditionally shown) */}
              {isIncluded && area.detailCodes.length > 0 && (
                <div className="border-t border-teal-100 px-4 pb-4 pt-3 space-y-3">
                  {(area.detailCodes as readonly string[]).map((code) => {
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
              )}
            </div>
          );
        })}
      </div>
    </FormSection>
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

function ClausulasSection({
  available,
  selected,
  onChange,
  disabled,
}: {
  available: ClauseTemplate[];
  selected: SelectedClause[];
  onChange: (clauses: SelectedClause[]) => void;
  disabled?: boolean;
}) {
  const selectedIds = new Set(selected.map((c) => c.id));

  // Agrupa disponíveis por categoria
  const byCategory: Record<string, ClauseTemplate[]> = {};
  for (const c of available) {
    const cat = c.category || "Geral";
    (byCategory[cat] ??= []).push(c);
  }
  const categories = Object.keys(byCategory).sort();

  function addClause(tpl: ClauseTemplate) {
    const next: SelectedClause = {
      id: tpl.id,
      title: tpl.title,
      content: tpl.content,
      order: selected.length,
    };
    onChange([...selected, next]);
  }

  function removeClause(id: string) {
    onChange(selected.filter((c) => c.id !== id).map((c, i) => ({ ...c, order: i })));
  }

  function moveClause(idx: number, dir: -1 | 1) {
    const arr = [...selected];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange(arr.map((c, i) => ({ ...c, order: i })));
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

      <div className="ml-10 space-y-4">
        {/* Biblioteca de cláusulas */}
        {available.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma cláusula cadastrada. Acesse{" "}
            <span className="font-semibold">Admin → Cláusulas</span> para criar modelos.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            <p className="border-b border-slate-200 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Biblioteca
            </p>
            <div className="divide-y divide-slate-100">
              {categories.map((cat) =>
                (byCategory[cat] ?? []).map((tpl) => {
                  const isAdded = selectedIds.has(tpl.id);
                  return (
                    <div
                      key={tpl.id}
                      className="flex items-center gap-2 px-3 py-2"
                    >
                      <span className="flex-1 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                          {cat}
                        </span>
                        <p className="truncate text-xs font-medium text-primary-dark">
                          {tpl.title}
                        </p>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-7 shrink-0 gap-1 px-2 text-[11px]",
                          isAdded && "opacity-40 cursor-not-allowed",
                        )}
                        disabled={disabled || isAdded}
                        onClick={() => addClause(tpl)}
                      >
                        <Plus className="size-3" aria-hidden />
                        {isAdded ? "Adicionada" : "Adicionar"}
                      </Button>
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        )}

        {/* Cláusulas adicionadas */}
        {selected.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Adicionadas ao contrato
            </p>
            {selected.map((clause, idx) => (
              <div
                key={clause.id}
                className="rounded-xl border border-teal-200/70 bg-white p-3 shadow-sm"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  {/* Reordenar */}
                  <button
                    type="button"
                    onClick={() => moveClause(idx, -1)}
                    disabled={disabled || idx === 0}
                    className="flex size-6 items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="size-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveClause(idx, 1)}
                    disabled={disabled || idx === selected.length - 1}
                    className="flex size-6 items-center justify-center rounded border border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="size-3" aria-hidden />
                  </button>
                  <span className="flex-1 truncate text-xs font-semibold text-primary-dark">
                    {clause.title}
                  </span>
                  {/* Remover */}
                  <button
                    type="button"
                    onClick={() => removeClause(clause.id)}
                    disabled={disabled}
                    className="flex size-6 items-center justify-center rounded border border-rose-200 text-rose-400 hover:border-rose-300 hover:text-rose-600 disabled:opacity-30"
                    aria-label="Remover cláusula"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
                <Textarea
                  value={clause.content}
                  onChange={(e) => updateContent(clause.id, e.target.value)}
                  disabled={disabled}
                  placeholder="Conteúdo da cláusula…"
                  className="min-h-[90px] resize-y border-slate-200 bg-slate-50 text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>
        )}
      </div>
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
      {/* Folha 1 — corpo do contrato (somente leitura) */}
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Folha 1 — Corpo do contrato
        </p>
        <ContratoBodyDocument page={page} />
      </div>

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

function FormSection({
  num,
  title,
  isComplete,
  children,
}: {
  num: number;
  title: string;
  isComplete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black",
            isComplete
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500",
          )}
        >
          {isComplete ? <Check className="size-3.5" aria-hidden /> : num}
        </span>
        <h3 className="text-sm font-bold tracking-[-0.01em] text-primary-dark">{title}</h3>
        {!isComplete ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            Pendente
          </span>
        ) : (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            Completo
          </span>
        )}
      </div>
      <div className="ml-10 space-y-4">{children}</div>
    </div>
  );
}

// ─── Input de campo cc_* ──────────────────────────────────────────────────────

function CcFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CcFieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const label = field.label.replace(" [CC]", "");

  if (field.fieldType === "select" && Array.isArray(field.fieldOptions)) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-primary-dark">{label}</Label>
        <Select value={value} onValueChange={(v) => { if (v) onChange(v); }} disabled={disabled}>
          <SelectTrigger className="h-10 border-slate-200 bg-white text-sm">
            <span className={cn("text-left", !value && "text-muted-foreground")}>
              {value || "Selecionar..."}
            </span>
          </SelectTrigger>
          <SelectContent>
            {field.fieldOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (field.fieldType === "date") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-primary-dark">{label}</Label>
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
        <Label className="text-xs font-medium text-primary-dark">{label}</Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`${label}…`}
          className="min-h-[110px] resize-y border-slate-200 bg-white text-sm leading-relaxed"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-primary-dark">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={`${label}…`}
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
  "mx-auto w-full max-w-[794px] bg-white px-[11%] py-10 shadow-[0_24px_70px_rgba(16,31,46,0.22)] ring-1 ring-black/5";

function ContratoBodyDocument({ page }: { page: ContratoDocumentPagePreview }) {
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

  let clauseCounter = 2; // 1=objeto, 2=honorários
  const nObjeto    = 1;
  const nHonorarios = 2;

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

  return (
    <div className={cn(A4_PAGE_CLASS, "min-h-[600px]")} style={CONTRACT_BODY_STYLE}>
      {/* ── Cabeçalho / Logomarca ── */}
      <div className="mb-5 flex flex-col items-center gap-0.5" style={{ fontFamily: "inherit" }}>
        <p className="text-[13pt] font-extrabold tracking-[0.07em]" style={{ color: "#0b1724" }}>
          BISMARCHI<span className="mx-1.5 font-black" style={{ color: "#2dc8b7" }}>|</span>PIRES
        </p>
        <p className="text-[7.5pt] uppercase tracking-[0.35em]" style={{ color: "#6b7280" }}>
          Sociedade de Advogados
        </p>
      </div>

      {/* ── Título do documento ── */}
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

      {/* ── Abertura ── */}
      <p className="mb-4">
        Pelo presente instrumento particular, as partes a seguir identificadas e qualificadas:
      </p>

      {/* ── Qualificação do CONTRATANTE ── */}
      <p className="mb-4">
        <strong>{companyName || ELLIPSIS}</strong>
        {companyDetail}, doravante denominada{" "}
        <strong>&ldquo;CONTRATANTE&rdquo;</strong>.
      </p>

      {/* ── Qualificação da CONTRATADA (Bismarchi | Pires — fixo) ── */}
      <p className="mb-4">
        <strong>BISMARCHI | PIRES – SOCIEDADE DE ADVOGADOS</strong>, pessoa jurídica de direito
        privado, inscrita no CNPJ sob o n° 26.080.152/0001-35, com sede na Rua Coronel Quirino,
        n° 1.266, bairro Cambuí, na Cidade de Campinas, Estado de São Paulo, CEP 13025-002, neste
        ato representada por seus sócios administradores{" "}
        <strong>GUSTAVO BISMARCHI MOTTA</strong>, inscrito na OAB/SP sob o n° 275.477, e{" "}
        <strong>RICARDO VISCARDI PIRES</strong>, inscrito na OAB/SP sob o n° 353.389, doravante
        denominada <strong>&ldquo;CONTRATADA&rdquo;</strong>.
      </p>

      {/* ── Parágrafo de conjunção ── */}
      <p className="mb-7">
        <strong>CONTRATANTE</strong> e <strong>CONTRATADA</strong>, quando em conjunto, doravante
        denominadas <strong>&ldquo;Partes&rdquo;</strong> e, individual e indiscriminadamente,{" "}
        <strong>&ldquo;Parte&rdquo;</strong>, têm entre si, justo e acordado os termos do presente
        Contrato de Prestação de Serviços Advocatícios (
        <strong>&ldquo;Contrato&rdquo;</strong>), o qual reger-se-á pelas seguintes cláusulas e
        condições.
      </p>

      {/* ── 1. OBJETO DO CONTRATO ── */}
      <ContratoClause num={nObjeto} title="OBJETO DO CONTRATO">
        <p className="whitespace-pre-wrap">{page.objeto || ELLIPSIS}</p>
      </ContratoClause>

      {/* ── 2. DOS HONORÁRIOS ── */}
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

      {/* ── N. ÁREAS DE ATUAÇÃO (novo sistema) ── */}
      {areasClauses.map((area, i) => (
        <ContratoClause
          key={area.key}
          num={areaClauseNums[i] ?? i + 3}
          title={area.label.toUpperCase()}
        >
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
      ))}

      {/* ── N. HONORÁRIOS DE ÊXITO (área especial, novo sistema) ── */}
      {exitoArea && nExitoArea > 0 ? (
        <ContratoClause num={nExitoArea} title="DOS HONORÁRIOS DE ÊXITO">
          {exitoArea.details.map((det) => (
            det.label === "Detalhamento" ? (
              <p key="det" className="whitespace-pre-wrap">{det.value}</p>
            ) : (
              <p key={det.label} className="mt-1">
                <strong>{det.label}:</strong> {det.value}.
              </p>
            )
          ))}
        </ContratoClause>
      ) : null}

      {/* ── N. DAS LIMITAÇÕES (legado — sem novas áreas) ── */}
      {hasLimitacoes && nLimitacoes > 0 ? (
        <ContratoClause num={nLimitacoes} title="DAS LIMITAÇÕES DE SERVIÇOS">
          {page.limiteProcessos ? (
            <p><strong>Limite de processos:</strong> {page.limiteProcessos}.</p>
          ) : null}
          {page.limiteHoras ? (
            <p className="mt-2"><strong>Limite de horas mensais:</strong> {page.limiteHoras}.</p>
          ) : null}
        </ContratoClause>
      ) : null}

      {/* ── N. DOS HONORÁRIOS DE ÊXITO (legado) ── */}
      {hasExitoLegado && nExitoLegado > 0 ? (
        <ContratoClause num={nExitoLegado} title="DOS HONORÁRIOS DE ÊXITO">
          <p className="whitespace-pre-wrap">{page.exitoAreas}</p>
        </ContratoClause>
      ) : null}

      {/* ── N. DO PRAZO PARA CONFECÇÃO (legado — cc_prazo_confeccao desativado) ── */}
      {hasPrazoConfeccao && nPrazo > 0 ? (
        <ContratoClause num={nPrazo} title="DO PRAZO PARA CONFECÇÃO DO CONTRATO DEFINITIVO">
          <p>{page.prazoConfeccao}.</p>
        </ContratoClause>
      ) : null}

      {/* ── Cláusulas adicionais (biblioteca) ── */}
      {page.clausulasAdicionais.map((c, i) => (
        <ContratoClause key={i} num={nBaseAdicionais + i + 1} title={c.title.toUpperCase()}>
          <p className="whitespace-pre-wrap">{c.content || ELLIPSIS}</p>
        </ContratoClause>
      ))}
    </div>
  );
}

/** Folha dedicada de assinaturas — sempre a última página do PDF enviado à D4Sign. */
function ContratoSignaturePageDocument({ page }: { page: ContratoDocumentPagePreview }) {
  const ELLIPSIS = "…";

  return (
    <div
      className={A4_PAGE_CLASS}
      style={{ ...CONTRACT_BODY_STYLE, minHeight: D4SIGN_A4_HEIGHT }}
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

      <div className="mt-auto pt-16" style={{ borderTop: "1px solid rgba(0,0,0,0.2)" }}>
        <p
          className="mt-2 text-center"
          style={{ fontSize: "8pt", color: "#6b7280", letterSpacing: "0.02em" }}
        >
          Rua Coronel Quirino, 1.266 — Cambuí — Campinas/SP &nbsp;·&nbsp; (19) 3254-6446
          &nbsp;·&nbsp; contato@bismarchipires.com.br
        </p>
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
