/**
 * Folha de assinaturas do contrato (Word e prévia do editor). Desde 16/11/2026: uma assinatura embaixo da outra,
 * centralizadas, começando pelo escritório (Gustavo, depois Ricardo) e depois cada empresa contratante, sem os
 * rótulos "CONTRATANTE"/"CONTRATADA". Modelo: contrato assinado da Nigro Alumínio.
 */

export const ESCRITORIO_ASSINATURA = "Bismarchi | Pires – Sociedade de Advogados";

/** Sócios que assinam pelo escritório, na ordem da folha. */
export const SOCIOS_ASSINATURA = [
  { nome: "Gustavo Bismarchi Motta", oab: "OAB/SP 275.477" },
  { nome: "Ricardo Viscardi Pires", oab: "OAB/SP 353.389" },
] as const;

export type BlocoAssinatura = {
  /** Linha logo abaixo do traço (versalete, negrito): escritório ou nome da empresa. */
  titulo: string;
  /** Linhas seguintes: sócio e OAB, ou o documento da empresa. */
  linhas: string[];
};

/** "CNPJ/MF 43.948.561/0001-20"; sem documento, nada. */
export function documentoNaAssinatura(tipo: string, documento: string): string {
  const doc = documento.trim();
  if (!doc) return "";
  const t = (tipo || "").trim().toUpperCase() || (doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ");
  return `${t}/MF ${doc}`;
}

export function blocosDeAssinatura(
  contratantes: Array<{ nome: string; documento: string; documentoTipo: string }> | undefined,
): BlocoAssinatura[] {
  const escritorio = SOCIOS_ASSINATURA.map((s) => ({ titulo: ESCRITORIO_ASSINATURA, linhas: [s.nome, s.oab] }));
  const clientes = (contratantes ?? [])
    .filter((c) => c.nome.trim())
    .map((c) => ({
      titulo: c.nome.trim(),
      linhas: [documentoNaAssinatura(c.documentoTipo, c.documento)].filter(Boolean),
    }));
  return [...escritorio, ...(clientes.length ? clientes : [{ titulo: "…", linhas: [] }])];
}
