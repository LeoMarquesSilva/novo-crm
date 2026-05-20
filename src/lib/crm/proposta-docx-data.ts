import type { LeadIntakeEmpresaRow } from "@/app/(crm)/crm/leads/[id]/lead-intake-types";
import {
  PROPOSTA_INVESTIMENTO_TIPOS_CATALOG,
  type InvestimentoTipoDef,
} from "@/data/proposta-investimento-catalog";
import {
  PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO,
  PROPOSTA_TIPOS_CATALOG,
  type PropostaTiposCatalog,
} from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { findInvestmentSubtype, findScopeSubtype } from "@/lib/crm/proposal-catalog-utils";
import { getEscopoEntryForArea } from "@/lib/crm/proposta-escopo-entry";
import { mergeEscopoTemplate, mergeInvestimentoTemplate } from "@/lib/crm/proposta-escopo-preview";
import { parseEscopoJson, parseAreasList } from "@/lib/crm/proposta-escopo-json";
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

/**
 * Objeto de substituição para docxtemplater com delimitadores `[` e `]`.
 * Chaves = texto dentro dos colchetes no Word (ex.: `DATA VIGENCIA` com espaço).
 */
export function buildPropostaDocxTemplateData(input: PropostaDocxTemplateInput): Record<string, string> {
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
  const escopo = parseEscopoJson(cpEscopoDetalheJson);
  const nomeEmpresa = empresa.razaoSocial ?? "";

  const escopoParts: string[] = [];
  const investimentoParts: string[] = [];
  let resumoDocx = "";

  for (const area of areas) {
    const entry = getEscopoEntryForArea(escopo, area);
    const phEscopo = entry?.placeholders ?? {};
    const areaLabel = normalizePracticeAreaKey(area);
    if (entry?.tipoId && entry.subtipoId) {
      const sub = findScopeSubtype(scopeCatalog, areaLabel, entry.tipoId, entry.subtipoId);
      if (sub) {
        const text = mergeEscopoTemplate(sub.escopoTemplate, phEscopo, { defaultNomeEmpresa: nomeEmpresa }).trim();
        if (text) escopoParts.push(areas.length > 1 ? `${areaLabel}\n${text}` : text);
        const { resumoSintese } = splitEscopoTextForDocx(text);
        const resumoFromPlaceholder = String(phEscopo[PROPOSTA_PLACEHOLDER_RESUMO_PROCESSO] ?? "").trim();
        if (!resumoDocx) resumoDocx = resumoFromPlaceholder || resumoSintese;
      }
    }

    const inv = entry?.investimento;
    if (inv?.tipoId && inv.subtipoId) {
      const invSub = findInvestmentSubtype(investmentCatalog, inv.tipoId, inv.subtipoId);
      if (invSub) {
        const text = mergeInvestimentoTemplate(invSub.template, inv.placeholders ?? {}, {
          defaultNomeEmpresa: nomeEmpresa,
        }).trim();
        if (text) investimentoParts.push(areas.length > 1 ? `${areaLabel}\n${text}` : text);
      }
    }
  }

  const firstArea = areas[0] ?? "";
  const escopoText = escopoParts.join("\n\n");
  const investimentoText = investimentoParts.join("\n\n");
  const firstEntry = firstArea ? getEscopoEntryForArea(escopo, firstArea) : undefined;
  let firstEscopoText = "";
  if (firstArea && firstEntry?.tipoId && firstEntry.subtipoId) {
    const sub = findScopeSubtype(
      scopeCatalog,
      normalizePracticeAreaKey(firstArea),
      firstEntry.tipoId,
      firstEntry.subtipoId,
    );
    if (sub) {
      firstEscopoText = mergeEscopoTemplate(sub.escopoTemplate, firstEntry.placeholders ?? {}, {
        defaultNomeEmpresa: nomeEmpresa,
      }).trim();
    }
  }
  const { antesSintese } = splitEscopoTextForDocx(firstEscopoText || escopoText);

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

  return data;
}

const ELLIPSIS = "…";

export type PropostaDocumentPagePreview = {
  clienteIntro: string;
  area: string;
  escopo: string;
  resumo: string;
  investimento: string;
  dataVigencia: string;
};

/**
 * Pré-visualização em texto corrido (pós-capas / objeto), alinhada ao corpo típico da proposta.
 * Usa as mesmas chaves que `buildPropostaDocxTemplateData` — sem abrir o .docx nem Mammoth.
 */
export function buildPropostaDocumentPagePreview(data: Record<string, string>): PropostaDocumentPagePreview {
  const g = (k: string) => String(data[k] ?? "").trim();

  const empresa = g("EMPRESA") || ELLIPSIS;
  const cidade = g("CIDADE") || ELLIPSIS;
  const uf = g("UF") || ELLIPSIS;
  const cep = g("CEP") || ELLIPSIS;
  const numero = g("NUMERO") || ELLIPSIS;
  const documento = g("DOCUMENTO") || ELLIPSIS;
  const area = g("AREA") || g("AREAS") || ELLIPSIS;
  const escopo = g("ESCOPO_AREA") || g("ESCOPO_AREAS") || "";
  const resumo = g("RESUMO") || g("RESUMO_SINTESE") || ELLIPSIS;
  const investimento = g("INVESTIMENTO") || g("INVESTIMENTOS") || "";
  const vigencia = g("DATA VIGENCIA") || ELLIPSIS;

  return {
    clienteIntro: `À ${empresa}, pessoa jurídica de direito privado, com sede na cidade de ${cidade}/${uf}, na ${cep}, ${numero} inscrita no CNPJ sob nº ${documento} (“Cliente”).`,
    area,
    escopo,
    resumo,
    investimento,
    dataVigencia: vigencia,
  };
}

export function buildPropostaPlainTextPreview(data: Record<string, string>): string {
  const page = buildPropostaDocumentPagePreview(data);

  const linhas: string[] = [
    page.clienteIntro,
    "",
    "1.\tObjeto da Proposta",
    "",
    "Descrição dos serviços:",
    "",
    page.escopo ? `${page.area}\n\n${page.escopo}` : page.area,
    "",
    `Síntese da demanda: ${page.resumo}`,
  ];

  if (page.investimento) {
    linhas.push("", page.investimento);
  }
  linhas.push("", `Data de vigência proposta: ${page.dataVigencia}`, "", "Cordialmente,");

  return linhas.join("\n");
}
