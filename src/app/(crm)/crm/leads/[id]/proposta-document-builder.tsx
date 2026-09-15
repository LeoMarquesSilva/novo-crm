"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileText,
  ListChecks,
  Loader2,
  PenLine,
  Save,
  SlidersHorizontal,
  Target,
  TriangleAlert,
  UserRound,
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
import { DateInputBr } from "@/components/ui/date-input-br";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { CrmUserLabel } from "@/components/crm/crm-user-label";
import { ProposalDocxPreview } from "@/components/crm/proposal-docx-preview";
import {
  DocumentBuilderDialogHeader,
  DocumentBuilderHubHeader,
  documentBuilderDialogClass,
  documentBuilderHubClass,
  documentEmptyStateClass,
} from "@/components/crm/document-builder-chrome";
import { isInteractionFromBaseUiSelectLayer } from "@/lib/ui/base-ui-select-dialog";
import { useBodyScrollLock } from "@/lib/ui/body-scroll-lock";
import { userFacingFieldLabel } from "@/lib/crm/user-facing-field-label";
import { cn } from "@/lib/utils";
import { LeadDetailFieldEditor, pipelineFieldToEditorProps } from "./lead-detail-field-editor";
import {
  buildCanonicalProposalData, type CanonicalProposalData,
} from "@/lib/crm/proposta-docx-data";
import { listProposalPendingFields, type ProposalRequiredField } from "@/lib/crm/proposta-document-validation";
import {
  createProposalDocxPreviewController,
  persistProposalDraft,
  readProposalDocxResponse,
  selectProposalDraftValues,
  type ProposalDocxPreviewState,
} from "@/lib/crm/proposta-document-client";
import { PropostaEscopoAreaCoordenacao } from "./proposta-escopo-area-coordenacao";
import { PropostaEscopoPorArea } from "./proposta-escopo-por-area";
import { PropostaInvestimentoConsolidadoForm } from "@/components/crm/proposta-investimento-consolidado-form";
import {
  parseAreasList,
  parseEscopoJsonWithMeta,
  stringifyEscopoJsonWithMeta,
} from "@/lib/crm/proposta-escopo-json";
import { resolveInvestimentoDocumento } from "@/lib/crm/proposta-investimento-consolidado";
import {
  normalizeTributacaoValue,
  PROPOSTA_TRIBUTACAO_LABELS,
  PROPOSTA_TRIBUTACAO_OPTIONS,
} from "@/lib/crm/proposta-tributacao";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import {
  PROPOSTA_TIPOS_CATALOG,
  type PropostaTiposCatalog,
} from "@/data/proposta-tipos-catalog";
import type { LeadDetailData, LeadDetailViewer } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  templatePath: string;
  version: number;
  fields: ProposalRequiredField[];
};

type ProposalUserOption = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type DocumentState = {
  template: Template;
  instance: {
    id: string;
    status: string;
    current_version: number;
    updated_at: string;
  };
  versions: Array<{
    id: string;
    version_number: number;
    generated_file_path: string | null;
    generated_at: string;
  }>;
  snapshot: {
    responsavel: string;
    pending: string[];
    areas: Array<{ key: string; label: string; complete: boolean }>;
    /** Valores por `field_code` vindos do DB (alimenta o draft inicial). */
    fieldByCode: Record<string, string>;
    /** Valores resolvidos (EMPRESA, CIDADE, ESCOPO_AREA…) — base do preview server-side. */
    templateData: Record<string, string>;
  };
};

// ─── Seções e campos ──────────────────────────────────────────────────────────

const SECTION_META = {
  cliente: {
    title: "Cliente",
    description: "Cadastro, endereço e qualificação usados no cabeçalho do documento.",
    codes: new Set([
      "cp_proposta_empresas_json",
      "cp_cliente_cep",
      "cp_cliente_logradouro",
      "cp_cliente_bairro",
      "cp_cliente_cidade",
      "cp_cliente_uf",
      "cp_cliente_numero",
      "cp_cliente_complemento",
      "cp_qualificacao",
    ]),
  },
  objeto: {
    title: "Objeto",
    description: "Síntese comercial e objeto da proposta antes dos blocos jurídicos.",
    codes: new Set(["cp_objeto_proposta", "cp_areas_objeto"]),
  },
  condicoes: {
    title: "Condições",
    description: "Prazos, tributação, due diligence e dados comerciais complementares.",
    codes: new Set([
      "cp_realizou_due",
      "cp_link_arquivo_due",
      "cp_gestor_contrato",
      "cp_nome_focal",
      "cp_email_focal",
      "cp_tel_focal",
      "cp_captador",
      "cp_tributacao",
      "cp_prazo_entrega",
      "cp_primeiro_vencimento",
      "cp_info_adicionais",
    ]),
  },
} as const;

type SectionKey = keyof typeof SECTION_META;

type ProposalStepKey =
  | "responsavel"
  | "cliente"
  | "objeto"
  | "escopo"
  | "condicoes"
  | "investimento";

const PROPOSAL_STEPS: Array<{
  key: ProposalStepKey;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    key: "responsavel",
    label: "Responsável",
    description: "Quem envia e assina a proposta comercial.",
    icon: UserRound,
  },
  {
    key: "cliente",
    label: "Cliente",
    description: "Cadastro e qualificação usados no documento.",
    icon: Building2,
  },
  {
    key: "objeto",
    label: "Objeto",
    description: "Contexto comercial e áreas abrangidas.",
    icon: Target,
  },
  {
    key: "escopo",
    label: "Escopo",
    description: "Entregas detalhadas de cada área selecionada.",
    icon: ListChecks,
  },
  {
    key: "condicoes",
    label: "Condições",
    description: "Prazos e informações comerciais complementares.",
    icon: SlidersHorizontal,
  },
  {
    key: "investimento",
    label: "Investimento",
    description: "Valor total e forma de pagamento da proposta.",
    icon: BadgeDollarSign,
  },
];

// ─── Componente principal (card externo) ──────────────────────────────────────

