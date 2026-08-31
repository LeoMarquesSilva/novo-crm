import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import type { PropostaEscopoDetalhe } from "@/data/proposta-tipos-catalog";
import {
  PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO,
  PROPOSTA_TIPOS_CATALOG,
  type PropostaTiposCatalog,
} from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { findScopeSubtype, findScopeTipo, formatScopeTypeLabel } from "@/lib/crm/proposal-catalog-utils";
import {
  parseAreasList,
  parseEscopoJsonWithMeta,
} from "@/lib/crm/proposta-escopo-json";
import {
  buildInvestimentoDocumentoText,
  resolveInvestimentoDocumento,
} from "@/lib/crm/proposta-investimento-consolidado";
import { getEscopoEntriesForArea, getEscopoEntryForArea } from "@/lib/crm/proposta-escopo-entry";
import { mergeEscopoTemplate } from "@/lib/crm/proposta-escopo-preview";
import { resolvePropostaEmpresaPrincipal } from "@/lib/crm/proposta-empresa-principal";
import { addDays } from "date-fns";
import { format } from "date-fns";

export type PropostaDocxTemplateInput = {
  empresasIntake: LeadIntakeEmpresaRow[];
  cpPropostaEmpresasJson: string | undefined;
  /** Valores por `field_code` (texto como na ficha). */
  fieldByCode: Record<string, string>;
  cpEscopoDetalheJson: string;
  /** Momento do pedido de geração (para [DATA VIGENCIA] = +7 dias). */
  generatedAt: Date;
  scopeCatalog?: PropostaTiposCatalog;
  investmentCatalog?: InvestimentoTipoDef[];
};

