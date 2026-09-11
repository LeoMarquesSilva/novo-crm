import { SCOPE_IDS } from "./clause-catalog";
import type { ContractRequiredField, ContractScopeProfile } from "./types";

const CONTENCIOSO_FIELDS: ContractRequiredField[] = [
  {
    key: "numero_processo",
    label: "Número do processo",
    type: "text",
    required: true,
    sourceHints: ["proposal", "opportunity", "process"],
  },
  {
    key: "parte_contraria",
    label: "Parte contrária",
    type: "text",
    required: true,
    sourceHints: ["proposal", "opportunity", "process"],
  },
  {
    key: "vara_tribunal",
    label: "Vara / Tribunal",
    type: "text",
    required: true,
    sourceHints: ["proposal", "opportunity", "process"],
  },
  {
    key: "valor_causa",
    label: "Valor da causa",
    type: "currency",
    required: false,
    sourceHints: ["proposal", "opportunity", "process"],
  },
];

/** Só relevante no Full Service (carteira de processos); opcional, não bloqueia o caso único. */
const QTD_ACOES_FIELD: ContractRequiredField = {
  key: "qtd_acoes",
  label: "Quantidade de ações (Full Service)",
  type: "text",
  required: false,
  sourceHints: ["opportunity", "manual"],
};

/**
 * Valor da hora/processo excedente ao limite — obrigatório sempre que há
 * limite de quantidade (padrão do template `contrato_honorarios_template_1.md`).
 * Só bloqueia de fato quando o subescopo Full Service é o que está sendo
 * renderizado (o motor só conta como "usado" o campo que o bloco realmente
 * referencia — ver `usedRequiredFieldKeys` em object-engine.ts).
 */
const VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO_FIELD: ContractRequiredField = {
  key: "valor_excedente_trabalhista_contencioso",
  label: "Valor por processo excedente (Full Service Trabalhista)",
  type: "currency",
  required: true,
  sourceHints: ["opportunity", "manual"],
};

/** Só relevante no Full Service (carga horária consultiva); opcional. */
const QTD_HORAS_TRABALHISTA_FIELD: ContractRequiredField = {
  key: "qtd_horas_trabalhista",
  label: "Carga horária mensal consultiva (Full Service)",
  type: "text",
  required: false,
  sourceHints: ["opportunity", "manual"],
};

/** Par obrigatório de QTD_HORAS_TRABALHISTA_FIELD — ver nota acima. */
const VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO_FIELD: ContractRequiredField = {
  key: "valor_excedente_trabalhista_consultivo",
  label: "Valor por hora excedente (Full Service Trabalhista)",
  type: "currency",
  required: true,
  sourceHints: ["opportunity", "manual"],
};

/** Carga horária mensal do Consultivo Societário — central ao objeto, sempre obrigatória. */
const QTD_HORAS_SOCIETARIO_FIELD: ContractRequiredField = {
  key: "qtd_horas_societario",
  label: "Carga horária técnica mensal (Consultivo Societário)",
  type: "text",
  required: true,
  sourceHints: ["opportunity", "manual"],
};

/** Par obrigatório de QTD_HORAS_SOCIETARIO_FIELD. */
const VALOR_EXCEDENTE_SOCIETARIO_FIELD: ContractRequiredField = {
  key: "valor_excedente_societario",
  label: "Valor por hora excedente (Consultivo Societário)",
  type: "currency",
  required: true,
  sourceHints: ["opportunity", "manual"],
};

/**
 * Diferente do Contencioso Trabalhista: o objeto real Cível não nomeia parte
 * contrária nem valor da causa, só número do processo e vara/tribunal.
 */
const CIVEL_FIELDS: ContractRequiredField[] = [
  {
    // Chave própria (não "numero_processo"): esse mesmo nome já é usado pelo
    // Contencioso Trabalhista — como os dois podem estar no mesmo contrato ao
    // mesmo tempo (ex.: lead com Trabalhista + Cível), duas chaves iguais faziam
    // o valor de um escopo sobrescrever o do outro no mapa de placeholders (e
    // duplicavam a key React no formulário, com o mesmo rótulo "Vara / Tribunal").
    key: "numero_processo_civel",
    label: "Número do processo",
    type: "text",
    required: true,
    sourceHints: ["proposal", "opportunity", "process"],
  },
  {
    key: "vara_tribunal_civel",
    label: "Vara / Tribunal",
    type: "text",
    required: true,
    sourceHints: ["proposal", "opportunity", "process"],
  },
];

