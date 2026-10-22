/**
 * Regras do passo Reunião → Confecção de Proposta, usadas pelos dois modais de transição
 * (arrasto no kanban e "Avançar" da ficha): campos com bloco próprio, campos ocultos,
 * validação, qualificação montada e quais campos genéricos aparecem.
 */
import {
  evaluateCondition,
  type FieldCondition,
  type FieldDefinition,
} from "@/lib/crm/crm-field-schema";
import {
  buildCpQualificacaoText,
  parsePropostaEmpresasJson,
  type EmpresaIntakeRow,
} from "@/lib/crm/proposta-empresas";
import { PROPOSTA_TIPOS_CATALOG, type PropostaAreaKey } from "@/data/proposta-tipos-catalog";
import { normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { comContratantesPadrao } from "@/lib/crm/proposta-contratantes";
import { areaHasEscopoTipoFilled, extractTiposByAreaFromEscopoJson } from "@/lib/crm/proposta-escopo-direcionamento";

type FieldValues = Record<string, string | string[] | undefined>;

/** Campos tratados pelo bloco dedicado Reunião → elaboração da proposta (não repetir no formulário genérico). */
export const REUNIAO_CONFECCAO_MANAGED_CODES = new Set([
  "cp_gestor_contrato",
  "cp_proposta_empresas_json",
  "cp_cliente_cep",
  "cp_cliente_logradouro",
  "cp_cliente_bairro",
  "cp_cliente_cidade",
  "cp_cliente_uf",
  "cp_cliente_numero",
  "cp_cliente_complemento",
  "cp_qualificacao",
  "cp_areas_objeto",
  "cp_escopo_detalhe_json",
  "cp_prazo_entrega",
  "cp_objeto_proposta",
]);

/** Ocultos neste modal (preenchimento no detalhe do lead ou fora deste passo). */
export const REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC = new Set([
  "cp_nome_focal",
  "cp_email_focal",
  "cp_tel_focal",
  "cp_realizou_due",
  "cp_captador",
  "cp_info_adicionais",
  "cp_primeiro_vencimento",
  /** Preenchido no builder da proposta, não neste modal de transição. */
  "cp_tributacao",
]);

export function isReuniaoConfeccaoTransition(params: {
  sourceStage: string;
  nextStage: string;
  pipeline: string;
}): boolean {
  return (
    params.sourceStage === "reuniao" &&
    params.nextStage === "confeccao_proposta" &&
    params.pipeline === "vendas"
  );
}

export function normalizeAreasObjetoFromServer(
  raw: string | string[] | undefined,
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    try {
      const j = JSON.parse(raw) as unknown;
      if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      /* fallthrough */
    }
    return raw
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/** Validação do bloco dedicado (endereço, áreas, escopo, prazo, empresas). `null` = ok. */
export function validateReuniaoConfeccaoValues(params: {
  customValues: FieldValues;
  empresasIntake: EmpresaIntakeRow[];
}): string | null {
  const { customValues, empresasIntake } = params;
  const empresasPayload = parsePropostaEmpresasJson(
    typeof customValues.cp_proposta_empresas_json === "string"
      ? customValues.cp_proposta_empresas_json
      : "",
  );
  const cep = String(customValues.cp_cliente_cep ?? "").replace(/\D/g, "");
  if (cep.length !== 8) {
    return "Informe um CEP válido (8 dígitos).";
  }
  if (!String(customValues.cp_cliente_numero ?? "").trim()) {
    return "Informe o número do endereço.";
  }
  const log = String(customValues.cp_cliente_logradouro ?? "").trim();
  const cid = String(customValues.cp_cliente_cidade ?? "").trim();
  if (!log && !cid) {
    return "Busque o CEP ou preencha logradouro e cidade.";
  }
  const areas = normalizeAreasObjetoFromServer(customValues.cp_areas_objeto);
  if (!areas || areas.length === 0) {
    return "Selecione pelo menos uma área de escopo.";
  }
  const escopoRaw =
    typeof customValues.cp_escopo_detalhe_json === "string"
      ? customValues.cp_escopo_detalhe_json
      : "";
  const tiposByArea = extractTiposByAreaFromEscopoJson(escopoRaw, areas);
  for (const area of areas) {
    const catalogArea = normalizePracticeAreaKey(area) as PropostaAreaKey;
    const tipos = PROPOSTA_TIPOS_CATALOG[catalogArea] ?? [];
    if (tipos.length > 0 && !areaHasEscopoTipoFilled(tiposByArea, area)) {
      return `Selecione pelo menos um tipo de escopo para a área ${area}.`;
    }
  }
  if (!String(customValues.cp_prazo_entrega ?? "").trim()) {
    return "Informe o prazo para entrega.";
  }
  if (empresasIntake.length === 0) {
    const ok = empresasPayload.extras.some(
      (ex) => ex.razao_social.trim().length > 0 && ex.documento.trim().length > 0,
    );
    if (!ok) {
      return "Cadastre uma empresa na ficha do lead ou preencha razão social e CNPJ/CPF adicionais.";
    }
  }
  return null;
}

/** Valores vindos do servidor prontos para o bloco: áreas em lista e empresa principal marcada. */
export function prepareConfeccaoFieldValues(params: {
  fieldValues: FieldValues;
  empresasIntake: EmpresaIntakeRow[];
}): FieldValues {
  let out = { ...params.fieldValues };
  const areas = normalizeAreasObjetoFromServer(out.cp_areas_objeto);
  if (areas) out = { ...out, cp_areas_objeto: areas };
  if (params.empresasIntake.length > 0) {
    const raw = out.cp_proposta_empresas_json;
    const empty = !raw || (typeof raw === "string" && raw.trim() === "");
    if (empty) {
      out = {
        ...out,
        cp_proposta_empresas_json: JSON.stringify({
          primaryIndex: params.empresasIntake[0].index,
          extras: [],
        }),
      };
    }
  }
  return out;
}

/** Valores a gravar: os do modal mais a qualificação completa montada das empresas e do endereço. */
export function withConfeccaoQualificacao(params: {
  customValues: FieldValues;
  empresasIntake: EmpresaIntakeRow[];
}): FieldValues {
  const { customValues, empresasIntake } = params;
  // Sem escolha explícita, as outras pessoas/empresas do cadastro entram como contratantes.
  const empresasPayload = comContratantesPadrao(
    parsePropostaEmpresasJson(
      typeof customValues.cp_proposta_empresas_json === "string"
        ? customValues.cp_proposta_empresas_json
        : "",
    ),
    empresasIntake,
  );
  return {
    ...customValues,
    cp_proposta_empresas_json: JSON.stringify(empresasPayload),
    cp_qualificacao: buildCpQualificacaoText({
      empresasIntake,
      empresasPayload,
      endereco: {
        cep: String(customValues.cp_cliente_cep ?? ""),
        logradouro: String(customValues.cp_cliente_logradouro ?? ""),
        numero: String(customValues.cp_cliente_numero ?? ""),
        complemento: String(customValues.cp_cliente_complemento ?? ""),
        bairro: String(customValues.cp_cliente_bairro ?? ""),
        cidade: String(customValues.cp_cliente_cidade ?? ""),
        uf: String(customValues.cp_cliente_uf ?? ""),
      },
    }),
  };
}

/**
 * Campos genéricos que o modal mostra: ativos, com a condição atendida pelos valores atuais
 * (ex.: "Link do Arquivo DUE" só com "Realizou Due Diligence?" = Sim) e fora do bloco
 * dedicado/ocultos no passo Reunião → Confecção.
 */
export function visibleTransitionCustomFields(
  defs: FieldDefinition[],
  values: FieldValues,
  params: { nextStage: string; reuniaoConfeccao: boolean },
): FieldDefinition[] {
  // Herdados da proposta / preenchidos no builder — não pedir no modal.
  if (params.nextStage === "confeccao_contrato") return [];
  return defs
    .filter((f) => f.is_active !== false)
    .filter((f) => evaluateCondition(f.condition_json as FieldCondition, values))
    .filter((f) => {
      if (!params.reuniaoConfeccao) return true;
      if (REUNIAO_CONFECCAO_MANAGED_CODES.has(f.field_code)) return false;
      if (REUNIAO_CONFECCAO_HIDDEN_FROM_GENERIC.has(f.field_code)) return false;
      return true;
    });
}

/** `fieldValuesByCode` da transição: campos visíveis (+ bloco dedicado) com valor. */
export function buildTransitionFieldPayload(params: {
  visibleFields: FieldDefinition[];
  values: FieldValues;
  reuniaoConfeccao: boolean;
}): Record<string, string | string[]> {
  const codes = new Set(params.visibleFields.map((f) => f.field_code));
  if (params.reuniaoConfeccao) {
    REUNIAO_CONFECCAO_MANAGED_CODES.forEach((c) => codes.add(c));
  }
  const payload: Record<string, string | string[]> = {};
  for (const code of codes) {
    const v = params.values[code];
    if (Array.isArray(v)) {
      if (v.length > 0) payload[code] = v;
    } else if (v !== undefined && String(v).trim() !== "") {
      payload[code] = String(v).trim();
    }
  }
  return payload;
}