function formatCepBr(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Data de vigência: 7 dias após `generatedAt`, em dd/MM/aaaa. */
export function formatDataVigenciaProposta(generatedAt: Date): string {
  return format(addDays(generatedAt, 7), "dd/MM/yyyy");
}

/** Alinhado ao texto modelo em `proposta-tipos-catalog` (ex.: escopo «1 processo»). */
const ESCOPO_SINTESE_MARKER = "Síntese da demanda:";

/**
 * Separa o bloco após `Síntese da demanda:`: o trecho seguinte vai para `[RESUMO]` no Word
 * (rótulo fixo no modelo); o anterior para `[ESCOPO_ANTES_SINTESE]`.
 * Mantém `ESCOPO_AREA` completo para modelos que só usam um placeholder.
 */
export function splitEscopoTextForDocx(escopoText: string): { antesSintese: string; resumoSintese: string } {
  const t = escopoText.trim();
  const idx = t.indexOf(ESCOPO_SINTESE_MARKER);
  if (idx === -1) {
    return { antesSintese: escopoText, resumoSintese: "" };
  }
  const antesSintese = t.slice(0, idx).trimEnd();
  const resumoSintese = t.slice(idx + ESCOPO_SINTESE_MARKER.length).trim();
  return { antesSintese, resumoSintese };
}

export type EscopoPreviewSection = {
  areaLabel: string;
  scopeTypeLabel: string | null;
  /** Cabeçalho serializado para Word / parsers legados */
  label: string;
  text: string;
};

type BuiltEscopoContent = {
  sections: EscopoPreviewSection[];
  text: string;
  resumoDocx: string;
  firstEscopoText: string;
};

function formatEscopoSectionHeader(section: EscopoPreviewSection): string {
  if (section.scopeTypeLabel) {
    return `${section.areaLabel}\n${section.scopeTypeLabel}`;
  }
  return section.areaLabel;
}

function buildEscopoSectionLabel(areaLabel: string, scopeTypeLabel: string | null): string {
  if (scopeTypeLabel) return `${areaLabel}\n${scopeTypeLabel}`;
  return areaLabel;
}

function buildEscopoContent(params: {
  areas: string[];
  escopo: PropostaEscopoDetalhe;
  scopeCatalog: PropostaTiposCatalog;
  nomeEmpresa: string;
}): BuiltEscopoContent {
  const sections: EscopoPreviewSection[] = [];
  let resumoDocx = "";

  for (const area of params.areas) {
    const entries = getEscopoEntriesForArea(params.escopo, area);
    const areaLabel = normalizePracticeAreaKey(area);

    for (const entry of entries) {
      const phEscopo = entry.placeholders ?? {};
      if (entry.tipoId && entry.subtipoId) {
        const tipo = findScopeTipo(params.scopeCatalog, areaLabel, entry.tipoId);
        const sub = findScopeSubtype(params.scopeCatalog, areaLabel, entry.tipoId, entry.subtipoId);
        if (sub) {
          const scopeTypeLabel = formatScopeTypeLabel(tipo, sub);
          const text = mergeEscopoTemplate(sub.escopoTemplate, phEscopo, {
            defaultNomeEmpresa: params.nomeEmpresa,
          }).trim();
          if (text) {
            sections.push({
              areaLabel,
              scopeTypeLabel,
              label: buildEscopoSectionLabel(areaLabel, scopeTypeLabel),
              text,
            });
          }
          const { resumoSintese } = splitEscopoTextForDocx(text);
          const resumoFromPlaceholder = String(phEscopo[PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO] ?? "").trim();
          if (!resumoDocx) resumoDocx = resumoFromPlaceholder || resumoSintese;
        }
      }
    }
  }

  const includeHeader = sections.length > 1 || sections.some((s) => s.scopeTypeLabel);
  const text = sections
    .map((s) => (includeHeader ? `${formatEscopoSectionHeader(s)}\n${s.text}` : s.text))
    .join("\n\n");

  const firstArea = params.areas[0] ?? "";
  const firstEntry = firstArea ? getEscopoEntryForArea(params.escopo, firstArea) : undefined;
  let firstEscopoText = "";
  if (firstArea && firstEntry?.tipoId && firstEntry.subtipoId) {
    const sub = findScopeSubtype(
      params.scopeCatalog,
      normalizePracticeAreaKey(firstArea),
      firstEntry.tipoId,
      firstEntry.subtipoId,
    );
    if (sub) {
      firstEscopoText = mergeEscopoTemplate(sub.escopoTemplate, firstEntry.placeholders ?? {}, {
        defaultNomeEmpresa: params.nomeEmpresa,
      }).trim();
    }
  }

  return { sections, text, resumoDocx, firstEscopoText };
}

function parseEscopoSectionsFromTemplateData(data: Record<string, string>): EscopoPreviewSection[] {
  const escopo = String(data.ESCOPO_AREA ?? data.ESCOPO_AREAS ?? "").trim();
  if (!escopo) return [];

  const areas = parseAreasList(String(data.AREAS ?? data.AREA ?? ""));

  if (areas.length <= 1) {
    const parsed = parseEscopoPreviewBlock(escopo, areas, 0);
    if (parsed) return [parsed];
    const areaLabel = normalizePracticeAreaKey(areas[0] ?? data.AREA ?? "");
    return [{ areaLabel, scopeTypeLabel: null, label: areaLabel, text: escopo }];
  }

  const sections: EscopoPreviewSection[] = [];
  for (const [index, block] of escopo.split(/\n\n+/).entries()) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const parsed = parseEscopoPreviewBlock(trimmed, areas, index);
    if (parsed) sections.push(parsed);
  }
  return sections;
}

function parseEscopoPreviewBlock(
  trimmed: string,
  areas: string[],
  blockIndex: number,
): EscopoPreviewSection | null {
  if (!trimmed) return null;

  const lines = trimmed.split("\n");
  if (lines.length === 1) {
    const areaLabel = normalizePracticeAreaKey(areas[blockIndex] ?? areas[0] ?? trimmed);
    return { areaLabel, scopeTypeLabel: null, label: areaLabel, text: trimmed };
  }

  const firstLine = lines[0]?.trim() ?? "";
  const matchedArea = areas.find(
    (a) => normalizePracticeAreaKey(a) === normalizePracticeAreaKey(firstLine),
  );
  const areaLabel = matchedArea
    ? normalizePracticeAreaKey(matchedArea)
    : normalizePracticeAreaKey(areas[blockIndex] ?? firstLine);

  if (matchedArea && lines.length >= 3) {
    const scopeTypeLabel = lines[1]?.trim() || null;
    const text = lines.slice(2).join("\n").trim();
    return {
      areaLabel,
      scopeTypeLabel,
      label: buildEscopoSectionLabel(areaLabel, scopeTypeLabel),
      text,
    };
  }

  if (matchedArea && lines.length === 2) {
    return {
      areaLabel,
      scopeTypeLabel: null,
      label: areaLabel,
      text: lines[1]!.trim(),
    };
  }

  const rest = lines.slice(1).join("\n").trim();
  const scopeTypeLabel = rest.includes("\n") ? lines[1]?.trim() || null : null;
  if (scopeTypeLabel && lines.length >= 3) {
    return {
      areaLabel,
      scopeTypeLabel,
      label: buildEscopoSectionLabel(areaLabel, scopeTypeLabel),
      text: lines.slice(2).join("\n").trim(),
    };
  }

  return {
    areaLabel,
    scopeTypeLabel: null,
    label: areaLabel,
    text: rest,
  };
}