export const CONTRACT_SCOPE_PROFILES: ContractScopeProfile[] = [
  {
    scopeSubtypeId: SCOPE_IDS.auditoria,
    label: "Auditoria Trabalhista",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 10,
    typeSortOrder: 30,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: ["object.trabalhista.auditoria", "object.trabalhista.auditoria.scope"],
      objectGroupKey: "trabalhista",
    },
    requiredContractFields: [],
    objectClauseKeys: ["object_auditoria"],
    scopeClauseKeys: ["scope_auditoria"],
    limitationClauseKeys: [],
    exclusionClauseKeys: [
      "exclusion_trabalhista_contencioso",
      "exclusion_trabalhista_consultivo",
      "exclusion_trabalhista_diagnostico",
      "exclusion_trabalhista_canal",
      "exclusion_trabalhista_mpt",
      "exclusion_trabalhista_sustentacao",
    ],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: {
      kind: "until_deliverable_with_estimate",
      deliverable: "Relatório Conclusivo da Auditoria Trabalhista",
      months: 4,
      estimateLabel: "4 (quatro) meses",
    },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.canal,
    label: "Canal de Denúncias - Gestão e Triagem",
    instrumentType: "Contrato de Prestação de Serviços",
    areaSortOrder: 10,
    typeSortOrder: 40,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.trabalhista.canal_denuncias",
        "object.trabalhista.canal_denuncias.scope",
        "object.trabalhista.canal_denuncias.limitation",
        "object.trabalhista.canal_denuncias.nature",
      ],
      objectGroupKey: "trabalhista",
    },
    requiredContractFields: [],
    objectClauseKeys: ["object_canal"],
    scopeClauseKeys: ["scope_canal"],
    limitationClauseKeys: ["limitation_canal"],
    exclusionClauseKeys: [
      "exclusion_trabalhista_contencioso",
      "exclusion_trabalhista_consultivo",
      "exclusion_trabalhista_auditoria",
      "exclusion_trabalhista_diagnostico",
      "exclusion_trabalhista_mpt",
      "exclusion_trabalhista_sustentacao",
    ],
    natureClauseKeys: ["nature_canal"],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "fixed_months", months: 12 },
    defaultStartRule: { kind: "on_first_payment" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.diagnostico,
    label: "Diagnóstico Organizacional de Riscos Psicossociais (NR-1)",
    instrumentType: "Contrato de Prestação de Serviços",
    areaSortOrder: 10,
    typeSortOrder: 50,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.trabalhista.diagnostico_nr1",
        "object.trabalhista.diagnostico_nr1.scope",
        "object.trabalhista.diagnostico_nr1.limitation",
      ],
      objectGroupKey: "trabalhista",
    },
    requiredContractFields: [],
    objectClauseKeys: ["object_diagnostico"],
    scopeClauseKeys: ["scope_diagnostico"],
    limitationClauseKeys: ["limitation_diagnostico"],
    exclusionClauseKeys: [
      "exclusion_trabalhista_contencioso",
      "exclusion_trabalhista_consultivo",
      "exclusion_trabalhista_auditoria",
      "exclusion_trabalhista_canal",
      "exclusion_trabalhista_mpt",
      "exclusion_trabalhista_sustentacao",
    ],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: {
      kind: "until_deliverable_with_estimate",
      deliverable: "laudo conclusivo do diagnóstico dos riscos psicossociais",
      days: 30,
      estimateLabel: "30 (trinta) dias",
    },
    defaultStartRule: { kind: "on_first_payment" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.contencioso,
    label: "Contencioso - Acompanhamento de Ação Judicial",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 10,
    typeSortOrder: 10,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.trabalhista.contencioso.single_case",
        "object.trabalhista.contencioso.subscope",
      ],
      objectGroupKey: "trabalhista",
    },
    requiredContractFields: [
      ...CONTENCIOSO_FIELDS,
      QTD_ACOES_FIELD,
      VALOR_EXCEDENTE_TRABALHISTA_CONTENCIOSO_FIELD,
    ],
    objectClauseKeys: ["object_contencioso_trabalhista"],
    scopeClauseKeys: [],
    limitationClauseKeys: ["limitation_contencioso_trabalhista"],
    exclusionClauseKeys: [
      "exclusion_trabalhista_auditoria",
      "exclusion_trabalhista_diagnostico",
      "exclusion_trabalhista_canal",
      "exclusion_trabalhista_mpt",
      "exclusion_trabalhista_sustentacao",
    ],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.consultivo,
    label: "Consultivo",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 10,
    typeSortOrder: 20,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.trabalhista.consultivo",
        "object.trabalhista.consultivo.subscope",
      ],
      objectGroupKey: "trabalhista",
    },
    requiredContractFields: [
      QTD_HORAS_TRABALHISTA_FIELD,
      VALOR_EXCEDENTE_TRABALHISTA_CONSULTIVO_FIELD,
    ],
    objectClauseKeys: ["object_consultivo_trabalhista"],
    scopeClauseKeys: [],
    limitationClauseKeys: [],
    exclusionClauseKeys: [
      "exclusion_trabalhista_auditoria",
      "exclusion_trabalhista_diagnostico",
      "exclusion_trabalhista_canal",
    ],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.civel,
    label: "Contencioso Cível (1 processo)",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 0,
    typeSortOrder: 10,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: ["object.civel.um_processo", "object.civel.um_processo.nature"],
      objectGroupKey: "civel",
    },
    requiredContractFields: CIVEL_FIELDS,
    objectClauseKeys: ["object_civel_um_processo"],
    scopeClauseKeys: [],
    limitationClauseKeys: [],
    exclusionClauseKeys: [],
    natureClauseKeys: ["nature_civel_um_processo"],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.civelMaisUmProcesso,
    label: "Contencioso Cível (+1 processo)",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 0,
    typeSortOrder: 10,
    subtypeSortOrder: 20,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.civel.mais_um_processo",
        "object.civel.mais_um_processo.nature",
      ],
      objectGroupKey: "civel",
    },
    requiredContractFields: CIVEL_FIELDS,
    objectClauseKeys: ["object_civel_mais_um_processo"],
    scopeClauseKeys: [],
    limitationClauseKeys: [],
    exclusionClauseKeys: [],
    natureClauseKeys: ["nature_civel_mais_um_processo"],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.reestruturacaoNegociacoes,
    label: "Negociações Estratégicas (Reestruturação)",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 50,
    typeSortOrder: 10,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.reestruturacao.negociacoes_estrategicas",
        "object.reestruturacao.negociacoes_estrategicas.scope",
        "object.reestruturacao.negociacoes_estrategicas.exclusoes",
        "object.reestruturacao.negociacoes_estrategicas.sucumbencia",
        "object.reestruturacao.negociacoes_estrategicas.compensacao",
        "object.reestruturacao.negociacoes_estrategicas.confidencialidade",
        "object.reestruturacao.negociacoes_estrategicas.solidariedade",
      ],
      objectGroupKey: "reestruturacao",
    },
    requiredContractFields: [],
    objectClauseKeys: ["object_reestruturacao_negociacoes"],
    scopeClauseKeys: ["scope_reestruturacao_negociacoes"],
    limitationClauseKeys: [],
    exclusionClauseKeys: ["exclusion_reestruturacao_consultoria_correlata"],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_first_payment" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.societarioDiagnostico,
    label: "Diagnóstico, Estruturação e Proteção Patrimonial",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 20,
    typeSortOrder: 10,
    subtypeSortOrder: 20,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.societario.diagnostico_estruturacao",
        "object.societario.diagnostico_estruturacao.scope",
      ],
      objectGroupKey: "societario",
    },
    requiredContractFields: [],
    objectClauseKeys: ["object_societario_diagnostico"],
    scopeClauseKeys: [],
    limitationClauseKeys: [],
    exclusionClauseKeys: [],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: {
      kind: "until_deliverable",
      deliverable:
        "relatório diagnóstico societário, parecer jurídico comparativo e minutas finais dos instrumentos societários",
    },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
  {
    scopeSubtypeId: SCOPE_IDS.contratual,
    label: "Consultivo, Revisão e Elaboração de Contratos",
    instrumentType: "Contrato de Prestação de Serviços Advocatícios",
    areaSortOrder: 20,
    typeSortOrder: 20,
    subtypeSortOrder: 10,
    objectDefinition: {
      mode: "simple",
      objectBlockKeys: [
        "object.societario.consultivo_contratual",
        "object.societario.consultivo_contratual.limitation",
      ],
      objectGroupKey: "societario",
    },
    requiredContractFields: [QTD_HORAS_SOCIETARIO_FIELD, VALOR_EXCEDENTE_SOCIETARIO_FIELD],
    objectClauseKeys: ["object_societario_contratual"],
    scopeClauseKeys: [],
    limitationClauseKeys: ["limitation_societario_contratual"],
    exclusionClauseKeys: [],
    natureClauseKeys: [],
    contractedObligationKeys: [],
    contractingObligationKeys: [],
    defaultTermRule: { kind: "indefinite" },
    defaultStartRule: { kind: "on_signature" },
    active: true,
    status: "pending_legal_review",
  },
];

const bySubtype = new Map(CONTRACT_SCOPE_PROFILES.map((p) => [p.scopeSubtypeId, p]));

export function getScopeProfile(subtypeId: string): ContractScopeProfile | undefined {
  return bySubtype.get(subtypeId);
}
