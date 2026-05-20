import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers3,
  Library,
  Route,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/server";
import { loadDocumentTemplates } from "@/lib/crm/proposta-document-data";
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

function getStats(templates: PropostaDocumentTemplate[]) {
  const fields = templates.flatMap((template) => template.fields);
  const requiredFields = fields.filter((field) => field.isRequired).length;
  const sections = new Set(fields.map((field) => field.section));

  return [
    {
      label: "Modelos ativos",
      value: templates.length,
      detail: "Disponíveis no construtor",
      icon: Library,
    },
    {
      label: "Campos mapeados",
      value: fields.length,
      detail: `${requiredFields} obrigatórios`,
      icon: Layers3,
    },
    {
      label: "Seções do DOCX",
      value: sections.size,
      detail: "Organização do formulário",
      icon: Route,
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
    return { templates, error: null };
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [err.code, err.message, err.details, err.hint].filter(Boolean);
    return {
      templates: [],
      error: parts.length ? parts.join(" - ") : "Erro ao carregar modelos de documentos.",
    };
  }
}

export default async function DocumentosAdminPage() {
  await requireAdmin("/crm/admin/documentos");

  const { templates, error } = await getTemplates();
  const stats = getStats(templates);

  return (
    <div className="space-y-6">
      <CrmPageHeader
        eyebrow="Administração"
        title="Modelos de documentos"
        description="Controle os modelos DOCX, os campos obrigatórios e a estrutura que alimenta o construtor de propostas."
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
              Se a mensagem mencionar <code>document_templates</code>, aplique a migration{" "}
              <code>20260424170000_document_builder_templates_versions.sql</code> no Supabase.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}

        {templates.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-primary-light/25 bg-white/55 p-8 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-dark/8 text-primary-dark">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-primary-dark">Nenhum modelo ativo encontrado</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Aplique a migration do construtor para criar o modelo padrão e liberar o fluxo de propostas.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: PropostaDocumentTemplate }) {
  const groupedFields = groupFieldsBySection(template.fields);
  const requiredCount = template.fields.filter((field) => field.isRequired).length;
  const description = typeof template.metadata.description === "string" ? template.metadata.description : null;

  return (
    <section className="overflow-hidden rounded-[24px] border border-white/55 bg-white/72 shadow-sm shadow-primary-dark/10">
      <div className="grid gap-0 lg:grid-cols-[18rem_1fr]">
        <aside className="border-b border-primary-dark/10 bg-white/58 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3 lg:block">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="h-6 rounded-full bg-primary-dark text-white">{template.documentType}</Badge>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-accent-teal/35 bg-accent-teal/10 text-primary-dark"
                >
                  v{template.version}
                </Badge>
              </div>
              <h2 className="mt-4 text-xl font-bold leading-tight text-primary-dark">{template.name}</h2>
              {description ? <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p> : null}
            </div>
            <Badge
              variant="outline"
              className={
                template.isActive
                  ? "h-6 rounded-full border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "h-6 rounded-full border-slate-300 bg-slate-50 text-slate-600"
              }
            >
              {template.isActive ? "Ativo" : "Inativo"}
            </Badge>
          </div>

          <div className="mt-5 space-y-3 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Arquivo base</p>
              <p className="mt-1 break-all rounded-xl border border-primary-dark/10 bg-white/70 px-3 py-2 font-mono text-xs text-primary-dark">
                {template.templatePath}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-primary-dark/10 bg-white/55 p-3">
                <p className="text-2xl font-bold text-primary-dark">{template.fields.length}</p>
                <p className="text-xs text-muted-foreground">campos</p>
              </div>
              <div className="rounded-xl border border-primary-dark/10 bg-white/55 p-3">
                <p className="text-2xl font-bold text-primary-dark">{requiredCount}</p>
                <p className="text-xs text-muted-foreground">obrigatórios</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="p-5">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-teal">Mapa de campos</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ordem e origem dos dados usados para preencher o documento.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Pronto para gerar propostas
            </div>
          </div>

          <div className="space-y-4">
            {groupedFields.map((group) => (
              <div key={group.section}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-primary-dark">{labelForSection(group.section)}</h3>
                  <span className="text-xs text-muted-foreground">{group.fields.length} campos</span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-primary-dark/10 bg-white/66">
                  <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_6rem] gap-3 border-b border-primary-dark/10 bg-primary-dark/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid">
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
    <div className="grid gap-3 border-b border-primary-dark/7 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_8rem_7rem_6rem] md:items-center">
      <div className="min-w-0">
        <p className="truncate font-semibold text-primary-dark">{field.label}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{field.fieldCode}</p>
      </div>
      <div className="flex items-center justify-between gap-3 md:block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:hidden">Tipo</span>
        <Badge variant="outline" className="h-6 rounded-full border-primary-dark/10 bg-white text-primary-dark">
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
          <Badge className="h-6 rounded-full bg-amber-100 text-amber-900">Obrigatório</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Opcional</span>
        )}
      </div>
    </div>
  );
}