export function PropostaDocumentBuilder({
  lead,
  viewer,
  proposalPipelineFields,
  escopoDetalhe,
  propostaEmpresaPrincipalNome,
}: {
  lead: LeadDetailData;
  viewer: LeadDetailViewer | null;
  proposalPipelineFields: LeadDetailData["pipelineFields"];
  escopoDetalhe: LeadDetailData["escopoDetalhe"];
  propostaEmpresaPrincipalNome: string | null;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [docState, setDocState] = useState<DocumentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const refreshState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatesRes, docRes] = await Promise.all([
        fetch("/api/crm/document-templates", { cache: "no-store" }),
        fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/document`, { cache: "no-store" }),
      ]);
      const templatesJson = (await templatesRes.json()) as { ok?: boolean; data?: Template[]; error?: string };
      const docJson = (await docRes.json()) as { ok?: boolean; data?: DocumentState; error?: string };
      if (!templatesRes.ok || !templatesJson.ok) {
        throw new Error(formatDocumentBuilderError(templatesJson.error ?? "Falha ao carregar modelos."));
      }
      if (!docRes.ok || !docJson.ok || !docJson.data) {
        throw new Error(formatDocumentBuilderError(docJson.error ?? "Falha ao carregar documento."));
      }
      setTemplates(templatesJson.data ?? []);
      setDocState(docJson.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar documento.");
    } finally {
      setLoading(false);
    }
  }, [lead.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshState(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshState]);

  useEffect(() => {
    if (loading || !docState || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setBuilderOpen(true);
  }, [docState, loading]);

  const hasInstance = Boolean(docState?.instance);

  if (loading) {
    return (
      <section className={documentBuilderHubClass}>
        <div className="flex min-h-24 items-center justify-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Preparando o editor da proposta…
        </div>
      </section>
    );
  }

  if (error || !docState) {
    return (
      <section className={documentBuilderHubClass}>
        <div className="flex flex-col items-start gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-2 text-sm text-danger-text">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Não foi possível abrir a proposta</p>
              <p className="mt-0.5 text-muted-foreground">{error ?? "Documento indisponível."}</p>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshState()}>
            Tentar novamente
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className={documentBuilderHubClass}>
      <DocumentBuilderHubHeader
        eyebrow="Documentos / Propostas"
        title="Workspace de proposta"
        description={
          hasInstance
            ? "Continue o rascunho diretamente no editor com formulário e prévia lado a lado."
            : "Crie a proposta diretamente no editor com formulário e prévia lado a lado."
        }
        actions={
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="gap-2"
            onClick={() => setBuilderOpen(true)}
          >
            <PenLine className="size-4" aria-hidden />
            Abrir editor
          </Button>
        }
      />

      {/* ── Dialog split-pane ── */}
      {builderOpen ? (
        <PropostaBuilderDialog
          lead={lead}
          viewer={viewer}
          proposalPipelineFields={proposalPipelineFields}
          escopoDetalhe={escopoDetalhe}
          propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
          templates={templates}
          docState={docState}
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          onRefresh={refreshState}
        />
      ) : null}
    </section>
  );
}

// ─── Dialog split-pane ────────────────────────────────────────────────────────

function PropostaBuilderDialog({
  lead,
  viewer,
  proposalPipelineFields,
  escopoDetalhe,
  propostaEmpresaPrincipalNome,
  templates,
  docState,
  open,
  onOpenChange,
  onRefresh,
}: {
  lead: LeadDetailData;
  viewer: LeadDetailViewer | null;
  proposalPipelineFields: LeadDetailData["pipelineFields"];
  escopoDetalhe: LeadDetailData["escopoDetalhe"];
  propostaEmpresaPrincipalNome: string | null;
  templates: Template[];
  docState: DocumentState;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  useBodyScrollLock(open);

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedTemplateId] = useState(
    docState.template?.id ?? (templates[0]?.id ?? ""),
  );
  const [savedTemplateId, setSavedTemplateId] = useState(
    docState.template?.id ?? (templates[0]?.id ?? ""),
  );

  // Draft / saved dos campos cp_*. Inicializa a partir do snapshot do servidor.
  // Edição é local; persistência acontece em batch via `persistAllFields()`.
  const initialEscopoJson =
    escopoDetalhe?.value ?? docState.snapshot.fieldByCode?.cp_escopo_detalhe_json ?? "";
  const [draftValues, setDraftValues] = useState<Record<string, string>>(
    () => ({
      ...(docState.snapshot.fieldByCode ?? {}),
      ...(escopoDetalhe ? { cp_escopo_detalhe_json: initialEscopoJson } : {}),
    }),
  );
  const [savedValues, setSavedValues] = useState<Record<string, string>>(
    () => ({
      ...(docState.snapshot.fieldByCode ?? {}),
      ...(escopoDetalhe ? { cp_escopo_detalhe_json: initialEscopoJson } : {}),
    }),
  );

  // O escopo local é propagado imediatamente pelo editor de áreas.
  const [escopoJson, setEscopoJson] = useState<string>(initialEscopoJson);
  const leadCreatorField = lead.intakeFields.find((field) => field.key === "cadastrado_por");
  const leadCreatorName = leadCreatorField?.resolvedUser?.fullName?.trim() ?? "";
  const initialResponsavel = docState.snapshot.responsavel?.trim() || leadCreatorName;
  const [responsavel, setResponsavel] = useState(initialResponsavel);
  const [savedResponsavel, setSavedResponsavel] = useState(docState.snapshot.responsavel ?? "");
  const [proposalUsers, setProposalUsers] = useState<ProposalUserOption[]>([]);
  const [proposalUsersLoading, setProposalUsersLoading] = useState(true);
  const [generatedAt] = useState(() => new Date().toISOString());
  const [previewing, setPreviewing] = useState(false);
  const [docxPreview, setDocxPreview] = useState<ProposalDocxPreviewState>({
    blob: null,
    sourceSha256: null,
    updating: false,
    error: null,
  });
  const docxPreviewControllerRef = useRef<ReturnType<
    typeof createProposalDocxPreviewController
  > | null>(null);
  const [scopeSaving, setScopeSaving] = useState(false);
  const operationRef = useRef(false);
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const urls = downloadUrls.current;
    return () => {
      for (const [url, timer] of urls) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmClose, setConfirmClose] = useState(false);
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");
  const [activeStep, setActiveStep] = useState<ProposalStepKey>("responsavel");

  const [scopeCatalog, setScopeCatalog] = useState<PropostaTiposCatalog>(PROPOSTA_TIPOS_CATALOG);
  const [investmentCatalog, setInvestmentCatalog] = useState<InvestimentoTipoDef[]>(
    PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetch("/api/crm/lead-form-options", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          ok?: boolean;
          data?: { systemUsers?: ProposalUserOption[] };
        };
        if (!response.ok || !json.ok) throw new Error("Falha ao carregar colaboradores.");
        return json.data?.systemUsers ?? [];
      })
      .then((users) => {
        setProposalUsers(users);
        if (docState.snapshot.responsavel?.trim() || leadCreatorName) return;
        const creatorReference = leadCreatorField?.value?.trim().toLocaleLowerCase("pt-BR");
        const creator = creatorReference
          ? users.find(
              (user) =>
                user.id.toLocaleLowerCase("pt-BR") === creatorReference ||
                user.email.toLocaleLowerCase("pt-BR") === creatorReference ||
                user.name.toLocaleLowerCase("pt-BR") === creatorReference,
            )
          : null;
        if (creator) setResponsavel((current) => current.trim() || creator.name);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProposalUsers([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProposalUsersLoading(false);
      });
    return () => controller.abort();
  }, [
    docState.snapshot.responsavel,
    leadCreatorField?.value,
    leadCreatorName,
    open,
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/crm/proposal-catalog", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (json: {
          ok?: boolean;
          data?: { scope?: PropostaTiposCatalog; investment?: InvestimentoTipoDef[] };
        } | null) => {
          if (cancelled || !json?.ok || !json.data) return;
          if (json.data.scope) setScopeCatalog(json.data.scope);
          if (json.data.investment) setInvestmentCatalog(json.data.investment);
        },
      )
      .catch(() => {
        // Fallback estático já carregado.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const busy = saving || generating || previewing || scopeSaving;

  const isDirty = useMemo(() => {
    if (selectedTemplateId !== savedTemplateId || responsavel !== savedResponsavel) return true;
    // Compara só chaves que existem em qualquer um dos dois mapas
    const keys = new Set([...Object.keys(draftValues), ...Object.keys(savedValues)]);
    for (const k of keys) {
      if ((draftValues[k] ?? "") !== (savedValues[k] ?? "")) return true;
    }
    return false;
  }, [draftValues, savedValues, selectedTemplateId, savedTemplateId, responsavel, savedResponsavel]);

  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? docState.template;
  const selectedProposalUser = useMemo(
    () =>
      proposalUsers.find(
        (user) =>
          user.name.trim().toLocaleLowerCase("pt-BR") ===
          responsavel.trim().toLocaleLowerCase("pt-BR"),
      ) ?? null,
    [proposalUsers, responsavel],
  );

  const fieldsBySection = useMemo(() => {
    const out: Record<SectionKey | "revisao", LeadDetailData["pipelineFields"]> = {
      cliente: [],
      objeto: [],
      condicoes: [],
      revisao: [],
    };
    for (const field of proposalPipelineFields) {
      if (field.fieldCode === "cp_escopo_detalhe_json") continue;
      const target =
        (Object.entries(SECTION_META).find(([, meta]) => meta.codes.has(field.fieldCode))?.[0] as
          | SectionKey
          | undefined) ?? "revisao";
      out[target].push(field);
    }
    return out;
  }, [proposalPipelineFields]);

  const areasField = proposalPipelineFields.find((f) => f.fieldCode === "cp_areas_objeto");

  const syncEscopoJsonFromDraft = useCallback(
    (json: string) => {
      const { escopo, investimentoDocumento } = parseEscopoJsonWithMeta(json);
      const areas = parseAreasList(draftValues.cp_areas_objeto ?? areasField?.value ?? "");
      const resolved = resolveInvestimentoDocumento(
        escopo,
        areas,
        investimentoDocumento,
        investmentCatalog,
      );
      const next = stringifyEscopoJsonWithMeta(escopo, resolved);
      setEscopoJson((prev) => (prev === next ? prev : next));
      setDraftValues((prev) =>
        prev.cp_escopo_detalhe_json === next ? prev : { ...prev, cp_escopo_detalhe_json: next },
      );
      setFeedback(null);
    },
    [draftValues.cp_areas_objeto, areasField?.value, investmentCatalog],
  );

  // Canônico local usado para validar o rascunho antes de salvar ou gerar.
  // A prévia visual não usa este objeto para desenhar páginas: o servidor
  // renderiza o Word oficial e o navegador exibe os próprios bytes DOCX.
  const previewCanonical = useMemo<CanonicalProposalData | null>(() => {
    try {
      return buildCanonicalProposalData({
        empresasIntake: lead.empresasIntake ?? [],
        cpPropostaEmpresasJson: draftValues.cp_proposta_empresas_json,
        fieldByCode: draftValues,
        cpEscopoDetalheJson: draftValues.cp_escopo_detalhe_json ?? "",
        generatedAt: new Date(generatedAt),
        responsavel,
        scopeCatalog,
        investmentCatalog,
      });
    } catch {
      return null;
    }
  }, [draftValues, generatedAt, responsavel, lead.empresasIntake, scopeCatalog, investmentCatalog]);

  const currentValidation = useMemo(() => {
    if (!previewCanonical) return ["Não foi possível validar o rascunho atual. Revise os campos da proposta."];
    try {
      return listProposalPendingFields({
        templateFields: selectedTemplate.fields ?? [],
        fieldByCode: draftValues,
        templateData: previewCanonical.templateData,
        scopeCatalog,
        investmentCatalog,
        responsavel,
      });
    } catch {
      return ["Não foi possível validar o rascunho atual. Revise os campos da proposta."];
    }
  }, [previewCanonical, draftValues, responsavel, scopeCatalog, investmentCatalog, selectedTemplate]);
  const pending = currentValidation;

  const pendingByStep = useMemo(() => {
    const counts: Record<ProposalStepKey, number> = {
      responsavel: 0,
      cliente: 0,
      objeto: 0,
      escopo: 0,
      condicoes: 0,
      investimento: 0,
    };

    for (const item of pending) {
      const step = proposalStepForPendingItem(item, selectedTemplate.fields);
      counts[step] += 1;
    }

    return counts;
  }, [pending, selectedTemplate.fields]);

  const completedStepCount = PROPOSAL_STEPS.filter(
    (step) => pendingByStep[step.key] === 0,
  ).length;
  const activeStepIndex = PROPOSAL_STEPS.findIndex((step) => step.key === activeStep);
  const activeStepMeta = PROPOSAL_STEPS[activeStepIndex] ?? PROPOSAL_STEPS[0]!;
  const ActiveStepIcon = activeStepMeta.icon;

  const scheduleDocxPreview = useCallback(() => {
    if (!selectedTemplateId) return;
    docxPreviewControllerRef.current?.schedule(
      `/api/crm/leads/${encodeURIComponent(lead.id)}/document/preview`,
      {
        templateId: selectedTemplateId,
        generatedAt,
        responsavel,
        draftValues: selectProposalDraftValues(draftValues),
      },
    );
  }, [draftValues, generatedAt, lead.id, responsavel, selectedTemplateId]);

  useEffect(() => {
    if (!open) return;
    const controller = createProposalDocxPreviewController({
      onState: setDocxPreview,
    });
    docxPreviewControllerRef.current = controller;
    return () => {
      docxPreviewControllerRef.current = null;
      controller.dispose();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedTemplateId) return;
    scheduleDocxPreview();
  }, [open, scheduleDocxPreview, selectedTemplateId]);

  function fieldChange(code: string, value: string) {
    setDraftValues((prev) => ({ ...prev, [code]: value }));
    setFeedback(null);
  }

  async function persistAllFields() {
    setSaving(true);
    const definitionIds = new Map(proposalPipelineFields.map((field) => [field.fieldCode, field.definitionId]));
    if (escopoDetalhe) definitionIds.set("cp_escopo_detalhe_json", escopoDetalhe.definitionId);
    try {
      const saved = await persistProposalDraft({
        leadId: lead.id,
        templateId: selectedTemplateId,
        responsavel,
        draftValues,
        savedValues,
        definitionIds,
      });
      setSavedTemplateId(saved.templateId);
      setSavedResponsavel(saved.responsavel);
      setSavedValues(saved.draftValues);
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    if (operationRef.current || scopeSaving) return;
    operationRef.current = true;
    setSaveError(null);
    setFeedback(null);
    try {
      await persistAllFields();
      setFeedback("Rascunho salvo com sucesso.");
      await onRefresh();
      router.refresh();
    } catch (error) {
      setSaveError((error instanceof Error ? error.message : "Falha ao salvar.") + " O salvamento pode estar parcial. Revise e tente novamente.");
    } finally {
      operationRef.current = false;
    }
  }

  async function downloadDocument(preview = false) {
    if (operationRef.current || scopeSaving || !selectedTemplateId || (!preview && pending.length > 0)) return;
    operationRef.current = true;
    setPreviewing(preview);
    setGenerating(!preview);
    setSaveError(null);
    setFeedback(null);
    // Capture one immutable draft for this request, including edits not yet saved.
    const payload = {
      templateId: selectedTemplateId,
      generatedAt,
      responsavel,
      ...(preview ? { draftValues: selectProposalDraftValues(draftValues) } : {}),
    };
    try {
      if (!preview && isDirty) await persistAllFields();
      const response = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/document/${preview ? "preview" : "generate-docx"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { blob, filename } = await readProposalDocxResponse(response);
      const url = URL.createObjectURL(blob);
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60_000);
      downloadUrls.current.set(url, timer);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      setFeedback(preview ? "Prévia Word baixada com o rascunho atual. Os dados não foram salvos." : "Proposta Word gerada e baixada.");
      if (!preview) {
        await onRefresh();
        router.refresh();
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Não foi possível gerar a proposta.");
    } finally {
      setGenerating(false);
      setPreviewing(false);
      operationRef.current = false;
    }
  }

  function handleCloseAttempt() {
    if (busy || operationRef.current) return;
    if (isDirty) {
      setConfirmClose(true);
    } else {
      onOpenChange(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Dialog modal={false} open={open} onOpenChange={() => undefined}>
        <DialogContent
          hideCloseButton
          onPointerDownOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isInteractionFromBaseUiSelectLayer(event)) event.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCloseAttempt();
          }}
          className={documentBuilderDialogClass}
        >
          <DialogTitle className="sr-only">Elaborar Proposta</DialogTitle>
          <DialogDescription className="sr-only">
            Preencha as seções da proposta e confira o documento Word oficial na prévia.
          </DialogDescription>
          <DocumentBuilderDialogHeader
            icon={<PenLine className="size-4" aria-hidden />}
            title="Elaborar Proposta"
            description="Preencha as seções da proposta e confira o documento Word oficial na prévia."
            saving={saving}
            dirty={isDirty}
            mobilePane={mobilePane}
            onMobilePaneChange={setMobilePane}
            onClose={handleCloseAttempt}
            closeDisabled={busy}
            actions={
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={busy || !isDirty}
                  onClick={() => void saveDraft()}
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
                  variant="primary"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy || !selectedTemplateId || pending.length > 0}
                  onClick={() => void downloadDocument()}
                >
                  {generating ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="size-3.5" aria-hidden />
                  )}
                  Gerar Word
                </Button>
              </>
            }
          />

          {/* Feedback / erro */}
          {(feedback ?? saveError) ? (
            <div
              className={cn(
                "shrink-0 px-5 py-2 text-sm font-medium sm:px-6",
                saveError
                  ? "bg-danger-bg text-danger-text"
                  : "bg-success-bg text-success-text",
              )}
            >
              {saveError ?? feedback}
            </div>
          ) : null}

          {/* ── Body split-pane ── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
            {/* Painel esquerdo — preenchimento guiado */}
            <aside
              inert={busy}
              className={cn(
                "crm-scrollbar min-h-0 w-full overscroll-contain overflow-y-auto border-border bg-surface-subtle md:block md:min-w-[440px] md:w-[54%] md:flex-none md:border-r lg:w-[55%] xl:w-[54%]",
                mobilePane === "edit" ? "flex-1" : "hidden md:block",
              )}
            >
              <div className="sticky top-0 z-(--z-sticky) border-b border-border bg-white px-5 pb-4 pt-5 sm:px-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
                      Preenchimento
                    </p>
                    <h3 className="mt-1 text-v2-heading-md text-foreground">
                      {completedStepCount} de {PROPOSAL_STEPS.length} seções concluídas
                    </h3>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-(--radius-v2-full) px-2.5 py-1 text-v2-caption-medium",
                      pending.length > 0
                        ? "border border-warning-border bg-warning-bg text-warning-text"
                        : "border border-success-border bg-success-bg text-success-text",
                    )}
                  >
                    {pending.length > 0 ? `${pending.length} pendência(s)` : "Pronto para gerar"}
                  </span>
                </div>

                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-(--radius-v2-full) bg-surface-subtle"
                  role="progressbar"
                  aria-label="Progresso do preenchimento"
                  aria-valuemin={0}
                  aria-valuemax={PROPOSAL_STEPS.length}
                  aria-valuenow={completedStepCount}
                >
                  <div
                    className="h-full rounded-(--radius-v2-full) bg-interactive-600 transition-[width] duration-300"
                    style={{ width: `${(completedStepCount / PROPOSAL_STEPS.length) * 100}%` }}
                  />
                </div>

                <div
                  className="crm-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1"
                  role="tablist"
                  aria-label="Seções da proposta"
                >
                  {PROPOSAL_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = step.key === activeStep;
                    const stepPending = pendingByStep[step.key];
                    return (
                      <button
                        key={step.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-controls="proposal-step-panel"
                        onClick={() => setActiveStep(step.key)}
                        className={cn(
                          "flex min-w-[7.25rem] items-center gap-2 rounded-(--radius-v2-md) border px-3 py-2 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isActive
                            ? "border-interactive-300 bg-interactive-50 text-interactive-800"
                            : "border-border bg-white text-text-secondary-v2 hover:border-border-strong hover:bg-surface-hover",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-(--radius-v2-md)",
                            isActive ? "bg-white text-interactive-700" : "bg-surface-subtle text-text-muted-v2",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-bold uppercase tracking-wider opacity-60">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="block truncate text-xs font-bold">{step.label}</span>
                        </span>
                        {stepPending === 0 ? (
                          <CheckCircle2 className="ml-auto size-3.5 shrink-0 text-emerald-600" aria-label="Concluída" />
                        ) : (
                          <span className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-(--radius-v2-full) bg-warning-bg text-[10px] font-semibold text-warning-text">
                            {stepPending}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="px-5 py-5 sm:px-6">
                <section
                  id="proposal-step-panel"
                  role="tabpanel"
                  className="overflow-hidden rounded-(--radius-v2-xl) border border-border bg-white"
                >
                  <div className="flex items-start gap-3 border-b border-border bg-surface-subtle px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) bg-interactive-50 text-interactive-700">
                      <ActiveStepIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-v2-heading-md text-foreground">
                          {activeStepMeta.label}
                        </h3>
                        {pendingByStep[activeStep] > 0 ? (
                          <span className="rounded-(--radius-v2-full) border border-warning-border bg-warning-bg px-2 py-0.5 text-v2-caption-medium text-warning-text">
                            {pendingByStep[activeStep]} pendência(s)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-v2-caption-medium text-success-text">
                            <CheckCircle2 className="size-3" aria-hidden />
                            Concluída
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {activeStepMeta.description}
                      </p>
                    </div>
                  </div>

                  <div className="p-5">
                    {activeStep === "responsavel" ? (
                      <div className="space-y-2">
                        <Label htmlFor="proposal-responsavel" className="text-xs font-medium text-foreground">
                          Enviado por
                        </Label>
                        <Select
                          modal={false}
                          value={selectedProposalUser?.id ?? ""}
                          onValueChange={(userId) => {
                            const user = proposalUsers.find((item) => item.id === userId);
                            if (!user) return;
                            setResponsavel(user.name);
                            setFeedback(null);
                          }}
                          disabled={busy || proposalUsersLoading}
                        >
                          <SelectTrigger
                            id="proposal-responsavel"
                            className="h-auto min-h-10 w-full rounded-(--radius-v2-md) border-border bg-white px-3 py-2 [&_[data-slot=select-value]]:w-full"
                          >
                            {proposalUsersLoading ? (
                              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                Carregando colaboradores…
                              </span>
                            ) : responsavel ? (
                              <CrmUserLabel
                                name={responsavel}
                                avatarUrl={selectedProposalUser?.avatarUrl}
                                size="sm"
                                variant="inline"
                              />
                            ) : (
                              <CrmSelectValue placeholder="Selecione um colaborador…" />
                            )}
                          </SelectTrigger>
                          <CrmSelectContent className="max-h-72">
                            {proposalUsers.map((user) => (
                              <CrmSelectItem key={user.id} value={user.id} className="py-1.5">
                                <CrmUserLabel
                                  name={user.name}
                                  avatarUrl={user.avatarUrl}
                                  size="sm"
                                  variant="inline"
                                />
                              </CrmSelectItem>
                            ))}
                          </CrmSelectContent>
                        </Select>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Usamos quem cadastrou o lead como padrão. Esse nome aparecerá no documento oficial.
                        </p>
                      </div>
                    ) : null}

                    {activeStep === "cliente" ? (
                      fieldsBySection.cliente.length > 0 ? (
                        <BuilderSection
                          meta={SECTION_META.cliente}
                          fields={fieldsBySection.cliente}
                          draftValues={draftValues}
                          onChange={fieldChange}
                          disabled={busy}
                          propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
                          embedded
                        />
                      ) : (
                        <ProposalStepEmptyState text="Este modelo não possui campos específicos de cliente." />
                      )
                    ) : null}

                    {activeStep === "objeto" ? (
                      fieldsBySection.objeto.length > 0 ? (
                        <BuilderSection
                          meta={SECTION_META.objeto}
                          fields={fieldsBySection.objeto}
                          draftValues={draftValues}
                          onChange={fieldChange}
                          disabled={busy}
                          embedded
                        />
                      ) : (
                        <ProposalStepEmptyState text="Este modelo não possui campos específicos de objeto." />
                      )
                    ) : null}

                    {activeStep === "escopo" ? (
                      escopoDetalhe && areasField ? (
                        <div className="space-y-5">
                          <p className="rounded-xl bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-800">
                            Cada área selecionada cria um bloco próprio no Word. Valores e pagamento são definidos na etapa Investimento.
                          </p>
                          <PropostaEscopoPorArea
                            leadId={lead.id}
                            fieldDefinitionId={escopoDetalhe.definitionId}
                            initialValue={escopoJson}
                            savedValue={savedValues.cp_escopo_detalhe_json ?? ""}
                            areasDisplay={draftValues.cp_areas_objeto ?? areasField.value}
                            defaultNomeEmpresa={propostaEmpresaPrincipalNome}
                            viewerProfileArea={viewer?.area ?? null}
                            viewerRole={viewer?.role ?? null}
                            solicitacoes={lead.escopoSolicitacoes ?? []}
                            className="border-0 bg-transparent p-0"
                            disabled={busy}
                            onSavingChange={setScopeSaving}
                            onSaved={(json) => {
                              setSavedValues((previous) => ({ ...previous, cp_escopo_detalhe_json: json }));
                            }}
                            onEscopoDraftChange={syncEscopoJsonFromDraft}
                          />
                          {lead.escopoSolicitacoes && lead.escopoSolicitacoes.length > 0 ? (
                            <PropostaEscopoAreaCoordenacao
                              leadId={lead.id}
                              solicitacoes={lead.escopoSolicitacoes}
                              viewer={viewer ? { area: viewer.area } : null}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <ProposalStepEmptyState text="Selecione ao menos uma área na etapa Objeto para configurar o escopo." />
                      )
                    ) : null}

                    {activeStep === "condicoes" ? (
                      fieldsBySection.condicoes.length > 0 || fieldsBySection.revisao.length > 0 ? (
                        <div className="space-y-6">
                          <BuilderSection
                            meta={SECTION_META.condicoes}
                            fields={fieldsBySection.condicoes}
                            draftValues={draftValues}
                            onChange={fieldChange}
                            disabled={busy}
                            embedded
                          />
                          {fieldsBySection.revisao.length > 0 ? (
                            <div className={cn(fieldsBySection.condicoes.length > 0 && "border-t border-border pt-5")}>
                              <div className="mb-4">
                                <p className="text-v2-heading-md text-foreground">Informações adicionais</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Campos complementares definidos para este modelo.
                                </p>
                              </div>
                              <BuilderSection
                                meta={{
                                  title: "Informações adicionais",
                                  description: "Campos complementares definidos para este modelo.",
                                }}
                                fields={fieldsBySection.revisao}
                                draftValues={draftValues}
                                onChange={fieldChange}
                                disabled={busy}
                                embedded
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <ProposalStepEmptyState text="Este modelo não possui condições complementares para preencher." />
                      )
                    ) : null}

                    {activeStep === "investimento" ? (
                      escopoDetalhe && areasField ? (
                        <PropostaInvestimentoConsolidadoForm
                          escopoJson={escopoJson}
                          areasDisplay={draftValues.cp_areas_objeto ?? areasField.value ?? ""}
                          investmentCatalog={investmentCatalog}
                          disabled={busy}
                          onEscopoJsonChange={syncEscopoJsonFromDraft}
                        />
                      ) : (
                        <ProposalStepEmptyState text="Configure as áreas e o escopo antes de preencher o investimento." />
                      )
                    ) : null}
                  </div>
                </section>

                {pending.length > 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <TriangleAlert className="size-4 text-amber-600" aria-hidden />
                      <p className="text-xs font-extrabold text-amber-900">Itens que ainda impedem a geração</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pending.slice(0, 6).map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() =>
                            setActiveStep(proposalStepForPendingItem(item, selectedTemplate.fields))
                          }
                          className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-amber-800 transition-colors hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                          {item}
                        </button>
                      ))}
                      {pending.length > 6 ? (
                        <span className="px-1 py-1.5 text-[11px] font-semibold text-amber-700">
                          + {pending.length - 6} itens
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="sticky bottom-0 z-(--z-sticky) flex items-center justify-between gap-3 border-t border-border bg-white px-5 py-3 sm:px-6">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  disabled={busy || activeStepIndex === 0}
                  onClick={() => setActiveStep(PROPOSAL_STEPS[activeStepIndex - 1]!.key)}
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                  Anterior
                </Button>
                <span className="text-v2-caption-medium tabular-nums text-text-muted-v2">
                  {activeStepIndex + 1}/{PROPOSAL_STEPS.length}
                </span>
                {activeStepIndex < PROPOSAL_STEPS.length - 1 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy}
                    onClick={() => setActiveStep(PROPOSAL_STEPS[activeStepIndex + 1]!.key)}
                  >
                    Próxima
                    <ChevronRight className="size-3.5" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="gap-1.5"
                    disabled={busy || !isDirty}
                    onClick={() => void saveDraft()}
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Save className="size-3.5" aria-hidden />
                    )}
                    {isDirty ? "Salvar rascunho" : "Rascunho salvo"}
                  </Button>
                )}
              </div>
            </aside>

            <main
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas",
                mobilePane === "preview" ? "flex" : "hidden md:flex",
              )}
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-v2-heading-md text-foreground">Prévia do Word oficial</h3>
                    {docxPreview.updating ? (
                      <span className="inline-flex items-center gap-1 text-v2-caption-medium text-interactive-700">
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                        Atualizando
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground" role="status">
                    {docxPreview.blob
                      ? "Documento Word renderizado diretamente no navegador."
                      : docxPreview.error
                        ? "A prévia do Word não pôde ser carregada."
                        : "Gerando o modelo Word com o rascunho atual…"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {docxPreview.error ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      disabled={docxPreview.updating || !selectedTemplateId}
                      onClick={scheduleDocxPreview}
                    >
                      <FileText className="size-3.5" aria-hidden />
                      Tentar novamente
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={busy || !selectedTemplateId}
                    onClick={() => void downloadDocument(true)}
                  >
                    {previewing ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <FileDown className="size-3.5" aria-hidden />
                    )}
                    Baixar prévia Word
                  </Button>
                </div>
              </div>
              {docxPreview.blob ? (
                <div className="relative min-h-0 flex-1">
                  <ProposalDocxPreview blob={docxPreview.blob} />
                  {docxPreview.updating ? (
                    <div className="pointer-events-none absolute right-4 top-4 inline-flex items-center gap-2 rounded-(--radius-v2-full) border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-(--shadow-v2-sm)">
                      <Loader2 className="size-3.5 animate-spin text-interactive-700" aria-hidden />
                      Atualizando o Word…
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                  {docxPreview.updating ? (
                    <Loader2 className="size-8 animate-spin text-interactive-700" aria-hidden />
                  ) : (
                    <FileText className="size-9" aria-hidden />
                  )}
                  <p className="max-w-md text-sm">
                    {docxPreview.error ??
                      "Aguarde enquanto o documento Word é preparado para exibição."}
                  </p>
                </div>
              )}
              <p className="shrink-0 border-t border-border bg-white px-4 py-2 text-xs text-muted-foreground">
                Prévia renderizada no navegador a partir do mesmo arquivo Word disponível para download.
              </p>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de descarte do modelo */}
      <AlertDialog open={confirmClose}>
        <AlertDialogContent
          className="z-(--z-drag-overlay)"
          overlayClassName="z-(--z-tooltip)"
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Há alterações no rascunho que ainda não foram salvas. Deseja descartar e fechar?
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDocumentBuilderError(message: string): string {
  if (
    message.includes("document_templates") ||
    message.includes("document_instances") ||
    message.includes("document_versions")
  ) {
    return `${message} Aplique a migration 20260424170000_document_builder_templates_versions.sql no Supabase.`;
  }
  return message;
}

function proposalStepForFieldCode(fieldCode: string): ProposalStepKey {
  if (fieldCode === "cp_escopo_detalhe_json") return "escopo";
  if ((SECTION_META.cliente.codes as ReadonlySet<string>).has(fieldCode)) return "cliente";
  if ((SECTION_META.objeto.codes as ReadonlySet<string>).has(fieldCode)) return "objeto";
  if ((SECTION_META.condicoes.codes as ReadonlySet<string>).has(fieldCode)) return "condicoes";
  return "condicoes";
}

function proposalStepForPendingItem(
  item: string,
  templateFields: ProposalRequiredField[],
): ProposalStepKey {
  const normalized = item.toLocaleLowerCase("pt-BR");
  if (normalized.includes("enviado por")) return "responsavel";
  if (normalized.includes("investimento")) return "investimento";
  if (normalized.includes("escopo")) return "escopo";
  if (
    normalized === "empresa" ||
    normalized.includes("cpf/cnpj") ||
    normalized.includes("cliente")
  ) {
    return "cliente";
  }

  const matchedField = templateFields.find(
    (field) =>
      userFacingFieldLabel(field.label, field.fieldCode).toLocaleLowerCase("pt-BR") ===
      normalized,
  );
  return matchedField ? proposalStepForFieldCode(matchedField.fieldCode) : "condicoes";
}

function ProposalStepEmptyState({ text }: { text: string }) {
  return (
    <div className={documentEmptyStateClass}>
      <span className="flex size-10 items-center justify-center rounded-(--radius-v2-md) border border-border bg-white text-text-muted-v2">
        <ListChecks className="size-4" aria-hidden />
      </span>
      <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-text-secondary-v2">{text}</p>
    </div>
  );
}

// ─── BuilderSection ───────────────────────────────────────────────────────────

function BuilderSection({
  meta,
  fields,
  draftValues,
  onChange,
  disabled,
  propostaEmpresaPrincipalNome,
  embedded = false,
}: {
  meta: { title: string; description: string };
  fields: LeadDetailData["pipelineFields"];
  draftValues: Record<string, string>;
  onChange: (code: string, value: string) => void;
  disabled?: boolean;
  propostaEmpresaPrincipalNome?: string | null;
  embedded?: boolean;
}) {
  if (fields.length === 0) return null;
  return (
    <section className={cn(!embedded && "rounded-(--radius-v2-xl) border border-border bg-white p-5")}>
      {!embedded ? (
        <div className="mb-4">
          <h3 className="text-v2-heading-md text-foreground">{meta.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          if (field.fieldCode === "cp_qualificacao") return null;
          if (field.fieldCode === "cp_proposta_empresas_json") {
            return (
              <ProposalCompanySummary
                key={field.definitionId}
                value={draftValues[field.fieldCode] ?? field.value}
                empresaNome={propostaEmpresaPrincipalNome}
              />
            );
          }
          return (
            <PropFieldInput
              key={field.definitionId}
              field={field}
              value={draftValues[field.fieldCode] ?? ""}
              onChange={(v) => onChange(field.fieldCode, v)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </section>
  );
}

// ─── PropFieldInput — controlled input para campos cp_* ──────────────────────

function PropFieldInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: LeadDetailData["pipelineFields"][number];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const label = userFacingFieldLabel(field.label, field.fieldCode);
  const pe = pipelineFieldToEditorProps(field);
  const wrapperClass = field.fieldType === "textarea" ? "sm:col-span-2" : undefined;

  if (field.fieldCode === "cp_tributacao") {
    const selected = normalizeTributacaoValue(value);
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
        <Label className="text-xs font-medium text-foreground">Tributação</Label>
        <Select
          value={selected}
          onValueChange={(v) => {
            if (v) onChange(normalizeTributacaoValue(v) || v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="rounded-(--radius-v2-md) border-border bg-white text-sm">
            <CrmSelectValue
              value={selected}
              labels={PROPOSTA_TRIBUTACAO_LABELS}
              placeholder="Incluindo ou não tributos"
            />
          </SelectTrigger>
          <CrmSelectContent inModal>
            {PROPOSTA_TRIBUTACAO_OPTIONS.map((opt) => (
              <CrmSelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </CrmSelectItem>
            ))}
          </CrmSelectContent>
        </Select>
      </div>
    );
  }

  // SELECT (com opções definidas)
  if (pe.kind === "select" && pe.selectOptions && pe.selectOptions.length > 0) {
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <Select
          value={value}
          onValueChange={(v) => {
            if (v) onChange(v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="rounded-(--radius-v2-md) border-border bg-white text-sm">
            <span className={cn("text-left", !value && "text-muted-foreground")}>
              {value || "Selecionar..."}
            </span>
          </SelectTrigger>
          <CrmSelectContent>
            {pe.selectOptions.map((opt) => (
              <CrmSelectItem key={opt} value={opt}>
                {opt}
              </CrmSelectItem>
            ))}
          </CrmSelectContent>
        </Select>
      </div>
    );
  }

  // DATE
  if (pe.kind === "date") {
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <DateInputBr
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="rounded-(--radius-v2-md) border-border bg-white text-sm"
        />
      </div>
    );
  }

  // TEXTAREA
  if (pe.kind === "textarea") {
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`${label}…`}
          className="min-h-[120px] resize-y rounded-(--radius-v2-md) border-border bg-white text-sm leading-relaxed"
        />
      </div>
    );
  }

  // MULTISELECT — render simples com checkboxes inline (valor stored = "Opt A, Opt B")
  if (pe.kind === "multiselect" && pe.selectOptions && pe.selectOptions.length > 0) {
    const selected = new Set(
      value.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean),
    );
    function toggle(opt: string) {
      const next = new Set(selected);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      onChange([...next].join(", "));
    }
    return (
      <div className={cn("space-y-1.5", "sm:col-span-2")}>
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <div className="flex flex-wrap gap-2 rounded-(--radius-v2-md) border border-border bg-white p-3">
          {pe.selectOptions.map((opt) => {
            const active = selected.has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={disabled}
                className={cn(
                  "min-h-8 rounded-(--radius-v2-full) border px-3 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "border-interactive-600 bg-interactive-600 text-white"
                    : "border-border bg-white text-text-secondary-v2 hover:border-border-strong",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // USER — fallback: usa o editor original com auto-save (UX consistente do picker)
  if (pe.kind === "user") {
    return (
      <LeadDetailFieldEditor
        leadId=""
        scope="pipeline"
        fieldDefinitionId={field.definitionId}
        fieldKey={field.fieldCode}
        label={label}
        value={value || field.value}
        kind="user"
        resolvedUser={field.resolvedUser}
        className={wrapperClass}
        onAfterSave={() => {
          // o editor persiste sozinho; sinaliza ao parent via onChange para
          // o draft refletir o que ficou salvo (refresh do snapshot é feito no save geral)
        }}
      />
    );
  }

  // Default: input texto / email / url / phone / number — todos como texto controlado
  const inputType = pe.kind === "email" ? "email" : pe.kind === "url" ? "url" : "text";

  return (
    <div className={cn("space-y-1.5", wrapperClass)}>
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <Input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={`${label}…`}
        className="rounded-(--radius-v2-md) border-border bg-white text-sm"
      />
    </div>
  );
}

// ─── ProposalCompanySummary ───────────────────────────────────────────────────

function parseProposalCompanySelection(value: string): { primaryIndex: number | null; extrasCount: number } {
  try {
    const parsed = JSON.parse(value) as { primaryIndex?: unknown; extras?: unknown };
    return {
      primaryIndex:
        typeof parsed.primaryIndex === "number" && Number.isFinite(parsed.primaryIndex)
          ? parsed.primaryIndex
          : null,
      extrasCount: Array.isArray(parsed.extras) ? parsed.extras.length : 0,
    };
  } catch {
    return { primaryIndex: null, extrasCount: 0 };
  }
}

function ProposalCompanySummary({
  value,
  empresaNome,
}: {
  value: string;
  empresaNome?: string | null;
}) {
  const selection = parseProposalCompanySelection(value);
  const fallback =
    selection.primaryIndex != null ? `Empresa/Pessoa ${selection.primaryIndex}` : "Empresa principal";

  return (
    <div className="rounded-(--radius-v2-xl) border border-border bg-surface-subtle p-4 sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-v2-md) border border-border bg-white text-interactive-700">
            <Building2 className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-v2-caption-medium uppercase tracking-wide text-text-muted-v2">
              Empresa principal
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-foreground">
              {empresaNome?.trim() || fallback}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Usada no cabeçalho do documento.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-(--radius-v2-full) border border-border bg-white px-2.5 py-1 text-v2-caption-medium text-text-secondary-v2">
          {selection.extrasCount > 0
            ? `${selection.extrasCount} ${selection.extrasCount === 1 ? "adicional" : "adicionais"}`
            : "Sem adicionais"}
        </span>
      </div>
    </div>
  );
}
