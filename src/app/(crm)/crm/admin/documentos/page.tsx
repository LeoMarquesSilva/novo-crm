import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers3,
  Library,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { loadDocumentTemplates } from "@/lib/crm/proposta-document-data";
import { resolveModeloPropostaTemplatePath } from "@/lib/crm/render-proposta-docx";
import type { PropostaDocumentTemplate, PropostaDocumentTemplateField } from "@/lib/crm/proposta-document-data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CrmPageHeader } from "@/components/crm/crm-page-header";

const sectionLabels: Record<string, string> = {
  cliente: "Cliente",
  objeto: "Objeto",
  escopo: "Escopo",
  condicoes: "Condições",
  revisao: "Revisão",
  geral: "Geral",
};

const fieldTypeLabels: Record<string, string> = {
  date: "Data",
  select: "Lista",
  text: "Texto",
  textarea: "Texto longo",
};

function labelForSection(section: string) {
  return sectionLabels[section] ?? section;
}

function labelForType(fieldType: string) {
  return fieldTypeLabels[fieldType] ?? fieldType;
}

function getStats(templates: PropostaDocumentTemplate[], templateFileAvailable: boolean) {
  const fields = templates.flatMap((template) => template.fields);
  const requiredFields = fields.filter((field) => field.isRequired).length;
  const sections = new Set(fields.map((field) => field.section));

  return [
    {
      label: "Modelo oficial",
      value: templates.length,
      detail: "Proposta ativa no construtor",
      icon: Library,
    },
    {
      label: "Campos mapeados",
      value: fields.length,
      detail: `${requiredFields} obrigatórios`,
      icon: Layers3,
    },
    {
      label: "Arquivo-base",
      value: templateFileAvailable ? "Disponível" : "Ausente",
      detail: `${sections.size} seções no DOCX`,
      icon: templateFileAvailable ? CheckCircle2 : AlertCircle,
    },
  ];
}

function groupFieldsBySection(fields: PropostaDocumentTemplateField[]) {
  return fields.reduce<Array<{ section: string; fields: PropostaDocumentTemplateField[] }>>((groups, field) => {
    const group = groups.find((item) => item.section === field.section);
    if (group) {
      group.fields.push(field);
    } else {
      groups.push({ section: field.section, fields: [field] });
    }
    return groups;
  }, []);
}

async function getTemplates() {
  try {
    const supabase = createSupabaseAdminClient();
    const templates = await loadDocumentTemplates(supabase);
    let templateFileAvailable = false;
    try {
      resolveModeloPropostaTemplatePath();
      templateFileAvailable = true;
    } catch {
      templateFileAvailable = false;
    }
    return { templates, templateFileAvailable, error: null };
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [err.code, err.message, err.details, err.hint].filter(Boolean);
    return {
      templates: [],
      templateFileAvailable: false,
      error: parts.length ? parts.join(" - ") : "Erro ao carregar modelos de documentos.",
    };
  }
}

export default async function DocumentosAdminPage() {
  await requireAdmin("/crm/admin/documentos");

  const { templates, templateFileAvailable, error } = await getTemplates();
  const stats = getStats(templates, templateFileAvailable);

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Modelo da proposta"
        description="Consulte o template oficial, os campos obrigatórios e a estrutura usada pelo construtor de propostas."
        icon={FileText}
        stats={stats}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os modelos</AlertTitle>
          <AlertDescription>
            {error}
            <span className="mt-2 block text-xs">
              Se a mensagem mencionar <code>document_templates</code>, confira a migration{" "}
              <code>20260424170000_document_builder_templates_versions.sql</code> no Supabase.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            templateFileAvailable={templateFileAvailable}
          />
        ))}

        {!error && templates.length === 0 ? (
          <div className="rounded-(--radius-v2-xl) border border-dashed border-neutral-300 bg-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-(--radius-v2-lg) bg-neutral-100 text-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-foreground">Nenhum modelo ativo encontrado</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Aplique a migration do construtor para criar o modelo padrão e liberar o fluxo de propostas.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  templateFileAvailable,
}: {
  template: PropostaDocumentTemplate;
  templateFileAvailable: boolean;
}) {
  const groupedFields = groupFieldsBySection(template.fields);
  const requiredCount = template.fields.filter((field) => field.isRequired).length;
  const description = typeof template.metadata.description === "string" ? template.metadata.description : null;

  return (
    <section className="overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
      <div className="grid gap-0 lg:grid-cols-[18rem_1fr]">
        <aside className="border-b border-neutral-200 bg-neutral-50 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3 lg:block">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="h-6 bg-brand-navy text-white">{template.documentType}</Badge>
                <Badge
                  variant="outline"
                  className="h-6 border-interactive-300 bg-interactive-50 text-interactive-700"
                >
                  v{template.version}
                </Badge>
              </div>
              <h2 className="mt-4 text-xl font-bold leading-tight text-foreground">{template.name}</h2>
              {description ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p> : null}
            </div>
            <Badge
              variant="outline"
              className={
                template.isActive
                  ? "h-6 border-success-border bg-success-bg text-success-text"
                  : "h-6 border-neutral-300 bg-neutral-50 text-muted-foreground"
              }
            >
              {template.isActive ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Arquivo base</p>
              <p className="mt-1 break-all rounded-(--radius-v2-md) border border-neutral-200 bg-white px-3 py-2 font-mono text-xs text-foreground">
                {template.templatePath}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-(--radius-v2-md) border border-neutral-200 bg-white p-3">
                <p className="text-2xl font-bold text-foreground">{template.fields.length}</p>
                <p className="text-xs text-muted-foreground">campos</p>
              </div>
              <div className="rounded-(--radius-v2-md) border border-neutral-200 bg-white p-3">
                <p className="text-2xl font-bold text-foreground">{requiredCount}</p>
                <p className="text-xs text-muted-foreground">obrigatórios</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-interactive-700">Mapa de campos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordem e origem dos dados usados para preencher o documento.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {templateFileAvailable ? (
                <CheckCircle2 className="h-4 w-4 text-success-text" />
              ) : (
                <AlertCircle className="h-4 w-4 text-danger-text" />
              )}
              {templateFileAvailable
                ? "Arquivo oficial disponível"
                : "Arquivo oficial ausente no servidor"}
            </div>
          </div>

          <div className="space-y-4">
            {groupedFields.map((group) => (
              <div key={group.section}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-foreground">{labelForSection(group.section)}</h3>
                  <span className="text-xs text-muted-foreground">{group.fields.length} campos</span>
                </div>
                <div className="overflow-hidden rounded-(--radius-v2-xl) border border-neutral-200 bg-white">
                  <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_6rem] gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid">
                    <span>Campo</span>
                    <span>Tipo</span>
                    <span>Origem</span>
                    <span>Regra</span>
                  </div>
                  {group.fields.map((field) => (
                    <FieldRow key={field.id} field={field} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FieldRow({ field }: { field: PropostaDocumentTemplateField }) {
  return (
    <div className="grid gap-3 border-b border-neutral-100 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_7rem_6rem] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{field.label}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{field.fieldCode}</p>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:hidden">Tipo</span>
        <Badge variant="outline" className="h-6 border-neutral-200 bg-white text-foreground">
          {labelForType(field.fieldType)}
        </Badge>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:hidden">
          Origem
        </span>
        <span className="font-mono text-xs text-muted-foreground">{field.source}</span>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:hidden">Regra</span>
        {field.isRequired ? (
          <Badge className="h-6 bg-warning-bg text-warning-text">Obrigatório</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Opcional</span>
        )}
      </div>
    </div>
  );
}
