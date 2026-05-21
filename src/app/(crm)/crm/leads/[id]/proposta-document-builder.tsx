"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
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
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CrmSelectContent, CrmSelectItem } from "@/components/crm/crm-select";
import { cn } from "@/lib/utils";
import { LeadDetailFieldEditor, pipelineFieldToEditorProps } from "./lead-detail-field-editor";
import {
  buildPropostaDocxTemplateData,
  buildPropostaDocumentPagePreview,
} from "@/lib/crm/proposta-docx-data";
import { PropostaEscopoAreaCoordenacao } from "./proposta-escopo-area-coordenacao";
import { PropostaEscopoPorArea } from "./proposta-escopo-por-area";
import type { LeadDetailData, LeadDetailViewer } from "./page";

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  templatePath: string;
  version: number;
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
    pending: string[];
    areas: Array<{ key: string; label: string; complete: boolean }>;
    /** Valores por `field_code` vindos do DB (alimenta o draft inicial). */
    fieldByCode: Record<string, string>;
    /** Valores resolvidos (EMPRESA, CIDADE, ESCOPO_AREA…) — base do preview server-side. */
    templateData: Record<string, string>;
  };
};

type PreviewPage = {
  clienteIntro: string;
  area: string;
  escopo: string;
  resumo: string;
  investimento: string;
  dataVigencia: string;
};

