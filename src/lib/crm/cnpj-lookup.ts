import { parseBrasilApi } from "@/modules/icp/domain/cnpj";

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
      fonte: "fichario" | "brasilapi";
    }
  | { status: "not_found"; cnpj: string }
  | { status: "error"; cnpj: string; message: string };

const FICHARIO_URL = "https://cnpj.genesisinnovation.io/api/v1/cnpj/";
const BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/";
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

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: { Accept: "application/json", ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Razão social de um CNPJ (14 dígitos já validados): Fichário primeiro (chave opcional
 * `FICHARIO_API_KEY` para o plano pago) e BrasilAPI se ele falhar ou estourar o limite.
 * "Não encontrado" só quando quem respondeu disse 404; falha de rede vira `error`.
 */
export async function lookupCnpj(cnpj: string, now = Date.now()): Promise<CnpjLookupResult> {
  const cached = cache.get(cnpj);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.result;

  const errors: string[] = [];
  let notFound = false;
  const key = process.env.FICHARIO_API_KEY?.trim();
  try {
    const res = await fetchJson(`${FICHARIO_URL}${cnpj}`, key ? { Authorization: `Bearer ${key}` } : {});
    if (res.ok) {
      const parsed = parseFichario(cnpj, (await res.json()) as Record<string, unknown>);
      if (parsed) {
        cache.set(cnpj, { result: parsed, at: now });
        return parsed;
      }
      errors.push("Fichário sem razão social");
    } else if (res.status === 404) {
      notFound = true;
    } else {
      errors.push(`Fichário ${res.status}`);
    }
  } catch (error) {
    errors.push(`Fichário: ${error instanceof Error ? error.message : "falha de rede"}`);
  }

  try {
    const res = await fetchJson(`${BRASILAPI_URL}${cnpj}`);
    if (res.ok) {
      const record = parseBrasilApi(cnpj, (await res.json()) as Record<string, unknown>);
      if (record.razao_social) {
        const result: CnpjLookupResult = {
          status: "found",
          cnpj,
          razaoSocial: record.razao_social,
          nomeFantasia: record.nome_fantasia,
          situacao: record.situacao_cadastral,
          municipio: record.municipio,
          uf: record.uf,
          fonte: "brasilapi",
        };
        cache.set(cnpj, { result, at: now });
        return result;
      }
    } else if (res.status === 404) {
      notFound = true;
    } else {
      errors.push(`BrasilAPI ${res.status}`);
    }
  } catch (error) {
    errors.push(`BrasilAPI: ${error instanceof Error ? error.message : "falha de rede"}`);
  }

  if (notFound) {
    const result: CnpjLookupResult = { status: "not_found", cnpj };
    cache.set(cnpj, { result, at: now });
    return result;
  }
  return { status: "error", cnpj, message: errors.join("; ") || "falha na consulta" };
}
