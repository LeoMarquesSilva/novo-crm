import { cnpjRoot, digitsOnly, isCnpjMatriz, normalizeGroupKey } from "@/lib/crm/normalize-document";
import { isOwnLawFirmRoot } from "./constants";
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

const OFFICE_NAME = /bismarchi|\bsociedade de advogados\b/i;

function isOwnLawFirm(party: { razaoSocial: string; documento: string }): boolean {
  return isOwnLawFirmRoot(cnpjRoot(party.documento)) || OFFICE_NAME.test(party.razaoSocial);
}

function partyDigits(party: { documento: string }): string {
  return digitsOnly(party.documento);
}

function selectPrincipal(input: {
  contratanteDocs: string[];
  matchedClientes: MatchableCliente[];
}): MatchableCliente | null {
  const { contratanteDocs, matchedClientes } = input;
  if (!matchedClientes.length) return null;

  const primaryRoot = contratanteDocs.map(cnpjRoot).find(Boolean)
    ?? cnpjRoot(matchedClientes[0]?.documento);
  const sameRoot = primaryRoot
    ? matchedClientes.filter((cliente) => cnpjRoot(cliente.documento) === primaryRoot)
    : matchedClientes;
  const pool = sameRoot.length ? sameRoot : matchedClientes;
  const exact = contratanteDocs
    .map((doc) => pool.find((cliente) => digitsOnly(cliente.documento) === doc))
    .find(Boolean);

  return pool.find((cliente) => isCnpjMatriz(cliente.documento)) ?? exact ?? pool[0] ?? null;
}

export function matchExtractionToCarteira(input: {
  extraction: ContractImportExtraction;
  clientes: MatchableCliente[];
  grupos: MatchableGrupo[];
}): ContractImportMatch {
  const matchingParties = input.extraction.parties.filter((party) => !isOwnLawFirm(party));
  const contratantes = matchingParties.filter((party) => party.role === "contratante");
  const sourceParties = contratantes.length ? contratantes : matchingParties;
  const documents = [...new Set(sourceParties.map(partyDigits).filter(Boolean))];

  const clientesByDoc = new Map(
    input.clientes.map((cliente) => [digitsOnly(cliente.documento), cliente]),
  );
  const clientesByRoot = new Map<string, MatchableCliente[]>();
  for (const cliente of input.clientes) {
    const root = cnpjRoot(cliente.documento);
    if (!root) continue;
    const list = clientesByRoot.get(root) ?? [];
    list.push(cliente);
    clientesByRoot.set(root, list);
  }

  const matchedById = new Map<string, MatchableCliente>();
  for (const doc of documents) {
    const exact = clientesByDoc.get(doc);
    if (exact) matchedById.set(exact.id, exact);
    const root = cnpjRoot(doc);
    for (const cliente of clientesByRoot.get(root) ?? []) {
      matchedById.set(cliente.id, cliente);
    }
  }
  const matchedClientes = [...matchedById.values()];
  const principal = selectPrincipal({ contratanteDocs: documents, matchedClientes });
  const grupoFromClients = principal?.grupoId
    ?? matchedClientes.find((cliente) => cliente.grupoId)?.grupoId
    ?? null;

  const groupKey = normalizeGroupKey(input.extraction.groupName);
  const grupoByName = groupKey
    ? input.grupos.find((grupo) => normalizeGroupKey(grupo.nome) === groupKey || grupo.chaveEstavel === groupKey)
    : undefined;

  return {
    grupoId: grupoFromClients ?? grupoByName?.id ?? null,
    clienteId: principal?.id ?? null,
    matchedDocuments: documents,
  };
}

export function importedContractTitle(input: {
  extraction: ContractImportExtraction;
  match: ContractImportMatch;
  grupos: MatchableGrupo[];
  filename?: string;
}): string {
  const grupoNome = input.grupos.find((grupo) => grupo.id === input.match.grupoId)?.nome?.trim();
  const contratante = input.extraction.parties.find((party) => party.role === "contratante" && !isOwnLawFirm(party));
  return grupoNome
    || contratante?.razaoSocial?.trim()
    || input.extraction.groupName?.trim()
    || input.filename
    || "Contrato importado";
}
