const FIELD_LABEL_OVERRIDES: Record<string, string> = {
  cp_escopo_detalhe_json: "Escopo detalhado por área",
  cp_proposta_empresas_json: "Empresas da proposta",
};

const TECHNICAL_SUFFIX =
  /\s*[-–—]?\s*\[(?:CP|CC|CA|CE|CADASTRO|FINANCEIRO|DATA|HOR[ÁA]RIO)\]\s*$/iu;

/** Marcadores entre parênteses herdados do RD: "(JSON)" e "(DD)" (reunião da due diligence). */
const TECHNICAL_PARENTHESES = /\s*\(\s*(?:JSON|DD)\s*\)\s*/giu;

/** Palavras que vieram do RD sem acento. */
const ACCENTED_WORDS: Record<string, string> = {
  analise: "análise",
  areas: "áreas",
  civel: "cível",
  confeccao: "confecção",
  elaboracao: "elaboração",
  endereco: "endereço",
  exito: "êxito",
  havera: "haverá",
  horario: "horário",
  indicacao: "indicação",
  indice: "índice",
  informacoes: "informações",
  inicio: "início",
  limitacao: "limitação",
  manutencao: "manutenção",
  numero: "número",
  observacoes: "observações",
  posicao: "posição",
  preco: "preço",
  qualificacao: "qualificação",
  razao: "razão",
  razoes: "razões",
  reestruturacao: "reestruturação",
  responsavel: "responsável",
  reuniao: "reunião",
  societario: "societário",
  socios: "sócios",
  tributacao: "tributação",
  tributario: "tributário",
  variavel: "variável",
  vigencia: "vigência",
};

/**
 * Acentua as palavras conhecidas e tira a caixa alta de palavras comuns ("STATUS" → "Status").
 * Siglas curtas (CNPJ, CPF, CEP, UF, SPOT, ADD, DUE) têm até 4 letras e ficam como estão.
 */
function polishLabelWords(label: string): string {
  return label.replace(/\p{L}+/gu, (word) => {
    const lower = word.toLocaleLowerCase("pt-BR");
    const shouting = word.length >= 5 && word === word.toLocaleUpperCase("pt-BR");
    const base = ACCENTED_WORDS[lower] ?? (shouting ? lower : null);
    if (!base) return word;
    const first = word.charAt(0);
    const startsUpper = first !== first.toLocaleLowerCase("pt-BR");
    return startsUpper ? base.charAt(0).toLocaleUpperCase("pt-BR") + base.slice(1) : base;
  });
}

function humanizeFieldCode(code: string): string {
  const words = code
    .replace(/^(?:cp|cc|ca|ce)_/i, "")
    .replace(/_json$/i, "")
    .split("_")
    .filter(Boolean);
  if (words.length === 0) return "Campo";
  const text = words.join(" ");
  return polishLabelWords(text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1));
}

/** Remove marcadores internos dos rótulos antes de exibi-los no CRM. */
export function userFacingFieldLabel(rawLabel: string, fieldCode?: string | null): string {
  const code = fieldCode?.trim() ?? "";
  let label = rawLabel.trim();
  const hasTechnicalMarker =
    /\(\s*JSON\s*\)/iu.test(label) ||
    TECHNICAL_SUFFIX.test(label) ||
    (code && label.toLocaleLowerCase("pt-BR") === code.toLocaleLowerCase("pt-BR"));
  if (code && FIELD_LABEL_OVERRIDES[code] && hasTechnicalMarker) {
    return FIELD_LABEL_OVERRIDES[code];
  }

  while (TECHNICAL_SUFFIX.test(label)) label = label.replace(TECHNICAL_SUFFIX, "").trim();
  label = label
    .replace(TECHNICAL_PARENTHESES, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—]\s*$/u, "")
    .trim();

  if (!label || (code && label.toLocaleLowerCase("pt-BR") === code.toLocaleLowerCase("pt-BR"))) {
    return humanizeFieldCode(code || rawLabel);
  }
  return polishLabelWords(label);
}

/** Corrige também eventos históricos que já foram gravados com rótulos técnicos. */
export function userFacingActivityTitle(params: {
  kind: string;
  title: string;
  metadata?: Record<string, unknown>;
}): string {
  const { kind, metadata = {} } = params;
  const title = params.title.trim();
  const prefixByKind: Record<string, string> = {
    campo_pipeline_alterado: "Campo atualizado:",
    campo_rd_alterado: "Campo RD atualizado:",
    campo_intake_alterado: "Cadastro atualizado:",
  };
  const prefix = prefixByKind[kind];
  if (!prefix) return title;

  const colon = title.indexOf(":");
  const rawLabel = colon >= 0 ? title.slice(colon + 1) : title;
  const fieldCode =
    typeof metadata.field_code === "string"
      ? metadata.field_code
      : typeof metadata.field_key === "string"
        ? metadata.field_key
        : null;
  return `${prefix} ${userFacingFieldLabel(rawLabel, fieldCode)}`;
}
