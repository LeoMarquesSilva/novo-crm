import { CRM_PRACTICE_AREAS, type CrmPracticeArea } from "@/lib/crm/crm-areas";
import { isValidIsoDateString } from "@/lib/crm/date-br";
import {
  indicationTypes,
  leadDigitalPlatforms,
  leadTypes,
} from "@/modules/crm/application/services/new-lead-payload";
import { REAJUSTE_INDICES } from "@/modules/crm/domain/client-onboarding";

import {
  normalizeRdLabel,
  rdFieldWithLabel,
  type RdCustomFieldValue,
  type RdDealSnapshot,
} from "./rd-deal";
import {
  extractCeps,
  extractDocuments,
  extractEmails,
  extractParties,
  extractPhones,
  splitPeopleNames,
} from "./documents";
import { emptyRdMigrationValues, type RdMigrationEmpresa, type RdMigrationValues } from "./values";

/**
 * Rótulos dos campos personalizados do RD (catálogo `catalogo-campos-rd-regras-etapas.md`).
 * A comparação ignora acento, caixa, hífen e colchete; a primeira variação encontrada vale.
 */
export const RD_LABELS = {
  solicitante: ["Solicitante", "Nome do solicitante", "Solicitante (nome)"],
  solicitanteEmail: ["Email Solicitante", "E-mail do Solicitante", "E-mail Solicitante", "Email do Solicitante"],
  cadastroPor: ["Cadastro realizado por", "Cadastro realizado por (e-mail)"],
  haveraDue: ["Haverá Due Diligence?", "Havera Due Diligence?"],
  razaoSocial: ["Razão Social / Nome Completo", "Razão Social [CP]", "Razão Social"],
  documento: ["CNPJ/CPF", "CNPJ [CP]", "CNPJ / CPF", "CPF/CNPJ", "CNPJ"],
  localReuniao: ["Local da Reunião"],
  dataReuniao: ["Data da Reunião"],
  horarioReuniao: ["Horário da Reunião", "Horário"],
  tipoLead: ["Tipo de Lead"],
  tipoIndicacao: ["Indicação", "Tipo de Indicação"],
  nomeIndicacao: ["Nome da Indicação"],
  plataforma: ["Plataforma"],
  decisor: ["Decisor"],
  areasAnalise: ["Áreas que serão objeto de análise", "Áreas de análise", "Áreas de Análise"],
  prazoDueData: ["Prazo de Entrega Due [DATA]", "Prazo de Entrega da Due"],
  prazoDueHorario: ["Prazo de Entrega Due [HORÁRIO]", "Horário de Entrega da Due"],
  qualificacao: [
    "Qualificação completa (endereço, CEP, endereço eletrônico etc.) [CP]",
    "Qualificação completa [CP]",
    "Qualificação [CP]",
  ],
  areasObjeto: ["Áreas Objeto do contrato [CP]", "Áreas objeto do contrato [CP]"],
  gestor: ["Gestor do Contrato [CP]"],
  captador: ["Captador [CP]"],
  prazoEntrega: ["Prazo para entrega [CP]"],
  primeiroVencimento: ["Data do primeiro vencimento [CP]"],
  realizouDue: ["Realizou Due Diligence? [CP]"],
  nomeFocal: ["Nome do ponto focal / Comercial [CP]"],
  emailFocal: ["E-mail do ponto focal / Comercial [CP]"],
  telFocal: ["Telefone do ponto focal / Comercial [CP]"],
  tributacao: ["Tributação [CP]"],
  infoAdicionais: ["Informações adicionais [CP]"],
  linkProposta: ["Link da Proposta [CP]", "Link da Proposta"],
  linkContrato: ["Link Contrato [CE]", "Link do Contrato [CE]", "Link do Contrato"],
  dataAssinatura: ["Data de assinatura do contrato [CA]"],
  cadRazaoSocial: ["Razão Social Cliente Principal [CADASTRO]"],
  cadDocumento: ["CNPJ / CPF Cliente Principal [CADASTRO]", "CNPJ/CPF Cliente Principal [CADASTRO]"],
  cadEndereco: ["Endereço Cliente Principal [CADASTRO]"],
  cadInfo: ["Informações Adicionais [CADASTRO]"],
  cadStatus: ["STATUS [CADASTRO]"],
  finRazao: ["Razão Social para Faturamento [FINANCEIRO]"],
  finDocumento: ["CPF/CNPJ para Faturamento [FINANCEIRO]", "CNPJ/CPF para Faturamento [FINANCEIRO]"],
  finInicioVigencia: ["Início da Vigência do Contrato [FINANCEIRO]"],
  finPrimeiroFaturamento: ["Primeiro Faturamento [FINANCEIRO]"],
  finResponsavel: ["Responsável Financeiro do Cliente [FINANCEIRO]"],
  finEmail: ["E-mail Responsável Financeiro do Cliente [FINANCEIRO]"],
  finTelefone: ["Telefone Responsável Financeiro do Cliente [FINANCEIRO]"],
  finRepasse: ["Repasse acordado % [FINANCEIRO]"],
  finIndice: ["Índice de Reajuste - [FINANCEIRO]"],
  finPeriodicidade: ["Periodicidade do Reajuste - [FINANCEIRO]"],
  finObservacoes: ["Observações - [FINANCEIRO]"],
  finStatus: ["STATUS [FINANCEIRO]"],
} as const;

