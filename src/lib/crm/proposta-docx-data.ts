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

export type PropostaDocxTemplateInput = {
  empresasIntake: LeadIntakeEmpresaRow[];
  cpPropostaEmpresasJson: string | undefined;
  /** Valores por `field_code` (texto como na ficha). */
  fieldByCode: Record<string, string>;
  cpEscopoDetalheJson: string;
  /** Momento do pedido de geração (para [DATA VIGENCIA] = +7 dias). */
  generatedAt: Date;
  /** Nome configurável em document_instances.data_json.responsavel. */
  responsavel?: string;
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
  const localDate = proposalLocalCalendarDate(generatedAt);
  localDate.setUTCDate(localDate.getUTCDate() + 7);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(localDate);
}

export const PROPOSTA_TIME_ZONE = "America/Sao_Paulo";

function proposalLocalCalendarDate(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPOSTA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find(p => p.type === key)!.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

export function formatDataProposta(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: PROPOSTA_TIME_ZONE, day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

export function formatPropostaFileStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PROPOSTA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}-${get("hour")}${get("minute")}`;
}

/**
 * Temporário: a síntese não entra no preview nem no Word.
 * Religar: `true` (rótulo no modelo + `[RESUMO]`).
 */
export const PROPOSTA_INCLUDE_SINTESE_DEMANDA = false;

/** Alinhado ao texto modelo em `proposta-tipos-catalog` (ex.: escopo «1 processo»). */
const ESCOPO_SINTESE_MARKER = "Síntese da demanda:";

/** Título da secção no Word/preview, no mesmo papel do nome da área. */
export const PROPOSTA_INVESTIMENTO_HEADING = "Investimento";

export function withInvestimentoSectionHeading(text: string): string {
  const body = text.trim();
  if (!body) return "";
  const heading = PROPOSTA_INVESTIMENTO_HEADING;
  if (body.toLocaleLowerCase("pt-BR").startsWith(heading.toLocaleLowerCase("pt-BR"))) {
    return body;
  }
  return `${heading}\n\n${body}`;
}

export function stripInvestimentoSectionHeading(text: string): string {
  const heading = PROPOSTA_INVESTIMENTO_HEADING;
  const match = text.match(new RegExp(`^${heading}\\s*\\n+`, "i"));
  return (match ? text.slice(match[0].length) : text).trim();
}

/**
 * Junta quebras soltas no meio da frase e preserva parágrafos (`\\n\\n`).
 * Evita linhas “esticadas” no Word justificado.
 */
export function normalizePropostaBodyText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/([.!?…;])\s*\n(?!\n)/g, "$1\n\n")
    .replace(/([^\n])\n(?!\n)(\S)/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function formatEscopoItemLine(label: string, texto: string): string {
  const body = normalizePropostaBodyText(texto);
  const heading = label.trim();
  if (!heading || !body) return body;
  return `${heading}: ${body}`;
}

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

function buildEscopoSectionLabel(areaLabel: string, scopeTypeLabel: string | null): string {
  if (scopeTypeLabel) return `${areaLabel}\n${scopeTypeLabel}`;
  return areaLabel;
}

/** Área uma vez; cada subtipo na mesma linha do texto. A primeira área vai para `[AREA]`. */
function composeEscopoDocumentText(sections: EscopoPreviewSection[], firstArea: string): string {
  const omit = normalizePracticeAreaKey(firstArea);
  const parts: string[] = [];
  let lastArea = "";
  const itemLines: string[] = [];

  const flush = () => {
    if (itemLines.length === 0) return;
    const body = itemLines.join("\n\n");
    const hideHeading = Boolean(lastArea) && lastArea === omit;
    parts.push(hideHeading || !lastArea ? body : `${lastArea}\n\n${body}`);
    itemLines.length = 0;
  };

  for (const section of sections) {
    if (section.areaLabel !== lastArea) {
      flush();
      lastArea = section.areaLabel;
    }
    const line = section.scopeTypeLabel
      ? formatEscopoItemLine(section.scopeTypeLabel, section.text)
      : normalizePropostaBodyText(section.text);
    if (line) itemLines.push(line);
  }
  flush();
  return parts.join("\n\n");
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
          const merged = mergeEscopoTemplate(sub.escopoTemplate, phEscopo, {
            defaultNomeEmpresa: params.nomeEmpresa,
          }).trim();
          const { antesSintese, resumoSintese } = splitEscopoTextForDocx(merged);
          const text = normalizePropostaBodyText(antesSintese);
          if (text) {
            sections.push({
              areaLabel,
              scopeTypeLabel,
              label: buildEscopoSectionLabel(areaLabel, scopeTypeLabel),
              text,
            });
          }
          const resumoFromPlaceholder = String(phEscopo[PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO] ?? "").trim();
          if (!resumoDocx) resumoDocx = resumoFromPlaceholder || resumoSintese;
        }
      }
    }
  }

  const firstArea = params.areas[0] ?? "";
  const text = composeEscopoDocumentText(sections, firstArea);
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
    tributacao: f("cp_tributacao"),
  });

  const firstArea = areas[0] ?? "";
  const escopoText = builtEscopo.text;
  const resumoDocx = builtEscopo.resumoDocx;
  const { antesSintese } = splitEscopoTextForDocx(builtEscopo.firstEscopoText || escopoText);

  const data: Record<string, string> = {
    EMPRESA: empresa.razaoSocial ?? "",
    RESPONSAVEL: input.responsavel?.trim() ?? "",
    DATA_PROPOSTA: formatDataProposta(generatedAt),
    DATA_VIGENCIA: formatDataVigenciaProposta(generatedAt),
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
    RESUMO: PROPOSTA_INCLUDE_SINTESE_DEMANDA ? resumoDocx : "",
    /** Alias legado (mesmo valor que `RESUMO`). */
    RESUMO_SINTESE: PROPOSTA_INCLUDE_SINTESE_DEMANDA ? resumoDocx : "",
    INVESTIMENTO: withInvestimentoSectionHeading(investimentoText),
    INVESTIMENTOS: withInvestimentoSectionHeading(investimentoText),
    ESCOPO_SUBTIPO_LABELS: builtEscopo.sections
      .map((s) => s.scopeTypeLabel?.trim())
      .filter((label): label is string => Boolean(label))
      .join("\n"),
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

/** Única construção dos dados usados no DOCX de draft e na exportação. */
export type CanonicalProposalData = PropostaDocxPayload & { generatedAt: string };

export function buildCanonicalProposalData(input: PropostaDocxTemplateInput): CanonicalProposalData {
  return { ...buildPropostaDocxPayload(input), generatedAt: input.generatedAt.toISOString() };
}

/** Template Word + preview estruturado (seções por área ou por escopo). */
/** @deprecated Legacy DTO for regression tests; never use as the official document preview. */
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
/** @deprecated The official document is rendered from CanonicalProposalData as DOCX. */
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
  const resumo = PROPOSTA_INCLUDE_SINTESE_DEMANDA
    ? g("RESUMO") || g("RESUMO_SINTESE") || ELLIPSIS
    : "";
  const investimento = stripInvestimentoSectionHeading(
    g("INVESTIMENTO") || g("INVESTIMENTOS") || "",
  );
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
      ? (() => {
          const lines: string[] = [];
          let lastArea = "";
          for (const s of page.escopoSections) {
            if (s.areaLabel !== lastArea) {
              if (lines.length) lines.push("");
              lines.push(s.areaLabel, "");
              lastArea = s.areaLabel;
            }
            lines.push(
              s.scopeTypeLabel ? formatEscopoItemLine(s.scopeTypeLabel, s.text) : s.text,
              "",
            );
          }
          return lines.join("\n").trim();
        })()
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
  ];
  if (PROPOSTA_INCLUDE_SINTESE_DEMANDA) {
    linhas.push("", `Síntese da demanda: ${page.resumo}`);
  }

  if (page.investimento) {
    linhas.push("", PROPOSTA_INVESTIMENTO_HEADING, "", page.investimento);
  }
  linhas.push("", `Data de vigência proposta: ${page.dataVigencia}`, "", "Cordialmente,");

  return linhas.join("\n");
}
