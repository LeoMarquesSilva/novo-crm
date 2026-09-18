import { maskCnpj, maskCpf } from "@/lib/crm/br-document-mask";
import { digitsOnly, isCnpj, isCpf } from "@/lib/crm/normalize-document";

export type CarteiraGrupoMembroKind = "empresa" | "pessoa";

export type CarteiraGrupoMembro = {
  id: string;
  nome: string;
  documento: string;
  email: string | null;
  telefone: string | null;
  kind: CarteiraGrupoMembroKind;
};

export function classifyCarteiraGrupoMembro(input: {
  tipo?: string | null;
  documento?: string | null;
  orqestraiCompanyId?: string | null;
  orqestraiPersonId?: string | null;
}): CarteiraGrupoMembroKind {
  const digits = digitsOnly(input.documento);
  if (isCpf(digits)) return "pessoa";
  if (isCnpj(digits)) return "empresa";
  if (input.orqestraiPersonId) return "pessoa";
  if (input.orqestraiCompanyId) return "empresa";
  const tipo = (input.tipo ?? "").toLocaleUpperCase("pt-BR");
  if (tipo.includes("FIS")) return "pessoa";
  if (tipo.includes("JUR")) return "empresa";
  return "pessoa";
}

export function formatCarteiraDocumento(documento: string | null | undefined): string {
  const raw = (documento ?? "").trim();
  const digits = digitsOnly(raw);
  if (isCnpj(digits)) return maskCnpj(digits);
  if (isCpf(digits)) return maskCpf(digits);
  return raw || "—";
}

export function splitCarteiraGrupoMembros(membros: readonly CarteiraGrupoMembro[]): {
  empresas: CarteiraGrupoMembro[];
  pessoas: CarteiraGrupoMembro[];
} {
  const byName = (left: CarteiraGrupoMembro, right: CarteiraGrupoMembro) =>
    left.nome.localeCompare(right.nome, "pt-BR", { sensitivity: "base", numeric: true });
  return {
    empresas: membros
      .filter((membro) => classifyCarteiraGrupoMembro(membro) === "empresa")
      .sort(byName),
    pessoas: membros
      .filter((membro) => classifyCarteiraGrupoMembro(membro) === "pessoa")
      .sort(byName),
  };
}
