"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileDown,
  FileText,
  History,
  Loader2,
  PenLine,
  Save,
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
import { DateInputBr } from "@/components/ui/date-input-br";
import { Select, SelectTrigger } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem, CrmSelectValue } from "@/components/crm/crm-select";
import { cn } from "@/lib/utils";
import { LeadDetailFieldEditor, pipelineFieldToEditorProps } from "./lead-detail-field-editor";
import { buildCanonicalProposalData } from "@/lib/crm/proposta-docx-data";
import { listProposalPendingFields, type ProposalRequiredField } from "@/lib/crm/proposta-document-validation";
import {
  createProposalPdfPreviewController, persistProposalDraft, readProposalDocxResponse,
  readProposalPdfResponse, selectProposalDraftValues, type ProposalPdfPreviewState,
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
    void refreshState();
  }, [refreshState]);

  const pending = docState?.snapshot.pending ?? [];
  const versions = docState?.versions ?? [];
  const hasInstance = Boolean(docState?.instance);

  return (
    <section className="overflow-hidden rounded-[28px] border border-crm-border-warm-strong bg-crm-surface-warm shadow-[0_28px_80px_rgba(16,31,46,0.12)]">
      {/* ── Header ── */}
      <div className="relative overflow-hidden border-b border-white/20 bg-[#0b1724] px-5 py-5 text-white sm:px-6">
        <div className="absolute inset-0 bg-crm-gradient-dark opacity-85" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(45,200,183,0.28),transparent_34%),linear-gradient(135deg,rgba(8,22,36,0.15),rgba(4,13,22,0.92))]" />
        <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-100">
              <FileText className="size-3.5" aria-hidden />
              Documentos / Propostas
            </div>
            <h2 className="mt-3 text-2xl font-extrabold tracking-[-0.045em] text-white">
              Workspace de proposta
            </h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-100/85">
              {hasInstance
                ? "Rascunho em andamento. Clique em \"Elaborar Proposta\" para editar."
                : "Selecione o modelo, preencha os dados e baixe a prévia em Word."}
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
            {hasInstance ? "Continuar Proposta" : "Elaborar Proposta"}
          </Button>
        </div>
      </div>

      {/* ── Status overview ── */}
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-white/50 bg-white/55 p-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Carregando...
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            {error}
          </div>
        ) : null}

        {!loading && docState ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusCard
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
            </StatusCard>

            <StatusCard title="Histórico" icon={History} tone="neutral">
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
            </StatusCard>
          </div>
        ) : null}
      </div>

      {/* ── Dialog split-pane ── */}
      {builderOpen && docState ? (
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

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedTemplateId, setSelectedTemplateId] = useState(
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
  const [responsavel, setResponsavel] = useState(docState.snapshot.responsavel ?? "");
  const [savedResponsavel, setSavedResponsavel] = useState(docState.snapshot.responsavel ?? "");
  const [generatedAt] = useState(() => new Date().toISOString());
  const [previewing, setPreviewing] = useState(false);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<ProposalPdfPreviewState>({
    url: null, sourceSha256: null, updating: false, error: null,
  });
  const [previewRetry, setPreviewRetry] = useState(0);
  const pdfPreviewController = useMemo(() => createProposalPdfPreviewController({ onState: setPdfPreview }), []);
  useEffect(() => {
    if (!open || !selectedTemplateId) return;
    pdfPreviewController.schedule(`/api/crm/leads/${encodeURIComponent(lead.id)}/document/preview`, {
      templateId: selectedTemplateId, draftValues: selectProposalDraftValues(draftValues), responsavel, generatedAt,
    });
    return () => pdfPreviewController.cancelPending();
  }, [pdfPreviewController, open, selectedTemplateId, lead.id, draftValues, responsavel, generatedAt, previewRetry]);
  useEffect(() => () => pdfPreviewController.dispose(), [pdfPreviewController]);
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

  const [scopeCatalog, setScopeCatalog] = useState<PropostaTiposCatalog>(PROPOSTA_TIPOS_CATALOG);
  const [investmentCatalog, setInvestmentCatalog] = useState<InvestimentoTipoDef[]>(
    PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  );

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

  const selectedTemplateName =
    templates.find((t) => t.id === selectedTemplateId)?.name ?? "Selecione um modelo";

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

  const currentValidation = useMemo(() => {
    try {
      const { templateData } = buildCanonicalProposalData({
        empresasIntake: lead.empresasIntake ?? [],
        cpPropostaEmpresasJson: draftValues.cp_proposta_empresas_json,
        fieldByCode: draftValues,
        cpEscopoDetalheJson: draftValues.cp_escopo_detalhe_json ?? "",
        generatedAt: new Date(generatedAt),
        responsavel,
        scopeCatalog,
        investmentCatalog,
      });
      const template = templates.find((item) => item.id === selectedTemplateId) ?? docState.template;
      return listProposalPendingFields({
        templateFields: template.fields ?? [],
        fieldByCode: draftValues,
        templateData,
        scopeCatalog,
        investmentCatalog,
        responsavel,
      });
    } catch {
      return ["Não foi possível validar o rascunho atual. Revise os campos da proposta."];
    }
  }, [draftValues, generatedAt, responsavel, lead.empresasIntake, scopeCatalog, investmentCatalog, templates, selectedTemplateId, docState.template]);
  const pending = currentValidation;

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

  async function downloadDocument(format: "docx" | "pdf", preview = false) {
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
      const response = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/document/${preview ? "preview" : `generate-${format}`}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const { blob, filename } = await (format === "pdf" ? readProposalPdfResponse(response) : readProposalDocxResponse(response));
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
      setFeedback(preview ? "Prévia Word baixada com o rascunho atual. Os dados não foram salvos." : `Proposta ${format === "pdf" ? "PDF" : "Word"} gerada e baixada.`);
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

  function downloadFinal(format: "docx" | "pdf") {
    return downloadDocument(format);
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-green/20 text-emerald-300">
                  <PenLine className="size-4" aria-hidden />
                </span>
                <DialogTitle className="text-base font-extrabold tracking-[-0.02em] text-white">
                  Elaborar Proposta
                </DialogTitle>
                {isDirty ? (
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                    Não salvo
                  </span>
                ) : null}
              </div>
            </div>

            {/* Template selector + ações */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedTemplateId}
                onValueChange={(v) => {
                  if (v) setSelectedTemplateId(v);
                  setFeedback(null);
                }}
                disabled={busy || templates.length === 0}
              >
                <SelectTrigger className="h-9 min-w-[14rem] max-w-[22rem] border-white/25 bg-white/15 text-sm text-white shadow-sm backdrop-blur">
                  <span className="min-w-0 truncate text-left">{selectedTemplateName}</span>
                </SelectTrigger>
                <CrmSelectContent>
                  {templates.map((t) => (
                    <CrmSelectItem key={t.id} value={t.id}>
                      {t.name} v{t.version}
                    </CrmSelectItem>
                  ))}
                </CrmSelectContent>
              </Select>

              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 border-white/25 bg-white/15 text-white shadow-sm backdrop-blur hover:bg-white/20"
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
                variant="teal"
                size="sm"
                className="h-9 gap-1.5"
                disabled={busy || !selectedTemplateId || pending.length > 0}
                onClick={() => void downloadFinal("docx")}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileDown className="size-3.5" aria-hidden />
                )}
                Gerar Word
              </Button>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-white/25 bg-white/15 text-white shadow-sm backdrop-blur hover:bg-white/20"
                disabled={busy || !selectedTemplateId || pending.length > 0}
                onClick={() => void downloadFinal("pdf")}
              >
                {generating ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <FileText className="size-3.5" aria-hidden />
                )}
                Gerar PDF
              </Button>

              <button
                type="button"
                onClick={handleCloseAttempt}
                className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                disabled={busy}
                aria-label="Fechar"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          {/* Feedback / erro */}
          {(feedback ?? saveError) ? (
            <div
              className={cn(
                "shrink-0 px-5 py-2 text-sm font-semibold sm:px-6",
                saveError
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {saveError ?? feedback}
            </div>
          ) : null}

          {/* ── Body split-pane ── */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Painel esquerdo — Formulário */}
            <aside inert={busy} className="crm-scrollbar w-[46%] shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 sm:px-6">
              <div className="space-y-6">
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <Label htmlFor="proposal-responsavel" className="text-sm font-bold text-primary-dark">Enviado por</Label>
                  <Input id="proposal-responsavel" value={responsavel} disabled={busy}
                    onChange={(event) => { setResponsavel(event.target.value); setFeedback(null); }}
                    placeholder="Nome do responsável pela proposta" />
                  <p className="text-xs text-muted-foreground">Nome que aparecerá no documento oficial.</p>
                </div>
                <BuilderSection
                  meta={SECTION_META.cliente}
                  fields={fieldsBySection.cliente}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={busy}
                  propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
                />

                <BuilderSection
                  meta={SECTION_META.objeto}
                  fields={fieldsBySection.objeto}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={busy}
                />

                {escopoDetalhe && areasField ? (
                  <div className="rounded-xl border border-white/60 bg-slate-50/70 p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark">
                        Escopo e investimento
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Cada área selecionada compõe blocos repetíveis no Word.
                      </p>
                    </div>
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
                ) : null}

                {escopoDetalhe && areasField ? (
                  <div className="rounded-xl border border-white/60 bg-slate-50/70 p-5 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark">
                        Investimento da proposta
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Valor total e forma de pagamento exibidos no Word ([INVESTIMENTO]).
                      </p>
                    </div>
                    <PropostaInvestimentoConsolidadoForm
                      escopoJson={escopoJson}
                      areasDisplay={draftValues.cp_areas_objeto ?? areasField.value ?? ""}
                      investmentCatalog={investmentCatalog}
                      disabled={busy}
                      onEscopoJsonChange={syncEscopoJsonFromDraft}
                    />
                  </div>
                ) : null}

                <BuilderSection
                  meta={SECTION_META.condicoes}
                  fields={fieldsBySection.condicoes}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={busy}
                />

                {fieldsBySection.revisao.length > 0 ? (
                  <BuilderSection
                    meta={{
                      title: "Revisão",
                      description: "Campos adicionais ainda não alocados a uma seção específica.",
                    }}
                    fields={fieldsBySection.revisao}
                    draftValues={draftValues}
                    onChange={fieldChange}
                    disabled={busy}
                  />
                ) : null}

                {/* Pendências */}
                {pending.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <TriangleAlert className="size-4 text-amber-600" aria-hidden />
                      <p className="text-sm font-bold text-amber-800">Pendências</p>
                    </div>
                    <ul className="space-y-1 text-sm text-amber-700">
                      {pending.slice(0, 6).map((item) => (
                        <li key={item}>· {item}</li>
                      ))}
                      {pending.length > 6 ? (
                        <li className="text-xs">+ {pending.length - 6} pendências</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
              </div>
            </aside>

            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                  <h3 className="text-sm font-bold text-primary-dark">Prévia da proposta</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500" role="status">
                    {pdfPreview.updating ? <><Loader2 className="size-3.5 animate-spin" aria-hidden /> Atualizando…</> :
                      pdfPreview.error ? "A atualização não foi concluída." : pdfPreview.url ? "Atualizada com o rascunho atual." : "Preparando a prévia…"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" className="gap-2"
                  disabled={busy || !selectedTemplateId} onClick={() => void downloadDocument("docx", true)}>
                  {previewing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <FileDown className="size-3.5" aria-hidden />}
                  Baixar prévia Word
                </Button>
              </div>
              {pdfPreview.error ? (
                <div className="shrink-0 space-y-2 border-b border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
                  <p className="whitespace-pre-wrap break-words">{pdfPreview.error}</p>
                  {pdfPreview.url ? <p className="text-xs">A última prévia permanece visível abaixo.</p> : null}
                  <Button type="button" variant="outline" size="sm" onClick={() => setPreviewRetry((value) => value + 1)}>
                    Tentar novamente
                  </Button>
                </div>
              ) : null}
              {pdfPreview.url ? (
                <iframe title="Prévia PDF da proposta" className="min-h-0 w-full flex-1 border-0"
                  src={pdfPreview.url + "#toolbar=0&navpanes=0&view=FitH"} data-source-sha256={pdfPreview.sourceSha256 ?? undefined} />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-slate-500">
                  {pdfPreview.updating ? <Loader2 className="size-9 animate-spin" aria-hidden /> : <FileText className="size-9" aria-hidden />}
                  <p className="text-sm">{pdfPreview.updating ? "Preparando o documento para leitura…" : "A prévia será exibida aqui."}</p>
                </div>
              )}
              <p className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
                Prévia do rascunho, ainda sem salvar. Preencha as pendências para gerar a versão final.
              </p>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de descarte do modelo */}
      <AlertDialog open={confirmClose}>
        <AlertDialogContent>
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

// ─── BuilderSection ───────────────────────────────────────────────────────────

function BuilderSection({
  meta,
  fields,
  draftValues,
  onChange,
  disabled,
  propostaEmpresaPrincipalNome,
}: {
  meta: { title: string; description: string };
  fields: LeadDetailData["pipelineFields"];
  draftValues: Record<string, string>;
  onChange: (code: string, value: string) => void;
  disabled?: boolean;
  propostaEmpresaPrincipalNome?: string | null;
}) {
  if (fields.length === 0) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary-dark">{meta.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{meta.description}</p>
      </div>
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
  const label = field.label.replace(" [CP]", "");
  const pe = pipelineFieldToEditorProps(field);
  const wrapperClass = field.fieldType === "textarea" ? "sm:col-span-2" : undefined;

  if (field.fieldCode === "cp_tributacao") {
    const selected = normalizeTributacaoValue(value);
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
        <Label className="text-xs font-medium text-primary-dark">Tributação</Label>
        <Select
          value={selected || undefined}
          onValueChange={(v) => {
            if (v) onChange(normalizeTributacaoValue(v) || v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="h-10 border-slate-200 bg-white text-sm">
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
        <Label className="text-xs font-medium text-primary-dark">{label}</Label>
        <Select
          value={value || undefined}
          onValueChange={(v) => {
            if (v) onChange(v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="h-10 border-slate-200 bg-white text-sm">
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

  // TEXTAREA
  if (pe.kind === "textarea") {
    return (
      <div className={cn("space-y-1.5", wrapperClass)}>
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
        <Label className="text-xs font-medium text-primary-dark">{label}</Label>
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
          {pe.selectOptions.map((opt) => {
            const active = selected.has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                disabled={disabled}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active
                    ? "border-accent-teal bg-accent-teal text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
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
      <Label className="text-xs font-medium text-primary-dark">{label}</Label>
      <Input
        type={inputType}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={`${label}…`}
        className="h-10 border-slate-200 bg-white text-sm"
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
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            Empresa principal da proposta
          </p>
          <p className="mt-1 text-sm font-extrabold text-primary-dark">
            {empresaNome?.trim() || fallback}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-900/70">
            Esta seleção alimenta o cabeçalho do Word.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800">
          {selection.extrasCount > 0 ? `+${selection.extrasCount} extra(s)` : "Sem extras"}
        </span>
      </div>
    </div>
  );
}

// ─── Status card ──────────────────────────────────────────────────────────────

function StatusCard({
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