/** Rótulos longos que variam no texto entre parênteses: casam pelo começo. */
const RD_LABEL_PREFIXES = {
  demaisRazoes: "demais razoes sociais",
  cadSocios: "qualificacao dos socios",
  cadConsulta: "cadastrar na consulta automatizada",
  finPosicao: "posicao do responsavel",
} as const;

type AppUserOption = { id: string; fullName: string };

export type RdMigrationPrefillInput = {
  deal: RdDealSnapshot;
  opportunity: {
    /** Nome do lead no CRM (título do deal). */
    nome: string;
    haveraDueDiligence: boolean;
    linkProposta: string | null;
    linkContrato: string | null;
    d4signDocumentUuid: string | null;
  };
  /** Usuários ativos do CRM, para casar Gestor e Captador do RD pelo nome. */
  users?: AppUserOption[];
  /** Opções dos campos de lista (`field_definitions.field_options`) por `field_code`. */
  fieldOptions?: Record<string, string[] | null | undefined>;
};

function textOf(value: RdCustomFieldValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  return Array.isArray(value) ? value.join(", ") : value.trim();
}

function listOf(value: RdCustomFieldValue | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fieldByPrefix(deal: RdDealSnapshot, prefix: string): { label: string; value: RdCustomFieldValue } | null {
  for (const [key, field] of deal.fields) {
    if (key.startsWith(prefix)) return field;
  }
  return null;
}

/** "20/10/2026", "2026-10-20" ou "2026-10-20T10:00" → "2026-10-20"; qualquer outra coisa → "". */
export function parseRdDate(raw: string): string {
  const t = raw.trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (br) {
    const iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    return isValidIsoDateString(iso) ? iso : "";
  }
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(t);
  if (iso && isValidIsoDateString(iso[1])) return iso[1];
  return "";
}

/** "9:30", "09h30", "09:30:00" → "09:30". */
export function parseRdTime(raw: string): string {
  const m = /^(\d{1,2})\s*[:hH]\s*(\d{2})/.exec(raw.trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** "R$ 1.234,56", "1234.56", "1234" → 1234.56; texto sem número → null. */
export function parseRdMoney(raw: string): number | null {
  let t = raw.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "50%", "50,5 %" → "50" / "50,5". */
export function parseRdPercent(raw: string): string {
  const t = raw.replace(/%/g, "").trim();
  if (!t) return "";
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? t : "";
}

const UF_LIST =
  "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";

/**
 * Do endereço em texto livre do RD só sai o que é seguro: CEP e UF. O resto a pessoa confere.
 * Dois endereços no mesmo campo ("Rua A … / Rua B …") ou dois CEPs: nada sai (`multiple`).
 */
export function parseRdAddress(raw: string): { cep: string; uf: string; multiple: boolean } {
  const ceps = extractCeps(raw);
  if (raw.split(/\s\/\s/).filter((p) => p.trim()).length > 1 || ceps.length > 1) {
    return { cep: "", uf: "", multiple: true };
  }
  const ufMatches = [...raw.matchAll(new RegExp(`(?:^|[\\s,/-])(${UF_LIST})(?=$|[\\s,./-])`, "g"))];
  const uf = ufMatches.length > 0 ? ufMatches[ufMatches.length - 1][1] : "";
  return { cep: ceps[0] ?? "", uf, multiple: false };
}

/** O campo do RD traz mais de um valor (dois documentos, dois nomes, "a / b"). */
export function rdHasMultipleValues(raw: string): boolean {
  return splitPeopleNames(raw).length > 1 || extractDocuments(raw).length > 1;
}

/** Um CPF/CNPJ válido, quando o campo do RD tem exatamente um; senão "". */
export function singleRdDocument(raw: string): string {
  const docs = extractDocuments(raw);
  return docs.length === 1 && !rdHasMultipleValues(raw) ? docs[0] : "";
}

/** Um e-mail, quando o campo do RD tem exatamente um; senão "". */
export function singleRdEmail(raw: string): string {
  const emails = extractEmails(raw);
  return emails.length === 1 ? emails[0] : "";
}

/** Um telefone, quando o campo do RD tem exatamente um; senão "". */
export function singleRdPhone(raw: string): string {
  const phones = extractPhones(raw);
  return phones.length === 1 ? phones[0] : "";
}

/** Um nome (pessoa/razão social), quando o campo do RD não lista mais de um; senão "". */
export function singleRdName(raw: string): string {
  return rdHasMultipleValues(raw) ? "" : raw.trim();
}

/**
 * Empresas/pessoas do cadastro do lead a partir do RD. Com mais de um CPF/CNPJ válido, uma linha
 * por documento (nome pelo "Demais Razões sociais" ou pela lista de nomes na mesma ordem); com um
 * só, a razão social inteira (vírgula pode ser parte do nome) mais quem estiver em "Demais
 * Razões sociais". Documento com digitação errada não entra: fica vazio para a pessoa conferir.
 */
export function rdEmpresasFromFields(input: {
  razaoSocial: string;
  documento: string;
  demaisRazoes: string;
  fallbackNome: string;
}): RdMigrationEmpresa[] {
  const docs = extractDocuments(input.documento);
  const parties = extractParties(input.demaisRazoes);
  const tipo = (doc: string): "CPF" | "CNPJ" => (doc.length === 11 ? "CPF" : "CNPJ");
  const partyName = (doc: string) => parties.find((p) => p.documento === doc)?.nome ?? "";

  if (docs.length > 1) {
    const names = splitPeopleNames(input.razaoSocial);
    const rows = docs.map((doc, i) => ({
      tipo_documento: tipo(doc),
      razao_social: partyName(doc) || (names.length === docs.length ? names[i] : (names[i] ?? "")),
      documento: doc,
    }));
    for (const p of parties) {
      if (!docs.includes(p.documento)) rows.push({ tipo_documento: tipo(p.documento), razao_social: p.nome, documento: p.documento });
    }
    return rows;
  }

  const razao = input.razaoSocial.trim();
  const principalDoc = docs[0] ?? "";
  const rows: RdMigrationEmpresa[] = [];
  if (principalDoc || razao || input.fallbackNome.trim()) {
    rows.push({
      tipo_documento: principalDoc ? tipo(principalDoc) : "CNPJ",
      razao_social: (principalDoc && partyName(principalDoc)) || razao || input.fallbackNome.trim(),
      documento: principalDoc,
    });
  }
  for (const p of parties) {
    if (p.documento !== principalDoc) rows.push({ tipo_documento: tipo(p.documento), razao_social: p.nome, documento: p.documento });
  }
  return rows;
}

/** Área escrita no RD → área canônica do CRM (`CRM_PRACTICE_AREAS`); "ADD" e desconhecidas → null. */
export function rdAreaToCrm(raw: string): CrmPracticeArea | null {
  const n = normalizeRdLabel(raw);
  if (!n) return null;
  const exact = CRM_PRACTICE_AREAS.find((a) => normalizeRdLabel(a) === n);
  if (exact) return exact;
  if (n.includes("reestrutur") || n.includes("insolv")) return "Reestruturação e Insolvência";
  if (n.includes("recupera") || n.includes("credito")) return "Recuperação de Créditos";
  if (n.includes("trabalh")) return "Trabalhista";
  if (n.includes("tribut")) return "Tributário";
  if (n.includes("societ") || n.includes("contrat")) return "Societário e Contratos";
  if (n.includes("civel") || n.includes("civil")) return "Cível";
  return null;
}

function mapAreas(values: string[]): CrmPracticeArea[] {
  const out: CrmPracticeArea[] = [];
  for (const v of values) {
    const area = rdAreaToCrm(v);
    if (area && !out.includes(area)) out.push(area);
  }
  return out;
}

function matchOption<T extends string>(raw: string, options: readonly T[]): T | "" {
  const n = normalizeRdLabel(raw);
  if (!n) return "";
  return options.find((o) => normalizeRdLabel(o) === n) ?? "";
}

/** Tipo de Lead do RD → opção do Novo Lead ("Indicação" → "Indicacao", "Ativa" → "Lead Ativa"). */
export function mapRdLeadType(raw: string): (typeof leadTypes)[number] | "" {
  const direct = matchOption(raw, leadTypes);
  if (direct) return direct;
  const n = normalizeRdLabel(raw);
  if (n.includes("indica")) return "Indicacao";
  if (n.includes("cross")) return "Cross Selling";
  if (n.includes("digital")) return "Lead Digital";
  if (n.includes("passiv")) return "Lead Passiva";
  if (n.includes("ativ")) return "Lead Ativa";
  return "";
}

function mapYesNo(raw: string): "Sim" | "Nao" | "" {
  const n = normalizeRdLabel(raw);
  if (n === "sim" || n === "s" || n === "true" || n === "yes") return "Sim";
  if (n === "nao" || n === "n" || n === "false" || n === "no") return "Nao";
  return "";
}

/** Índice de reajuste do RD → opção do cadastro (IPCA, IGP-M, INPC, Sem reajuste, Outro). */
export function mapRdReajusteIndex(raw: string): string {
  const n = normalizeRdLabel(raw).replace(/\s/g, "");
  if (!n) return "";
  if (n.includes("ipca")) return "IPCA";
  if (n.includes("igpm")) return "IGP-M";
  if (n.includes("inpc")) return "INPC";
  if (n.includes("sem") || n === "nao" || n.includes("naoha")) return "Sem reajuste";
  return REAJUSTE_INDICES.includes("Outro") ? "Outro" : "";
}

/** "Anual", "12 meses", "semestral" → meses ("12", "6"). */
export function mapRdPeriodicidade(raw: string): string {
  const n = normalizeRdLabel(raw);
  if (!n) return "";
  const digits = /(\d{1,2})/.exec(n);
  if (digits) return String(Number(digits[1]));
  if (n.includes("anual")) return "12";
  if (n.includes("semestr")) return "6";
  if (n.includes("trimestr")) return "3";
  if (n.includes("mensal")) return "1";
  return "";
}

/** Nome do RD → usuário do CRM (igual, ou mesmo primeiro e último nome). */
export function matchAppUserByName(name: string, users: AppUserOption[]): AppUserOption | null {
  const n = normalizeRdLabel(name);
  if (!n) return null;
  const exact = users.find((u) => normalizeRdLabel(u.fullName) === n);
  if (exact) return exact;
  const tokens = n.split(" ");
  if (tokens.length < 2) {
    const byFirst = users.filter((u) => normalizeRdLabel(u.fullName).split(" ")[0] === tokens[0]);
    return byFirst.length === 1 ? byFirst[0] : null;
  }
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const candidates = users.filter((u) => {
    const t = normalizeRdLabel(u.fullName).split(" ");
    return t[0] === first && t[t.length - 1] === last;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Ajusta texto livre do RD à opção da lista do campo, quando há uma equivalente. */
export function coerceToFieldOption(raw: string, options: string[] | null | undefined): string {
  if (!raw || !options?.length) return raw;
  const n = normalizeRdLabel(raw);
  const exact = options.find((o) => normalizeRdLabel(o) === n);
  if (exact) return exact;
  const partial = options.filter((o) => {
    const on = normalizeRdLabel(o);
    return on.includes(n) || n.includes(on);
  });
  if (partial.length === 1) return partial[0];
  if (n.includes("liquid")) return options.find((o) => normalizeRdLabel(o).includes("liquid")) ?? raw;
  if (n.includes("englob")) return options.find((o) => normalizeRdLabel(o).includes("englob")) ?? raw;
  return raw;
}

/** Rateio por área: porcentagem do [CC]; sem ela, valores do [FINANCEIRO] convertidos em %. */
export function rdRateioPorArea(deal: RdDealSnapshot): {
  rows: Array<{ area: string; percentual: string }>;
  origin: "cc" | "financeiro" | null;
} {
  const percent: Array<{ area: string; percentual: string }> = [];
  const money: Array<{ area: string; valor: number }> = [];
  for (const [key, field] of deal.fields) {
    const pct = /^rateio porcentagem %? ?(.+?) cc$/.exec(key);
    if (pct) {
      const area = rdAreaToCrm(pct[1]);
      const value = parseRdPercent(textOf(field.value));
      if (area && value && Number(value.replace(",", ".")) > 0) percent.push({ area, percentual: value });
      continue;
    }
    const val = /^rateio valor r\$? ?(.+?) financeiro$/.exec(key);
    if (val) {
      const area = rdAreaToCrm(val[1]);
      const value = parseRdMoney(textOf(field.value));
      if (area && value && value > 0) money.push({ area, valor: value });
    }
  }
  if (percent.length > 0) return { rows: percent, origin: "cc" };
  const total = money.reduce((acc, r) => acc + r.valor, 0);
  if (money.length > 0 && total > 0) {
    return {
      rows: money.map((r) => ({
        area: r.area,
        percentual: String(Math.round((r.valor / total) * 10_000) / 100).replace(".", ","),
      })),
      origin: "financeiro",
    };
  }
  return { rows: [], origin: null };
}

/**
 * Formulário de migração pré-preenchido com o que o RD tem. Só preenche o que dá para ler
 * com segurança; o resto fica vazio para o responsável (o RD aparece ao lado como referência).
 */
export function buildRdMigrationPrefill(input: RdMigrationPrefillInput): RdMigrationValues {
  const { deal, opportunity } = input;
  const users = input.users ?? [];
  const values = emptyRdMigrationValues();
  const sources: Record<string, string> = {};

  const read = (aliases: readonly string[]) => rdFieldWithLabel(deal, aliases);
  const take = (path: string, aliases: readonly string[]): string => {
    const hit = read(aliases);
    const text = textOf(hit?.value);
    if (hit && text) sources[path] = `RD: ${hit.label}`;
    return text;
  };

  // Cadastro do lead (formulário de Novo Lead): uma linha por empresa/pessoa do RD
  const demaisRazoes = fieldByPrefix(deal, RD_LABEL_PREFIXES.demaisRazoes);
  values.cadastro.empresas = rdEmpresasFromFields({
    razaoSocial: take("cadastro.empresas", RD_LABELS.razaoSocial),
    documento: take("cadastro.empresas", RD_LABELS.documento),
    demaisRazoes: textOf(demaisRazoes?.value),
    fallbackNome: opportunity.nome,
  });
  const principal = values.cadastro.empresas[0];
  const razao = principal?.razao_social ?? "";
  const documento = principal?.documento ?? "";
  // Notas para o cadastro do cliente quando o RD tem mais de um valor num campo de valor único.
  const cadastroNotes: string[] = [];
  const financeiroNotes: string[] = [];
  const noteMultiple = (notes: string[], aliases: readonly string[]) => {
    const hit = read(aliases);
    const raw = textOf(hit?.value);
    if (hit && raw) notes.push(`No RD, "${hit.label}" tem mais de um valor: ${raw}`);
  };
  values.cadastro.tipoLead = mapRdLeadType(take("cadastro.tipoLead", RD_LABELS.tipoLead));
  values.cadastro.tipoIndicacao = matchOption(take("cadastro.tipoIndicacao", RD_LABELS.tipoIndicacao), indicationTypes);
  values.cadastro.nomeIndicacao = take("cadastro.nomeIndicacao", RD_LABELS.nomeIndicacao);
  values.cadastro.plataforma = matchOption(take("cadastro.plataforma", RD_LABELS.plataforma), leadDigitalPlatforms);
  values.cadastro.decisor = take("cadastro.decisor", RD_LABELS.decisor);
  const areasHit = read(RD_LABELS.areasAnalise);
  values.cadastro.areasAnalise = mapAreas(listOf(areasHit?.value));
  if (areasHit && values.cadastro.areasAnalise.length > 0) sources["cadastro.areasAnalise"] = `RD: ${areasHit.label}`;
  const due = mapYesNo(take("cadastro.dueDiligence", RD_LABELS.haveraDue));
  values.cadastro.dueDiligence = due || (opportunity.haveraDueDiligence ? "Sim" : "Nao");
  values.cadastro.dataEntregaDue = parseRdDate(take("cadastro.dataEntregaDue", RD_LABELS.prazoDueData));
  values.cadastro.horarioEntregaDue = parseRdTime(take("cadastro.horarioEntregaDue", RD_LABELS.prazoDueHorario));
  values.cadastro.localReuniao = take("cadastro.localReuniao", RD_LABELS.localReuniao);
  values.cadastro.dataReuniao = parseRdDate(take("cadastro.dataReuniao", RD_LABELS.dataReuniao));
  values.cadastro.horarioReuniao = parseRdTime(take("cadastro.horarioReuniao", RD_LABELS.horarioReuniao));

  // Elaboração da proposta [CP] (`field_values`)
  const campos: Record<string, string | string[]> = {};
  const setCampo = (code: string, value: string | string[], aliases: readonly string[]) => {
    if (Array.isArray(value) ? value.length === 0 : !value) return;
    campos[code] = value;
    const hit = read(aliases);
    if (hit) sources[`campos.${code}`] = `RD: ${hit.label}`;
  };
  const option = (code: string, raw: string) => coerceToFieldOption(raw, input.fieldOptions?.[code]);

  const qualificacao = textOf(read(RD_LABELS.qualificacao)?.value);
  const enderecoCp = parseRdAddress(qualificacao);
  if (enderecoCp.multiple) cadastroNotes.push(`No RD, a qualificação tem mais de um endereço: ${qualificacao}`);
  setCampo("cp_cliente_cep", enderecoCp.cep, RD_LABELS.qualificacao);
  setCampo("cp_cliente_uf", enderecoCp.uf, RD_LABELS.qualificacao);
  setCampo("cp_areas_objeto", mapAreas(listOf(read(RD_LABELS.areasObjeto)?.value)), RD_LABELS.areasObjeto);
  for (const [code, aliases] of [
    ["cp_gestor_contrato", RD_LABELS.gestor],
    ["cp_captador", RD_LABELS.captador],
  ] as const) {
    const name = textOf(read(aliases)?.value);
    const user = name ? matchAppUserByName(name, users) : null;
    if (user) setCampo(code, user.id, aliases);
  }
  setCampo("cp_prazo_entrega", parseRdDate(textOf(read(RD_LABELS.prazoEntrega)?.value)), RD_LABELS.prazoEntrega);
  setCampo(
    "cp_primeiro_vencimento",
    parseRdDate(textOf(read(RD_LABELS.primeiroVencimento)?.value)),
    RD_LABELS.primeiroVencimento,
  );
  const realizou = mapYesNo(textOf(read(RD_LABELS.realizouDue)?.value));
  setCampo("cp_realizou_due", option("cp_realizou_due", realizou === "Nao" ? "Não" : realizou), RD_LABELS.realizouDue);
  // Ponto focal é uma pessoa: com dois nomes/e-mails/telefones no RD o campo fica para o responsável.
  setCampo("cp_nome_focal", singleRdName(textOf(read(RD_LABELS.nomeFocal)?.value)), RD_LABELS.nomeFocal);
  setCampo("cp_email_focal", singleRdEmail(textOf(read(RD_LABELS.emailFocal)?.value)), RD_LABELS.emailFocal);
  setCampo("cp_tel_focal", singleRdPhone(textOf(read(RD_LABELS.telFocal)?.value)), RD_LABELS.telFocal);
  setCampo("cp_tributacao", option("cp_tributacao", textOf(read(RD_LABELS.tributacao)?.value)), RD_LABELS.tributacao);
  setCampo("cp_info_adicionais", textOf(read(RD_LABELS.infoAdicionais)?.value), RD_LABELS.infoAdicionais);
  values.campos = campos;

  // Evidências das etapas já passadas
  values.evidencias.linkProposta = take("evidencias.linkProposta", RD_LABELS.linkProposta) || (opportunity.linkProposta ?? "").trim();
  values.evidencias.linkContrato = take("evidencias.linkContrato", RD_LABELS.linkContrato) || (opportunity.linkContrato ?? "").trim();
  values.evidencias.d4signDocumentUuid = (opportunity.d4signDocumentUuid ?? "").trim();
  const assinatura = parseRdDate(take("evidencias.dataAssinatura", RD_LABELS.dataAssinatura));
  if (assinatura) {
    values.evidencias.dataAssinatura = assinatura;
  } else if (deal.win === true && deal.closedAt && parseRdDate(deal.closedAt)) {
    values.evidencias.dataAssinatura = parseRdDate(deal.closedAt);
    sources["evidencias.dataAssinatura"] = "RD: data em que a venda foi marcada";
  }

  // Pós-venda: cadastro do cliente [CADASTRO] e faturamento [FINANCEIRO]
  const ob = values.onboarding;
  // Cliente principal: um só. Com mais de um no RD (ou no cadastro do lead), fica para o responsável escolher.
  const cadRazaoRaw = take("onboarding.cadastro.razaoSocial", RD_LABELS.cadRazaoSocial);
  const cadDocRaw = take("onboarding.cadastro.documento", RD_LABELS.cadDocumento);
  const cadMultiple = rdHasMultipleValues(cadDocRaw) || rdHasMultipleValues(cadRazaoRaw);
  const leadMultiple = values.cadastro.empresas.length > 1;
  if (cadMultiple) {
    noteMultiple(cadastroNotes, RD_LABELS.cadDocumento);
    if (rdHasMultipleValues(cadRazaoRaw)) noteMultiple(cadastroNotes, RD_LABELS.cadRazaoSocial);
  } else if (cadDocRaw || cadRazaoRaw) {
    ob.cadastro.razaoSocial = cadRazaoRaw || (leadMultiple ? "" : razao);
    ob.cadastro.documento = singleRdDocument(cadDocRaw) || (leadMultiple ? "" : documento);
  } else if (!leadMultiple) {
    ob.cadastro.razaoSocial = razao;
    ob.cadastro.documento = documento;
  }
  if (!cadMultiple && leadMultiple && !cadDocRaw) {
    cadastroNotes.push(
      `O lead tem mais de uma empresa/pessoa: ${values.cadastro.empresas.map((e) => `${e.razao_social} (${e.documento || "sem documento"})`).join("; ")}. Escolha o cliente principal.`,
    );
  }
  const enderecoCadRaw = take("onboarding.cadastro.endereco", RD_LABELS.cadEndereco) || qualificacao;
  const enderecoCad = parseRdAddress(enderecoCadRaw);
  ob.cadastro.endereco.cep = enderecoCad.cep;
  ob.cadastro.endereco.uf = enderecoCad.uf;
  if (enderecoCad.multiple && enderecoCadRaw !== qualificacao) {
    cadastroNotes.push(`No RD, o endereço tem mais de um valor: ${enderecoCadRaw}`);
  }
  const extras: string[] = [];
  const cadInfo = take("onboarding.cadastro.informacoesAdicionais", RD_LABELS.cadInfo);
  if (cadInfo) extras.push(cadInfo);
  const socios = fieldByPrefix(deal, RD_LABEL_PREFIXES.cadSocios);
  if (socios && textOf(socios.value)) extras.push(`Sócios (RD): ${textOf(socios.value)}`);
  const consulta = fieldByPrefix(deal, RD_LABEL_PREFIXES.cadConsulta);
  if (consulta && textOf(consulta.value)) extras.push(`Consulta automatizada (RD): ${textOf(consulta.value)}`);
  extras.push(...cadastroNotes);
  ob.cadastro.informacoesAdicionais = extras.join("\n");
  if (extras.length > 0) sources["onboarding.cadastro.informacoesAdicionais"] = "RD: [CADASTRO]";

  const finRazaoRaw = take("onboarding.financeiro.faturamento.razaoSocial", RD_LABELS.finRazao);
  const finDocRaw = take("onboarding.financeiro.faturamento.documento", RD_LABELS.finDocumento);
  if (rdHasMultipleValues(finDocRaw) || rdHasMultipleValues(finRazaoRaw)) {
    if (rdHasMultipleValues(finRazaoRaw)) noteMultiple(financeiroNotes, RD_LABELS.finRazao);
    if (rdHasMultipleValues(finDocRaw)) noteMultiple(financeiroNotes, RD_LABELS.finDocumento);
  } else {
    ob.financeiro.faturamento.razaoSocial = finRazaoRaw;
    ob.financeiro.faturamento.documento = singleRdDocument(finDocRaw);
  }
  ob.financeiro.inicioVigencia = parseRdDate(take("onboarding.financeiro.inicioVigencia", RD_LABELS.finInicioVigencia));
  const primeiroFat = take("onboarding.financeiro.primeiroFaturamento", RD_LABELS.finPrimeiroFaturamento);
  const primeiroFatData = parseRdDate(primeiroFat);
  if (primeiroFatData) {
    ob.financeiro.primeiroFaturamento = primeiroFatData;
  } else if (primeiroFat) {
    ob.financeiro.primeiroFaturamentoCondicionado = true;
    ob.financeiro.condicaoPrimeiroFaturamento = primeiroFat;
  }
  // Contato financeiro é uma pessoa: dois nomes, e-mails ou telefones no RD ficam na observação.
  const contato = {
    nome: take("onboarding.financeiro.contatoFinanceiro.nome", RD_LABELS.finResponsavel),
    email: take("onboarding.financeiro.contatoFinanceiro.email", RD_LABELS.finEmail),
    telefone: take("onboarding.financeiro.contatoFinanceiro.telefone", RD_LABELS.finTelefone),
  };
  const posicao = fieldByPrefix(deal, RD_LABEL_PREFIXES.finPosicao);
  const contatoMultiple =
    rdHasMultipleValues(contato.nome) || extractEmails(contato.email).length > 1 || extractPhones(contato.telefone).length > 1;
  if (contatoMultiple) {
    if (contato.nome) noteMultiple(financeiroNotes, RD_LABELS.finResponsavel);
    if (contato.email) noteMultiple(financeiroNotes, RD_LABELS.finEmail);
    if (contato.telefone) noteMultiple(financeiroNotes, RD_LABELS.finTelefone);
  } else {
    ob.financeiro.contatoFinanceiro.nome = contato.nome;
    ob.financeiro.contatoFinanceiro.posicao = textOf(posicao?.value);
    ob.financeiro.contatoFinanceiro.email = singleRdEmail(contato.email);
    ob.financeiro.contatoFinanceiro.telefone = singleRdPhone(contato.telefone);
  }
  ob.financeiro.repassePercentual = parseRdPercent(take("onboarding.financeiro.repassePercentual", RD_LABELS.finRepasse));
  const rateio = rdRateioPorArea(deal);
  ob.financeiro.rateioPorArea = rateio.rows;
  if (rateio.origin === "cc") sources["onboarding.financeiro.rateioPorArea"] = "RD: RATEIO - PORCENTAGEM % [CC]";
  if (rateio.origin === "financeiro") {
    sources["onboarding.financeiro.rateioPorArea"] = "RD: RATEIO - VALOR R$ [FINANCEIRO], convertido em %";
  }
  ob.financeiro.reajuste.indice = mapRdReajusteIndex(take("onboarding.financeiro.reajuste.indice", RD_LABELS.finIndice));
  ob.financeiro.reajuste.periodicidadeMeses = mapRdPeriodicidade(
    take("onboarding.financeiro.reajuste.periodicidadeMeses", RD_LABELS.finPeriodicidade),
  );
  ob.financeiro.observacoes = [take("onboarding.financeiro.observacoes", RD_LABELS.finObservacoes), ...financeiroNotes]
    .filter(Boolean)
    .join("\n");
  // Campo deixado vazio por ter mais de um valor no RD não leva o selo "Do RD".
  const clearedPrefixes = [
    ...(cadMultiple || (leadMultiple && !cadDocRaw) ? ["onboarding.cadastro.razaoSocial", "onboarding.cadastro.documento"] : []),
    ...(enderecoCad.multiple ? ["onboarding.cadastro.endereco"] : []),
    ...(!ob.financeiro.faturamento.razaoSocial && !ob.financeiro.faturamento.documento ? ["onboarding.financeiro.faturamento"] : []),
    ...(contatoMultiple ? ["onboarding.financeiro.contatoFinanceiro"] : []),
  ];
  for (const path of Object.keys(sources)) {
    if (clearedPrefixes.some((prefix) => path.startsWith(prefix))) delete sources[path];
  }
  if (financeiroNotes.length > 0) sources["onboarding.financeiro.observacoes"] = "RD: mais de um valor";

  // O formulário do cadastro mostra a origem como selo curto ("Do RD"); o rótulo exato fica em `sources`.
  ob.sources = Object.fromEntries(
    Object.keys(sources)
      .filter((path) => path.startsWith("onboarding."))
      // O formulário marca a origem por grupo de dois níveis ("financeiro.faturamento").
      .map((path) => [path.slice("onboarding.".length).split(".").slice(0, 2).join("."), "rd"]),
  );

  values.sources = sources;
  return values;
}

/** STATUS [CADASTRO] / STATUS [FINANCEIRO] do RD indicam etapa concluída no processo antigo. */
export function isRdStatusConcluded(raw: string): boolean {
  const n = normalizeRdLabel(raw);
  return n.startsWith("conclu") || n === "ok" || n.startsWith("cadastrad") || n.startsWith("finaliz");
}
