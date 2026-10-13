/**
 * Cadastro de CNPJ da Receita Federal para o ICP. A consulta usa a OpenCNPJ e, se ela
 * falhar, a BrasilAPI (as duas servem os dados abertos da Receita, sem chave). Aqui
 * ficam só as funções puras; o fetch das APIs está em infrastructure/cnpj-provider.ts e
 * quem grava no banco é infrastructure/cnpj-sync.ts.
 */

export interface IcpCnpjRecord {
  cnpj: string;
  status: "ok" | "not_found" | "error";
  razao_social: string | null;
  nome_fantasia: string | null;
  situacao_cadastral: string | null;
  data_inicio_atividade: string | null;
  natureza_juridica: string | null;
  porte: string | null;
  capital_social: number | null;
  matriz: boolean | null;
  uf: string | null;
  municipio: string | null;
  cep: string | null;
  cnae_principal: string | null;
  cnae_descricao: string | null;
  cnaes_secundarios: { codigo: string; descricao: string }[];
  opcao_simples: boolean | null;
  socios: { nome: string; qualificacao: string | null; desde: string | null }[];
  source: string;
  error: string | null;
  fetched_at: string;
}

/**
 * Parte contrária (ou advogado contrário) sem cadastro também como cliente. Não entra
 * no ICP. Quem é as duas coisas ("Cliente inativo, Contrário ativo") segue como cliente.
 */
export function isCounterpartyOnly(categoria: string | null | undefined): boolean {
  const c = (categoria ?? "").toLowerCase();
  return /contr[áa]ri/.test(c) && !c.includes("cliente");
}

export function onlyCnpjDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const cnaeCode = (v: unknown) => {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits && digits !== "0" ? digits.padStart(7, "0") : null;
};

/** Converte a resposta da BrasilAPI (/api/cnpj/v1) no formato da tabela. */
export function parseBrasilApi(cnpj: string, body: Record<string, unknown>, now = new Date()): IcpCnpjRecord {
  const secundarios = Array.isArray(body.cnaes_secundarios) ? body.cnaes_secundarios : [];
  const qsa = Array.isArray(body.qsa) ? body.qsa : [];
  const capital = Number(body.capital_social);
  return {
    cnpj,
    status: "ok",
    razao_social: str(body.razao_social),
    nome_fantasia: str(body.nome_fantasia),
    situacao_cadastral: str(body.descricao_situacao_cadastral),
    data_inicio_atividade: str(body.data_inicio_atividade),
    natureza_juridica: str(body.natureza_juridica),
    porte: str(body.porte),
    capital_social: Number.isFinite(capital) ? capital : null,
    matriz: body.identificador_matriz_filial == null ? null : Number(body.identificador_matriz_filial) === 1,
    uf: str(body.uf)?.toUpperCase() ?? null,
    municipio: str(body.municipio),
    cep: str(body.cep),
    cnae_principal: cnaeCode(body.cnae_fiscal),
    cnae_descricao: str(body.cnae_fiscal_descricao),
    cnaes_secundarios: secundarios
      .map((c: { codigo?: unknown; descricao?: unknown }) => ({
        codigo: cnaeCode(c?.codigo) ?? "",
        descricao: str(c?.descricao) ?? "",
      }))
      .filter((c) => c.codigo),
    opcao_simples: typeof body.opcao_pelo_simples === "boolean" ? body.opcao_pelo_simples : null,
    socios: qsa
      .map((s: { nome_socio?: unknown; qualificacao_socio?: unknown; data_entrada_sociedade?: unknown }) => ({
        nome: str(s?.nome_socio) ?? "",
        qualificacao: str(s?.qualificacao_socio),
        desde: str(s?.data_entrada_sociedade),
      }))
      .filter((s) => s.nome),
    source: "brasilapi",
    error: null,
    fetched_at: now.toISOString(),
  };
}