/**
 * Objeto de substituição para docxtemplater com delimitadores `[` e `]`.
 * Chaves = texto dentro dos colchetes no Word (ex.: `DATA VIGENCIA` com espaço).
 */
type PropostaDocxPayload = {
  templateData: Record<string, string>;
  escopoSections: EscopoPreviewSection[];
};

function buildPropostaDocxPayload(input: PropostaDocxTemplateInput): PropostaDocxPayload {
  const { empresasIntake, cpPropostaEmpresasJson, fieldByCode, cpEscopoDetalheJson, generatedAt } =
    input;
  const scopeCatalog = input.scopeCatalog ?? PROPOSTA_TIPOS_CATALOG;
  const investmentCatalog = input.investmentCatalog ?? PROPOSTA_INVESTIMENTO_TIPOS_CATALOG;

  const f = (code: string) => String(fieldByCode[code] ?? "").trim();

  const empresa = resolvePropostaEmpresaPrincipal({
    empresasIntake,
    cpPropostaEmpresasJson,
  });

  const areas = parseAreasList(f("cp_areas_objeto"));
  const { escopo, investimentoDocumento: savedInvDoc } = parseEscopoJsonWithMeta(cpEscopoDetalheJson);
  const nomeEmpresa = empresa.razaoSocial ?? "";

  const builtEscopo = buildEscopoContent({
    areas,
    escopo,
    scopeCatalog,
    nomeEmpresa,
  });

  const investimentoDoc = resolveInvestimentoDocumento(
    escopo,
    areas,
    savedInvDoc,
    investmentCatalog,
  );
  const investimentoText = buildInvestimentoDocumentoText(investimentoDoc, investmentCatalog, {
    defaultNomeEmpresa: nomeEmpresa,
  });

  const firstArea = areas[0] ?? "";
  const escopoText = builtEscopo.text;
  const resumoDocx = builtEscopo.resumoDocx;
  const { antesSintese } = splitEscopoTextForDocx(builtEscopo.firstEscopoText || escopoText);

  const data: Record<string, string> = {
    EMPRESA: empresa.razaoSocial ?? "",
    CIDADE: f("cp_cliente_cidade"),
    UF: f("cp_cliente_uf"),
    CEP: formatCepBr(f("cp_cliente_cep")),
    NUMERO: f("cp_cliente_numero"),
    DOCUMENTO: empresa.documentoFormatado ?? "",
    AREA: firstArea,
    AREAS: areas.join(", "),
    ESCOPO_AREA: escopoText,
    ESCOPO_AREAS: escopoText,
    ESCOPO_ANTES_SINTESE: antesSintese,
    /** Conteúdo do campo «Resumo do processo» no CRM → `[RESUMO]` no modelo Word (rótulo só no .docx). */
    RESUMO: resumoDocx,
    /** Alias legado (mesmo valor que `RESUMO`). */
    RESUMO_SINTESE: resumoDocx,
    INVESTIMENTO: investimentoText,
    INVESTIMENTOS: investimentoText,
    "DATA VIGENCIA": formatDataVigenciaProposta(generatedAt),
    /**
     * Rodapé "Página [P] de [F]" (muitas vezes dentro de caixa de texto): substituição por texto.
     * Não há total de páginas real no servidor; para números corretos, no Word use Inserir →
     * Número de páginas em um parágrafo de rodapé normal (fora da caixa) ou atualize manualmente.
     */
    P: "1",
    F: "1",
  };

  return { templateData: data, escopoSections: builtEscopo.sections };
}