type PreviewState = {
  page: PreviewPage;
  templateName: string;
  generatedAt: string;
  previewFormat: "document_page";
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
  const [draftValues, setDraftValues] = useState<Record<string, string>>(
    () => ({ ...(docState.snapshot.fieldByCode ?? {}) }),
  );
  const [savedValues, setSavedValues] = useState<Record<string, string>>(
    () => ({ ...(docState.snapshot.fieldByCode ?? {}) }),
  );

  // Espelho do JSON do escopo — `PropostaEscopoPorArea` persiste por dentro e
  // chama `onSaved(novoJson)` para sincronizar o preview daqui.
  const [escopoJson, setEscopoJson] = useState<string>(
    escopoDetalhe?.value ?? draftValues.cp_escopo_detalhe_json ?? "",
  );

  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [confirmClose, setConfirmClose] = useState(false);

  const pending = docState.snapshot.pending;

  const isDirty = useMemo(() => {
    if (selectedTemplateId !== savedTemplateId) return true;
    // Compara só chaves que existem em qualquer um dos dois mapas
    const keys = new Set([...Object.keys(draftValues), ...Object.keys(savedValues)]);
    for (const k of keys) {
      if ((draftValues[k] ?? "") !== (savedValues[k] ?? "")) return true;
    }
    return false;
  }, [draftValues, savedValues, selectedTemplateId, savedTemplateId]);

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

  // ── Live preview client-side ──────────────────────────────────────────────
  // Recomputa `templateData` a cada mudança de `draftValues` / `escopoJson`,
  // sem ir ao servidor. Catálogos: usa o fallback estático (PROPOSTA_*_CATALOG).
  const livePreview = useMemo<PreviewState | null>(() => {
    if (!selectedTemplateId) return null;
    try {
      const merged: Record<string, string> = {
        ...draftValues,
        cp_escopo_detalhe_json: escopoJson,
      };
      const templateData = buildPropostaDocxTemplateData({
        empresasIntake: lead.empresasIntake ?? [],
        cpPropostaEmpresasJson: merged.cp_proposta_empresas_json,
        fieldByCode: merged,
        cpEscopoDetalheJson: escopoJson,
        generatedAt: new Date(),
      });
      const page = buildPropostaDocumentPagePreview(templateData);
      return {
        page,
        templateName: selectedTemplateName,
        generatedAt: new Date().toISOString(),
        previewFormat: "document_page" as const,
      };
    } catch (e) {
      // Se algo falhar, deixa o painel direito mostrar o erro
      console.error("[live preview]", e);
      return null;
    }
  }, [draftValues, escopoJson, selectedTemplateId, selectedTemplateName, lead.empresasIntake]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function fieldChange(code: string, value: string) {
    setDraftValues((prev) => ({ ...prev, [code]: value }));
    setFeedback(null);
  }

  async function persistAllFields() {
    if (!selectedTemplateId) return;
    setSaving(true);
    setSaveError(null);
    setFeedback(null);
    try {
      // 1) PATCH por campo que mudou
      const changedEntries = Object.entries(draftValues).filter(
        ([code, value]) => (savedValues[code] ?? "") !== (value ?? ""),
      );
      // Resolve fieldDefinitionId via `proposalPipelineFields`
      const defIdByCode = new Map(
        proposalPipelineFields.map((f) => [f.fieldCode, f.definitionId] as const),
      );
      await Promise.all(
        changedEntries.map(([code, value]) => {
          const defId = defIdByCode.get(code);
          if (!defId) return Promise.resolve(); // ignora códigos órfãos
          return fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pipelineField: { fieldDefinitionId: defId, value },
            }),
          });
        }),
      );

      // 2) PATCH template + status do documento
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(lead.id)}/document`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId, status: "draft" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Falha ao salvar documento.");

      setSavedTemplateId(selectedTemplateId);
      setSavedValues({ ...draftValues });
      setFeedback("Rascunho salvo com sucesso.");
      await onRefresh();
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function generateDocx() {
    if (!selectedTemplateId) return;
    setGenerating(true);
    setSaveError(null);
    setFeedback(null);
    try {
      // Garante que tudo está salvo antes de gerar (campos + template)
      if (isDirty) {
        await persistAllFields();
      }

      const res = await fetch(
        `/api/crm/leads/${encodeURIComponent(lead.id)}/document/generate-docx`,
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
      const filename = m?.[1] ?? "Proposta.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback("Proposta gerada e baixada.");
      await onRefresh();
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao gerar proposta.");
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
                disabled={templates.length === 0}
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
                disabled={saving || generating || !isDirty}
                onClick={() => void persistAllFields()}
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
                disabled={generating || saving || pending.length > 0}
                onClick={() => void generateDocx()}
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
            <aside className="crm-scrollbar w-[46%] shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 sm:px-6">
              <div className="space-y-6">
                <BuilderSection
                  meta={SECTION_META.cliente}
                  fields={fieldsBySection.cliente}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={saving || generating}
                  propostaEmpresaPrincipalNome={propostaEmpresaPrincipalNome}
                />

                <BuilderSection
                  meta={SECTION_META.objeto}
                  fields={fieldsBySection.objeto}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={saving || generating}
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
                      initialValue={escopoDetalhe.value}
                      areasDisplay={draftValues.cp_areas_objeto ?? areasField.value}
                      defaultNomeEmpresa={propostaEmpresaPrincipalNome}
                      viewerProfileArea={viewer?.area ?? null}
                      viewerRole={viewer?.role ?? null}
                      solicitacoes={lead.escopoSolicitacoes ?? []}
                      className="border-0 bg-transparent p-0"
                      onSaved={(json) => setEscopoJson(json)}
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

                <BuilderSection
                  meta={SECTION_META.condicoes}
                  fields={fieldsBySection.condicoes}
                  draftValues={draftValues}
                  onChange={fieldChange}
                  disabled={saving || generating}
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
                    disabled={saving || generating}
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

            {/* Painel direito — Preview ao vivo */}
            <main className="relative flex w-[54%] flex-1 flex-col overflow-hidden bg-slate-50">
              {/* Cabeçalho do preview */}
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#f8f5ed] px-4 py-2.5">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#24615b]">
                  <Eye className="size-3.5 shrink-0" aria-hidden />
                  Preview da proposta
                  {livePreview ? (
                    <span className="ml-1 size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                  ) : null}
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Atualiza ao digitar
                </span>
              </div>

              {/* Preview content */}
              <div className="crm-scrollbar min-h-0 flex-1 overflow-y-auto">
                <div className="bg-[radial-gradient(circle_at_top,#f7f0df_0%,#ece8dc_36%,#e6e1d4_100%)] p-3 sm:p-4">
                  {livePreview ? (
                    <ProposalPagePreviewDocument preview={livePreview} />
                  ) : (
                    <PreviewEmpty
                      title="Preview indisponível"
                      description="Selecione um modelo para gerar o preview."
                    />
                  )}
                </div>
              </div>
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de descarte do modelo */}
      <AlertDialog open={confirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modelo não salvo</AlertDialogTitle>
            <AlertDialogDescription>
              A seleção de modelo ainda não foi salva. Deseja descartar e fechar?
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

// ─── Preview document ─────────────────────────────────────────────────────────

function ProposalPagePreviewDocument({ preview }: { preview: PreviewState }) {
  const { page } = preview;
  return (
    <div className="mx-auto flex min-h-[980px] w-full max-w-[720px] flex-col overflow-hidden bg-white text-[#111827] shadow-[0_24px_70px_rgba(16,31,46,0.22)] ring-1 ring-black/5">
      <div className="relative h-[110px] shrink-0 bg-white">
        <div className="absolute left-0 top-0 h-28 w-44 overflow-hidden">
          <div className="absolute -left-16 -top-16 h-40 w-48 rounded-[50%] border-[12px] border-[#d3ad67]/80" />
          <div className="absolute -left-10 -top-9 h-32 w-40 rounded-[50%] border-[8px] border-[#d3ad67]/55" />
        </div>
        <div className="absolute right-0 top-0 rounded-bl-[18px] bg-[#0d2031] px-8 py-2 text-[11px] font-extrabold tracking-[0.02em] text-white">
          Proposta de Prestação de Serviços Advocatícios
        </div>
        <div className="flex h-full items-center justify-center pt-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#d3ad67] text-2xl font-black text-[#d3ad67]">
              BP
            </div>
            <div>
              <p className="text-2xl font-black uppercase tracking-[0.18em] text-[#0d2031]">
                Bismarchi<span className="mx-1 text-[#d3ad67]">|</span>Pires
              </p>
              <p className="text-center text-[9px] font-bold uppercase tracking-[0.52em] text-[#0d2031]/70">
                Sociedade de Advogados
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col px-[13.5%] pb-12 pt-4">
        <div className="mb-12 flex items-end">
          <div className="relative z-[1] rounded-r-[9px] bg-[#d3ad67] px-8 py-2.5 pr-12 text-2xl font-black text-white shadow-[3px_4px_0_rgba(13,32,49,0.28)]">
            1.&nbsp; Objeto da Proposta
          </div>
          <div className="-ml-4 mb-1 h-px flex-1 bg-[#0d2031]" />
        </div>

        <div className="space-y-6 text-[13.5px] leading-[1.75]">
          <p className="rounded-[4px] border border-[#0d2031]/35 bg-[#faf9f5] p-4 text-[13px] leading-relaxed">
            {page.clienteIntro}
          </p>

          <section className="space-y-5">
            <p className="font-extrabold">Descrição dos serviços:</p>

            <div className="space-y-3">
              <p className="font-bold uppercase tracking-[0.02em] text-[#0d2031]">{page.area}</p>
              {page.escopo ? (
                <p className="whitespace-pre-wrap text-justify">{page.escopo}</p>
              ) : (
                <p className="text-slate-400">Escopo ainda não preenchido.</p>
              )}
            </div>

            <p>
              <span className="font-extrabold">Síntese da demanda:</span>{" "}
              {page.resumo || <span className="text-slate-400">Resumo ainda não preenchido.</span>}
            </p>

            {page.investimento ? (
              <p className="whitespace-pre-wrap text-justify">{page.investimento}</p>
            ) : (
              <p className="text-slate-400">Investimento ainda não preenchido.</p>
            )}

            <p>
              <span className="font-extrabold">Data de vigência proposta:</span> {page.dataVigencia}
            </p>
          </section>

          <p className="pt-10">Cordialmente,</p>

          <div className="grid max-w-[440px] gap-10 pt-6">
            <SignatureBlock name="Gustavo Bismarchi Motta" oab="OAB/SP 275.477" />
            <SignatureBlock name="Ricardo Viscardi Pires" oab="OAB/SP 353.389" />
          </div>
        </div>
      </div>

      <div className="mt-auto border-t-4 border-[#d3ad67] bg-[#0d2031] px-8 py-3 text-white">
        <div className="mx-auto flex max-w-[640px] flex-wrap items-center justify-center gap-x-8 gap-y-1 text-[10px] font-semibold">
          <span>Rua Coronel Quirino, 1266 - Cambuí - Campinas-SP</span>
          <span>(19) 3254-6446</span>
          <span>contato@bismarchipires.com.br</span>
          <span>bismarchipires.com.br</span>
        </div>
      </div>
    </div>
  );
}

function SignatureBlock({ name, oab }: { name: string; oab: string }) {
  return (
    <div>
      <div className="mb-2 h-px w-[280px] bg-[#111827]" />
      <p className="text-[12px] font-black uppercase">Bismarchi | Pires - Sociedade de Advogados</p>
      <p>{name}</p>
      <p>{oab}</p>
    </div>
  );
}

// ─── Preview empty state ──────────────────────────────────────────────────────

function PreviewEmpty({
  title,
  description,
  tone = "neutral",
  action,
}: {
  title: string;
  description: string;
  tone?: "neutral" | "error";
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white/70 p-6 text-center">
      <div
        className={cn(
          "mb-3 flex size-10 items-center justify-center rounded-xl",
          tone === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600",
        )}
      >
        {tone === "error" ? <TriangleAlert className="size-5" /> : <Eye className="size-5" />}
      </div>
      <p className="text-sm font-bold text-primary-dark">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-1 flex justify-center">{action}</div> : null}
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