/** Converte a resposta da OpenCNPJ (api.opencnpj.org) no formato da tabela. */
export function parseOpenCnpj(cnpj: string, body: Record<string, unknown>, now = new Date()): IcpCnpjRecord {
  const cnaes = Array.isArray(body.cnaes) ? (body.cnaes as { codigo?: unknown; descricao?: unknown; is_principal?: unknown }[]) : [];
  const principal = cnaes.find((c) => c?.is_principal === true);
  const qsa = Array.isArray(body.QSA) ? body.QSA : [];
  const capital = Number(String(body.capital_social ?? "").replace(/\./g, "").replace(",", "."));
  const simples = str(body.opcao_simples)?.toUpperCase();
  const matriz = str(body.matriz_filial);
  return {
    cnpj,
    status: "ok",
    razao_social: str(body.razao_social),
    nome_fantasia: str(body.nome_fantasia),
    situacao_cadastral: str(body.situacao_cadastral)?.toUpperCase() ?? null,
    data_inicio_atividade: str(body.data_inicio_atividade),
    natureza_juridica: str(body.natureza_juridica),
    porte: str(body.porte_empresa)?.toUpperCase() ?? null,
    capital_social: Number.isFinite(capital) && String(body.capital_social ?? "").trim() ? capital : null,
    matriz: matriz ? /matriz/i.test(matriz) : null,
    uf: str(body.uf)?.toUpperCase() ?? null,
    municipio: str(body.municipio),
    cep: str(body.cep),
    cnae_principal: cnaeCode(principal?.codigo ?? body.cnae_principal),
    cnae_descricao: str(principal?.descricao),
    cnaes_secundarios: cnaes
      .filter((c) => c?.is_principal !== true)
      .map((c) => ({ codigo: cnaeCode(c?.codigo) ?? "", descricao: str(c?.descricao) ?? "" }))
      .filter((c) => c.codigo),
    opcao_simples: simples === "S" ? true : simples === "N" ? false : null,
    socios: qsa
      .map((s: { nome_socio?: unknown; qualificacao_socio?: unknown; data_entrada_sociedade?: unknown }) => ({
        nome: str(s?.nome_socio) ?? "",
        qualificacao: str(s?.qualificacao_socio),
        desde: str(s?.data_entrada_sociedade),
      }))
      .filter((s) => s.nome),
    source: "opencnpj",
    error: null,
    fetched_at: now.toISOString(),
  };
}

export function failedRecord(cnpj: string, status: "not_found" | "error", error: string, now = new Date()): IcpCnpjRecord {
  return {
    cnpj,
    status,
    razao_social: null,
    nome_fantasia: null,
    situacao_cadastral: null,
    data_inicio_atividade: null,
    natureza_juridica: null,
    porte: null,
    capital_social: null,
    matriz: null,
    uf: null,
    municipio: null,
    cep: null,
    cnae_principal: null,
    cnae_descricao: null,
    cnaes_secundarios: [],
    opcao_simples: null,
    socios: [],
    source: "brasilapi",
    error,
    fetched_at: now.toISOString(),
  };
}

/**
 * Macrossetor pela divisão do CNAE (dois primeiros dígitos), com os rótulos de
 * segmento usados no ICP.
 */
export function cnaeSector(cnae: string | null | undefined): string | null {
  if (!cnae) return null;
  const code = cnae.replace(/\D/g, "");
  if (code.startsWith("6462") || code.startsWith("6463")) return "Holdings e participações";
  const div = Number.parseInt(code.slice(0, 2), 10);
  if (!Number.isFinite(div) || div <= 0) return null;
  if (div <= 3) return "Agronegócio";
  if (div <= 33) return "Indústria";
  if (div <= 39) return "Energia e saneamento";
  if (div <= 43) return "Construção e imobiliário";
  if (div <= 47) return "Comércio e distribuição";
  if (div <= 53) return "Logística e comex";
  if (div <= 56) return "Serviços ao consumidor";
  if (div <= 63) return "Serviços empresariais";
  if (div <= 66) return "Financeiro e crédito";
  if (div === 68) return "Construção e imobiliário";
  // Veterinária e agências de viagem atendem sobretudo pessoa física.
  if (div === 75 || div === 79) return "Serviços ao consumidor";
  if (div <= 82) return "Serviços empresariais";
  if (div === 84) return "Setor público";
  if (div === 85) return "Serviços ao consumidor";
  if (div <= 88) return "Saúde";
  return "Serviços ao consumidor";
}

/**
 * CNAEs genéricos, comuns na empresa de apoio ou de participações de um grupo:
 * consultoria em gestão, intermediação de negócios e apoio administrativo.
 */
const GENERIC_CNAES = new Set(["7020400", "7490104", "8211300", "8219999"]);

const isHolding = (r: IcpCnpjRecord) => cnaeSector(r.cnae_principal) === "Holdings e participações";
const isGeneric = (r: IcpCnpjRecord) => GENERIC_CNAES.has((r.cnae_principal ?? "").replace(/\D/g, ""));
const isActive = (r: IcpCnpjRecord) => /ativa/i.test(r.situacao_cadastral ?? "");

/**
 * Empresa de referência do grupo: ativa, operacional (não holding), com CNAE que diz
 * a atividade (não genérico), matriz e com o maior capital social, nessa ordem de
 * prioridade.
 */
export function pickReferenceCompany(records: IcpCnpjRecord[]): IcpCnpjRecord | null {
  const ok = records.filter((r) => r.status === "ok");
  if (ok.length === 0) return null;
  const score = (r: IcpCnpjRecord) => [
    isActive(r) ? 1 : 0,
    isHolding(r) ? 0 : 1,
    isGeneric(r) ? 0 : 1,
    r.matriz ? 1 : 0,
    r.capital_social ?? 0,
  ];
  return [...ok].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i];
    return a.cnpj.localeCompare(b.cnpj);
  })[0];
}
