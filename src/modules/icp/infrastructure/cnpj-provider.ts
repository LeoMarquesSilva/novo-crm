import {
  failedRecord,
  parseBrasilApi,
  parseOpenCnpj,
  type IcpCnpjRecord,
} from "@/modules/icp/domain/cnpj";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROVIDERS = [
  { name: "OpenCNPJ", url: (cnpj: string) => `https://api.opencnpj.org/${cnpj}`, parse: parseOpenCnpj },
  { name: "BrasilAPI", url: (cnpj: string) => `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, parse: parseBrasilApi },
];

/**
 * Consulta um CNPJ nos dados abertos da Receita: OpenCNPJ primeiro e BrasilAPI se ela
 * falhar. Repete com espera crescente em limite de taxa e erro do servidor.
 */
export async function fetchCnpj(cnpj: string, attempts = 3): Promise<IcpCnpjRecord> {
  const errors: string[] = [];
  let notFound = 0;
  for (const provider of PROVIDERS) {
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(provider.url(cnpj), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) return provider.parse(cnpj, (await res.json()) as Record<string, unknown>);
        if (res.status === 404 || res.status === 400) {
          notFound++;
          errors.push(`${provider.name} ${res.status}`);
          break;
        }
        errors.push(`${provider.name} ${res.status}`);
        // 403 é bloqueio do provedor: tentar de novo não adianta.
        if (res.status === 403) break;
      } catch (err) {
        errors.push(`${provider.name}: ${err instanceof Error ? err.message : "falha de rede"}`);
      }
      if (i < attempts - 1) await sleep(1_500 * 2 ** i);
    }
  }
  const message = [...new Set(errors)].join("; ");
  return failedRecord(cnpj, notFound > 0 ? "not_found" : "error", message);
}
