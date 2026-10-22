import {
  REUNIAO_CONFECCAO_MANAGED_CODES,
  validateReuniaoConfeccaoValues,
} from "@/components/crm/confeccao-proposta-transition";
import {
  classifyMeetingField,
  dedupeConfeccaoPropostaDefinitionsByNormalizedLabel,
  filterConfeccaoContratoTransitionDefinitions,
  filterConfeccaoPropostaTransitionDefinitions,
  filterPropostaEnviadaDuplicateLinkFields,
  formatTransitionBlockingError,
  listBlockingCustomFields,
} from "@/lib/crm/compute-transition-requirements";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import type { FieldDefinition } from "@/lib/crm/crm-field-schema";
import { isValidIsoDateString } from "@/lib/crm/date-br";
import { normalizeLabelKey } from "@/lib/crm/field-code";
import type { EmpresaIntakeRow } from "@/lib/crm/proposta-empresas";
import { getInvestimentoDocumentoItems } from "@/lib/crm/proposta-investimento-consolidado";
import { getInvestimentoDocumentoFromRaw } from "@/lib/crm/proposta-escopo-json";
import {
  indicationTypes,
  leadDigitalPlatforms,
  leadTypes,
} from "@/modules/crm/application/services/new-lead-payload";
import { listMissingOnboardingFields } from "@/modules/crm/domain/client-onboarding";
import type { OpportunityStage } from "@/modules/crm/domain/entities";

import { CRM_STAGE_ORDER, isPostSaleMigrationStage, stageBetween, stageIndex } from "./scope";
import type { RdMigrationValues } from "./values";

export type RdMigrationSection =
  | "responsavel"
  | "cadastro"
  | "proposta"
  | "evidencias"
  | "investimento"
  | "pos_venda";

export const RD_MIGRATION_SECTION_LABELS: Record<RdMigrationSection, string> = {
  responsavel: "Responsável",
  cadastro: "Cadastro do lead",
  proposta: "Elaboração da proposta",
  evidencias: "Documentos do RD",
  investimento: "Escopo e investimento",
  pos_venda: "Cadastro do cliente e faturamento",
};

export type RdMigrationItem = {
  key: string;
  section: RdMigrationSection;
  label: string;
  missing: boolean;
  /** Só dá para resolver depois da virada (na ficha do lead já convertido). */
  afterConversion?: boolean;
};

export type RdMigrationNeeds = {
  /** Bloco Reunião → Elaboração da proposta (endereço, áreas, escopo, prazo) + campos [CP]. */
  proposta: boolean;
  linkProposta: "required" | "optional" | null;
  linkContrato: "required" | "optional" | null;
  d4sign: "required" | "optional" | null;
  dataAssinatura: boolean;
  /** Cadastro do cliente: completo (vai para Ops Legais/Financeiro) ou só rascunho pré-preenchido. */
  onboarding: "required" | "draft" | null;
  investimento: boolean;
};

export type RdMigrationRequirements = {
  stage: OpportunityStage;
  needs: RdMigrationNeeds;
  /** Campos configuráveis (`field_definitions`) que o formulário mostra, além do bloco da proposta. */
  fieldDefinitions: FieldDefinition[];
  items: RdMigrationItem[];
  missing: RdMigrationItem[];
  /** Pendências que o responsável resolve antes da virada (as `afterConversion` ficam de fora). */
  missingBeforeConversion: RdMigrationItem[];
  readyForConversion: boolean;
  complete: boolean;
};