export function buildPropostaDocxTemplateData(input: PropostaDocxTemplateInput): Record<string, string> {
  return buildPropostaDocxPayload(input).templateData;
}

/** Template Word + preview estruturado (seções por área ou por escopo). */
export function buildPropostaLivePreview(input: PropostaDocxTemplateInput): {
  templateData: Record<string, string>;
  page: PropostaDocumentPagePreview;
} {
  const { templateData, escopoSections } = buildPropostaDocxPayload(input);
  const page = buildPropostaDocumentPagePreview(templateData, { escopoSections });
  return { templateData, page };
}

const ELLIPSIS = "…";

export type PropostaDocumentPagePreview = {
  clienteIntro: string;
  /** Lista de áreas (legado / cabeçalho simples). */
  area: string;
  escopo: string;
  escopoSections: EscopoPreviewSection[];
  resumo: string;
  investimento: string;
  dataVigencia: string;
};

/**
 * Pré-visualização em texto corrido (pós-capas / objeto), alinhada ao corpo típico da proposta.
 * Usa as mesmas chaves que `buildPropostaDocxTemplateData` — sem abrir o .docx nem Mammoth.
 */
export function buildPropostaDocumentPagePreview(
  data: Record<string, string>,
  opts?: { escopoSections?: EscopoPreviewSection[] },
): PropostaDocumentPagePreview {
  const g = (k: string) => String(data[k] ?? "").trim();

  const empresa = g("EMPRESA") || ELLIPSIS;
  const cidade = g("CIDADE") || ELLIPSIS;
  const uf = g("UF") || ELLIPSIS;
  const cep = g("CEP") || ELLIPSIS;
  const numero = g("NUMERO") || ELLIPSIS;
  const documento = g("DOCUMENTO") || ELLIPSIS;
  const areasList = parseAreasList(g("AREAS") || g("AREA"));
  const escopoSections =
    opts?.escopoSections?.length ? opts.escopoSections : parseEscopoSectionsFromTemplateData(data);
  const escopo = g("ESCOPO_AREA") || g("ESCOPO_AREAS") || "";
  const area =
    escopoSections.length === 1
      ? escopoSections[0]!.areaLabel
      : areasList.length > 0
        ? areasList.map((a) => normalizePracticeAreaKey(a)).join(", ")
        : g("AREA") || g("AREAS") || ELLIPSIS;
  const resumo = g("RESUMO") || g("RESUMO_SINTESE") || ELLIPSIS;
  const investimento = g("INVESTIMENTO") || g("INVESTIMENTOS") || "";
  const vigencia = g("DATA VIGENCIA") || ELLIPSIS;

  return {
    clienteIntro: `À ${empresa}, pessoa jurídica de direito privado, com sede na cidade de ${cidade}/${uf}, na ${cep}, ${numero} inscrita no CNPJ sob nº ${documento} (“Cliente”).`,
    area,
    escopo,
    escopoSections,
    resumo,
    investimento,
    dataVigencia: vigencia,
  };
}

export function buildPropostaPlainTextPreview(data: Record<string, string>): string {
  const page = buildPropostaDocumentPagePreview(data);

  const escopoBlock =
    page.escopoSections.length > 0
      ? page.escopoSections
          .map((s) => {
            const header = s.scopeTypeLabel
              ? `${s.areaLabel}\n\n${s.scopeTypeLabel}`
              : s.areaLabel;
            return `${header}\n\n${s.text}`;
          })
          .join("\n\n")
      : page.escopo
        ? `${page.area}\n\n${page.escopo}`
        : page.area;

  const linhas: string[] = [
    page.clienteIntro,
    "",
    "1.\tObjeto da Proposta",
    "",
    "Descrição dos serviços:",
    "",
    escopoBlock,
    "",
    `Síntese da demanda: ${page.resumo}`,
  ];

  if (page.investimento) {
    linhas.push("", page.investimento);
  }
  linhas.push("", `Data de vigência proposta: ${page.dataVigencia}`, "", "Cordialmente,");

  return linhas.join("\n");
}
