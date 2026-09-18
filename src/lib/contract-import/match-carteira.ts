import { digitsOnly, normalizeGroupKey } from "@/lib/crm/normalize-document";
import type { ContractImportExtraction } from "./schemas";

export type MatchableCliente = {
  id: string;
  razaoSocial: string;
  documento: string;
  grupoId: string | null;
};

export type MatchableGrupo = {
  id: string;
  nome: string;
  chaveEstavel: string;
};

export type ContractImportMatch = {
  grupoId: string | null;
  clienteId: string | null;
  matchedDocuments: string[];
};

export function matchExtractionToCarteira(input: {
  extraction: ContractImportExtraction;
  clientes: MatchableCliente[];
  grupos: MatchableGrupo[];
}): ContractImportMatch {
  const documents = input.extraction.parties
    .map((party) => digitsOnly(party.documento))
    .filter(Boolean);
  const clientesByDoc = new Map(
    input.clientes.map((cliente) => [digitsOnly(cliente.documento), cliente]),
  );
  const matchedClientes = documents
    .map((doc) => clientesByDoc.get(doc))
    .filter((cliente): cliente is MatchableCliente => Boolean(cliente));

  const groupKey = normalizeGroupKey(input.extraction.groupName);
  const grupoByName = groupKey
    ? input.grupos.find((grupo) => normalizeGroupKey(grupo.nome) === groupKey || grupo.chaveEstavel === groupKey)
    : undefined;
  const grupoFromClients = matchedClientes.find((cliente) => cliente.grupoId)?.grupoId ?? null;

  const principal = matchedClientes.find((cliente) => digitsOnly(cliente.documento).length === 14)
    ?? matchedClientes[0]
    ?? null;

  return {
    grupoId: grupoByName?.id ?? grupoFromClients,
    clienteId: principal?.id ?? null,
    matchedDocuments: documents,
  };
}