/** O que cada etapa do CRM precisa ter para o lead seguir andando a partir dela. */
export function rdMigrationNeedsForStage(stage: OpportunityStage): RdMigrationNeeds {
  const postSale = isPostSaleMigrationStage(stage);
  return {
    proposta: stageBetween(stage, "confeccao_proposta", "contrato_elaborado"),
    linkProposta: stageBetween(stage, "proposta_enviada", "contrato_enviado")
      ? "required"
      : postSale
        ? "optional"
        : null,
    linkContrato: stageBetween(stage, "contrato_elaborado", "contrato_enviado")
      ? "required"
      : postSale
        ? "optional"
        : null,
    d4sign: stage === "contrato_enviado" ? "required" : postSale ? "optional" : null,
    dataAssinatura: postSale,
    onboarding:
      stage === "cadastro_novo_cliente" || stage === "inclusao_faturamento"
        ? "required"
        : stage === "aguardando_cadastro"
          ? "draft"
          : null,
    investimento: stageBetween(stage, "proposta_enviada", "contrato_elaborado"),
  };
}

function isLinkField(def: FieldDefinition): boolean {
  const label = normalizeLabelKey(def.label);
  const code = def.field_code.toLowerCase();
  return (
    (label.includes("link") && (label.includes("proposta") || label.includes("contrato"))) ||
    code.includes("link_proposta") ||
    code.includes("link_contrato")
  );
}

/**
 * Campos configuráveis que o CRM teria pedido nas transições até `stage`, com os mesmos filtros
 * do modal de transição. Ficam de fora os da reunião (estão no cadastro), os links (estão em
 * Documentos do RD) e os do bloco da proposta (têm componente próprio).
 */
