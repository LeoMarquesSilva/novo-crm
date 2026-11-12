import { parseBrasilApi, parseOpenCnpj } from "@/modules/icp/domain/cnpj";

/** Dados da Receita que o Novo Lead usa ao digitar um CNPJ (04/11/2026). */
export type CnpjLookupResult =
  | {
      status: "found";
      cnpj: string;
      razaoSocial: string;
      nomeFantasia: string | null;
      /** Situação cadastral na Receita (ATIVA, BAIXADA, INAPTA…). */
      situacao: string | null;
      municipio: string | null;
      uf: string | null;
      fonte: "fichario" | "brasilapi" | "opencnpj";
    }
  | { status: "not_found"; cnpj: string }
  | { status: "error"; cnpj: string; message: string };

const FICHARIO_URL = "https://cnpj.genesisinnovation.io/api/v1/cnpj/";
const BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/";
const OPENCNPJ_URL = "https://api.opencnpj.org/";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Cache em memória do processo: o grátis do Fichário é 60/min e 3.000/dia por IP. */
const cache = new Map<string, { result: CnpjLookupResult; at: number }>();

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Fichário (dados abertos da Receita, https://cnpj.genesisinnovation.io/api). */
function parseFichario(cnpj: string, body: Record<string, unknown>): CnpjLookupResult | null {
  const razaoSocial = str(body.razao_social);
  if (!razaoSocial) return null;
  const endereco = (body.endereco && typeof body.endereco === "object" ? body.endereco : {}) as Record<string, unknown>;
  return {
    status: "found",
    cnpj,
    razaoSocial,
    nomeFantasia: str(body.nome_fantasia),
    situacao: str(body.situacao),
    municipio: str(endereco.municipio),
    uf: str(endereco.uf),
    fonte: "fichario",
  };
}

/**
 * A BrasilAPI recusa pedido sem User-Agent (403/429; o `fetch` do servidor não manda um), o que deixava a
 * consulta sempre em "Não deu para consultar a Receita" quando o Fichário caía (11/11/2026).
 */
const USER_AGENT = "CRM-Juridico/1.0 (consulta de CNPJ no cadastro de lead)";

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

type ProviderOutcome =
  | { kind: "found"; result: Extract<CnpjLookupResult, { status: "found" }> }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

type Provider = {
  name: string;
  request: (cnpj: string) => Promise<Response>;
  parse: (cnpj: string, body: Record<string, unknown>) => Extract<CnpjLookupResult, { status: "found" }> | null;
};

function fromIcpRecord(
  cnpj: string,
  record: { razao_social: string | null; nome_fantasia: string | null; situacao_cadastral: string | null; municipio: string | null; uf: string | null },
  fonte: "brasilapi" | "opencnpj",
): Extract<CnpjLookupResult, { status: "found" }> | null {
  if (!record.razao_social) return null;
  return {
    status: "found",
    cnpj,
    razaoSocial: record.razao_social,
    nomeFantasia: record.nome_fantasia,
    situacao: record.situacao_cadastral,
    municipio: record.municipio,
    uf: record.uf,
    fonte,
  };
}

function providers(): Provider[] {
  const key = process.env.FICHARIO_API_KEY?.trim();
  return [
    {
      name: "Fichário",
      request: (cnpj) => fetchJson(`${FICHARIO_URL}${cnpj}`, key ? { Authorization: `Bearer ${key}` } : {}),
      parse: (cnpj, body) => parseFichario(cnpj, body) as Extract<CnpjLookupResult, { status: "found" }> | null,
    },
    {
      name: "BrasilAPI",
      request: (cnpj) => fetchJson(`${BRASILAPI_URL}${cnpj}`),
      parse: (cnpj, body) => fromIcpRecord(cnpj, parseBrasilApi(cnpj, body), "brasilapi"),
    },
    {
      name: "OpenCNPJ",
      request: (cnpj) => fetchJson(`${OPENCNPJ_URL}${cnpj}`),
      parse: (cnpj, body) => fromIcpRecord(cnpj, parseOpenCnpj(cnpj, body), "opencnpj"),
    },
  ];
}

async function askProvider(provider: Provider, cnpj: string): Promise<ProviderOutcome> {
  try {
    const res = await provider.request(cnpj);
    if (res.status === 404) return { kind: "not_found" };
    if (!res.ok) return { kind: "error", message: `${provider.name} ${res.status}` };
    const parsed = provider.parse(cnpj, (await res.json()) as Record<string, unknown>);
    return parsed ? { kind: "found", result: parsed } : { kind: "error", message: `${provider.name} sem razão social` };
  } catch (error) {
    return { kind: "error", message: `${provider.name}: ${error instanceof Error ? error.message : "falha de rede"}` };
  }
}

/**
 * Razão social de um CNPJ (14 dígitos já validados). Fichário (chave opcional `FICHARIO_API_KEY`),
 * BrasilAPI e OpenCNPJ são consultados ao mesmo tempo e vale o primeiro que achar: antes era um depois do
 * outro, e o Fichário fora do ar fazia cada consulta esperar 8 s antes de tentar a BrasilAPI.
 * "Não encontrado" só quando ninguém achou e algum respondeu 404; senão, `error`.
 */
export async function lookupCnpj(
  cnpj: string,
  now = Date.now(),
  sources: Provider[] = providers(),
): Promise<CnpjLookupResult> {
  const cached = cache.get(cnpj);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.result;

  const outcomes: ProviderOutcome[] = [];
  const found = await new Promise<Extract<CnpjLookupResult, { status: "found" }> | null>((resolve) => {
    let pending = sources.length;
    if (pending === 0) resolve(null);
    for (const source of sources) {
      void askProvider(source, cnpj).then((outcome) => {
        outcomes.push(outcome);
        if (outcome.kind === "found") resolve(outcome.result);
        pending -= 1;
        // Duas fontes da Receita dizendo 404 já bastam: não espera a terceira estourar o tempo.
        const naoAchou = outcomes.filter((item) => item.kind === "not_found").length;
        if (pending === 0 || (sources.length > 2 && naoAchou >= 2)) resolve(null);
      });
    }
  });

  if (found) {
    cache.set(cnpj, { result: found, at: now });
    return found;
  }
  if (outcomes.some((outcome) => outcome.kind === "not_found")) {
    const result: CnpjLookupResult = { status: "not_found", cnpj };
    cache.set(cnpj, { result, at: now });
    return result;
  }
  const errors = outcomes.flatMap((outcome) => (outcome.kind === "error" ? [outcome.message] : []));
  return { status: "error", cnpj, message: errors.join("; ") || "falha na consulta" };
}

export type { Provider as CnpjLookupProvider };
