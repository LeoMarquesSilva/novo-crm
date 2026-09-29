import { cnpjRoot, digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";
import type { ClienteCadastroRow } from "@/lib/crm/cliente-cadastro-cp-fields";

export type ClienteContratoResumo = {
  id: string;
  titulo: string;
  status: string;
  vigente_de: string | null;
};

export type ClienteLookupResult = {
  found: boolean;
  matchedBy: "documento" | "cnpj_raiz" | null;
  cliente: ClienteCadastroRow | null;
  contratos: ClienteContratoResumo[];
};

export function findClienteByDocumentDigits<
  T extends ClienteCadastroRow,
>(clientes: T[], documento: string): { cliente: T; matchedBy: "documento" | "cnpj_raiz" } | null {
  const digits = digitsOnly(documento);
  if (!isCpf(digits) && !isCnpj(digits)) return null;

  const exact = clientes.find((c) => digitsOnly(c.documento) === digits);
  if (exact) return { cliente: exact, matchedBy: "documento" };

  if (isCnpj(digits)) {
    const root = cnpjRoot(digits);
    const byRoot = clientes.find((c) => cnpjRoot(c.documento) === root);
    if (byRoot) return { cliente: byRoot, matchedBy: "cnpj_raiz" };
  }

  return null;
}

export function filterContratosParaAditivo<
  T extends ClienteContratoResumo,
>(contratos: T[]): T[] {
  return contratos.filter((c) => c.status !== "encerrado");
}

export function buildClienteLookupResult(params: {
  clientes: ClienteCadastroRow[];
  documento: string;
  contratosByClienteId: Map<string, ClienteContratoResumo[]>;
}): ClienteLookupResult {
  const match = findClienteByDocumentDigits(params.clientes, params.documento);
  if (!match) {
    return { found: false, matchedBy: null, cliente: null, contratos: [] };
  }

  const contratos = filterContratosParaAditivo(
    params.contratosByClienteId.get(match.cliente.id) ?? [],
  );

  return {
    found: true,
    matchedBy: match.matchedBy,
    cliente: match.cliente,
    contratos,
  };
}