export function selectRdMigrationFieldDefinitions(
  stage: OpportunityStage,
  definitions: FieldDefinition[],
): FieldDefinition[] {
  if (!stageBetween(stage, "levantamento_dados", "contrato_elaborado")) return [];
  const stages = CRM_STAGE_ORDER.filter(
    (s) => stageIndex(s) >= stageIndex("levantamento_dados") && stageIndex(s) <= stageIndex(stage),
  );
  const out: FieldDefinition[] = [];
  for (const nextStage of stages) {
    const params = { pipeline: "vendas" as const, nextStage };
    const ofStage = definitions.filter(
      (d) => d.stage_code === nextStage && d.is_active !== false && (d.pipeline_code ?? "vendas") === "vendas",
    );
    const filtered = filterConfeccaoContratoTransitionDefinitions(
      dedupeConfeccaoPropostaDefinitionsByNormalizedLabel(
        filterPropostaEnviadaDuplicateLinkFields(filterConfeccaoPropostaTransitionDefinitions(ofStage, params), params),
        params,
      ),
      params,
    );
    for (const def of filtered) {
      if (REUNIAO_CONFECCAO_MANAGED_CODES.has(def.field_code)) continue;
      if (classifyMeetingField(def.field_code, def.label)) continue;
      if (isLinkField(def)) continue;
      if (out.some((d) => d.field_code === def.field_code)) continue;
      out.push(def);
    }
  }
  return out.sort((a, b) => a.sort_order - b.sort_order);
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

export function empresasIntakeFromCadastro(values: RdMigrationValues): EmpresaIntakeRow[] {
  return values.cadastro.empresas.map((e, i) => ({
    index: i + 1,
    razao_social: e.razao_social,
    tipo_documento: e.tipo_documento,
    documento: e.documento,
  }));
}

/** Investimento da proposta com pelo menos uma forma de honorário escolhida e com valor. */
export function hasInvestimentoValue(escopoJson: string | string[] | undefined): boolean {
  if (typeof escopoJson !== "string" || !escopoJson.trim()) return false;
  const items = getInvestimentoDocumentoItems(getInvestimentoDocumentoFromRaw(escopoJson));
  return items.some(
    (item) =>
      item.tipoId.trim() &&
      item.subtipoId.trim() &&
      Object.values(item.placeholders ?? {}).some((v) => String(v ?? "").trim()),
  );
}

function cadastroItems(stage: OpportunityStage, values: RdMigrationValues): RdMigrationItem[] {
  const c = values.cadastro;
  const items: RdMigrationItem[] = [];
  const add = (key: string, label: string, missing: boolean) =>
    items.push({ key: `cadastro.${key}`, section: "cadastro", label, missing });

  const empresa = c.empresas[0];
  add("empresas.razao_social", "Razão social / nome do cliente", !empresa?.razao_social.trim());
  const doc = digits(empresa?.documento ?? "");
  add(
    "empresas.documento",
    "CPF/CNPJ do cliente",
    !(doc.length === 11 || doc.length === 14) ||
      (empresa?.tipo_documento === "CPF" && doc.length !== 11) ||
      (empresa?.tipo_documento === "CNPJ" && doc.length !== 14),
  );
  // Demais empresas/pessoas (ex.: dois clientes pessoa física no mesmo negócio do RD).
  c.empresas.slice(1).forEach((extra, i) => {
    const filled = extra.razao_social.trim() || extra.documento.trim();
    if (!filled) return;
    const extraDoc = digits(extra.documento);
    const docOk =
      (extra.tipo_documento === "CPF" && extraDoc.length === 11) ||
      (extra.tipo_documento === "CNPJ" && extraDoc.length === 14);
    add(
      `empresas.${i + 1}`,
      `Empresa/pessoa ${i + 2}: ${extra.razao_social.trim() ? `${extra.tipo_documento} de ${extra.razao_social.trim()}` : "nome"}`,
      !extra.razao_social.trim() || !docOk,
    );
  });
  add("tipoLead", "Tipo de lead", !(leadTypes as readonly string[]).includes(c.tipoLead));
  if (c.tipoLead === "Indicacao") {
    add("tipoIndicacao", "Tipo de indicação", !(indicationTypes as readonly string[]).includes(c.tipoIndicacao));
    add("nomeIndicacao", "Nome da indicação", !c.nomeIndicacao.trim());
  }
  if (c.tipoLead === "Lead Digital") {
    add("plataforma", "Plataforma", !(leadDigitalPlatforms as readonly string[]).includes(c.plataforma));
  }
  if (c.tipoLead === "Cross Selling") {
    add("areaCrossSelling", "Área do cross selling", !(CRM_PRACTICE_AREAS as readonly string[]).includes(c.areaCrossSelling));
  }
  add(
    "areasAnalise",
    "Áreas de análise",
    c.areasAnalise.filter((a) => (CRM_PRACTICE_AREAS as readonly string[]).includes(a)).length === 0,
  );
  add("dueDiligence", "Haverá due diligence?", c.dueDiligence !== "Sim" && c.dueDiligence !== "Nao");
  add("localReuniao", "Local da reunião", !c.localReuniao.trim());

  const dueStage = stageBetween(stage, "levantamento_dados", "due_diligence_finalizada");
  if (c.dueDiligence === "Sim" && dueStage) {
    add("dataEntregaDue", "Prazo de entrega da DUE", !isValidIsoDateString(c.dataEntregaDue));
    add("horarioEntregaDue", "Horário de entrega da DUE", !/^\d{2}:\d{2}$/.test(c.horarioEntregaDue));
  }
  // A transição para Reunião exige data e horário; quem já passou dela precisa ter os dois.
  if (stageIndex(stage) >= stageIndex("reuniao") && !isPostSaleMigrationStage(stage)) {
    add("dataReuniao", "Data da reunião", !isValidIsoDateString(c.dataReuniao));
    add("horarioReuniao", "Horário da reunião", !/^\d{2}:\d{2}$/.test(c.horarioReuniao));
  } else if (c.dueDiligence === "Sim" && dueStage) {
    add("dataReuniao", "Data da reunião", !isValidIsoDateString(c.dataReuniao));
  }
  return items;
}

/**
 * Pendências da migração de um negócio do RD para a etapa do CRM onde ele vai cair.
 * Mesma régua do CRM: cadastro do Novo Lead, campos das transições já passadas, bloco da
 * proposta, evidência das etapas que o RD já cumpriu e o cadastro do pós-venda.
 */
export function computeRdMigrationRequirements(input: {
  stage: OpportunityStage;
  values: RdMigrationValues;
  /** `field_definitions` ativos do funil de vendas (todas as etapas). */
  fieldDefinitions: FieldDefinition[];
  responsibleAppUserId: string | null;
}): RdMigrationRequirements {
  const { stage, values } = input;
  const needs = rdMigrationNeedsForStage(stage);
  const items: RdMigrationItem[] = [];

  items.push({
    key: "responsavel",
    section: "responsavel",
    label: "Responsável pelo lead no CRM",
    missing: !input.responsibleAppUserId,
  });

  items.push(...cadastroItems(stage, values));

  const fieldDefinitions = selectRdMigrationFieldDefinitions(stage, input.fieldDefinitions);
  if (needs.proposta) {
    const blockError = validateReuniaoConfeccaoValues({
      customValues: values.campos,
      empresasIntake: empresasIntakeFromCadastro(values),
    });
    items.push({
      key: "proposta.bloco",
      section: "proposta",
      label: blockError ?? "Endereço, áreas, escopo e prazo da proposta",
      missing: Boolean(blockError),
    });
  }
  if (fieldDefinitions.length > 0) {
    const blocking = new Set(listBlockingCustomFields(fieldDefinitions, values.campos).map((d) => d.field_code));
    for (const def of fieldDefinitions) {
      if (!def.is_required && !blocking.has(def.field_code)) continue;
      items.push({
        key: `campos.${def.field_code}`,
        section: "proposta",
        label: blocking.has(def.field_code)
          ? formatTransitionBlockingError(def, values.campos).replace(/^Campo obrigatório: /, "")
          : def.label,
        missing: blocking.has(def.field_code),
      });
    }
  }

  const ev = values.evidencias;
  if (needs.linkProposta === "required") {
    items.push({
      key: "evidencias.linkProposta",
      section: "evidencias",
      label: "Link da proposta enviada (SharePoint)",
      missing: !ev.linkProposta.trim(),
    });
  }
  if (needs.linkContrato === "required") {
    items.push({
      key: "evidencias.linkContrato",
      section: "evidencias",
      label: "Link do contrato elaborado (SharePoint)",
      missing: !ev.linkContrato.trim(),
    });
  }
  if (needs.d4sign === "required") {
    items.push({
      key: "evidencias.d4signDocumentUuid",
      section: "evidencias",
      label: "Documento enviado para assinatura na D4Sign",
      missing: !ev.d4signDocumentUuid.trim(),
    });
  }
  if (needs.dataAssinatura) {
    items.push({
      key: "evidencias.dataAssinatura",
      section: "evidencias",
      label: "Data de assinatura do contrato",
      missing: !isValidIsoDateString(ev.dataAssinatura),
    });
  }

  if (needs.investimento) {
    items.push({
      key: "investimento",
      section: "investimento",
      label: "Investimento da proposta pelo catálogo (aba Proposta)",
      missing: !hasInvestimentoValue(values.campos.cp_escopo_detalhe_json),
      afterConversion: true,
    });
  }

  if (needs.onboarding === "required") {
    const missingOnboarding = listMissingOnboardingFields(values.onboarding);
    if (missingOnboarding.length === 0) {
      items.push({ key: "onboarding", section: "pos_venda", label: "Cadastro do cliente e faturamento", missing: false });
    }
    for (const label of missingOnboarding) {
      items.push({ key: `onboarding.${normalizeLabelKey(label)}`, section: "pos_venda", label, missing: true });
    }
  }

  const missing = items.filter((i) => i.missing);
  const missingBeforeConversion = missing.filter((i) => !i.afterConversion);
  return {
    stage,
    needs,
    fieldDefinitions,
    items,
    missing,
    missingBeforeConversion,
    readyForConversion: missingBeforeConversion.length === 0,
    complete: missing.length === 0,
  };
}
