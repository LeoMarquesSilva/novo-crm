import type { Database } from "@/lib/supabase/database.types";

export type ClienteCadastroRow = Pick<
  Database["public"]["Tables"]["clientes"]["Row"],
  | "id"
  | "razao_social"
  | "documento"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro"
  | "cidade"
  | "uf"
  | "cep"
  | "email_principal"
  | "telefone_principal"
>;

export const CLIENTE_CADASTRO_CP_FIELD_CODES = [
  "cp_cliente_cep",
  "cp_cliente_logradouro",
  "cp_cliente_numero",
  "cp_cliente_complemento",
  "cp_cliente_bairro",
  "cp_cliente_cidade",
  "cp_cliente_uf",
] as const;

export function clienteCadastroToCpFields(
  cliente: ClienteCadastroRow,
): Record<(typeof CLIENTE_CADASTRO_CP_FIELD_CODES)[number], string> {
  return {
    cp_cliente_cep: (cliente.cep ?? "").replace(/\D/g, "").slice(0, 8),
    cp_cliente_logradouro: (cliente.logradouro ?? "").trim(),
    cp_cliente_numero: (cliente.numero ?? "").trim(),
    cp_cliente_complemento: (cliente.complemento ?? "").trim(),
    cp_cliente_bairro: (cliente.bairro ?? "").trim(),
    cp_cliente_cidade: (cliente.cidade ?? "").trim(),
    cp_cliente_uf: (cliente.uf ?? "").trim().toUpperCase().slice(0, 2),
  };
}

export function isClienteEnderecoCpEmpty(fieldByCode: Record<string, string>): boolean {
  const keys = CLIENTE_CADASTRO_CP_FIELD_CODES;
  return !keys.some((code) => String(fieldByCode[code] ?? "").trim());
}

export function formatClienteEnderecoResumo(cliente: ClienteCadastroRow): string {
  const parts: string[] = [];
  const line1 = [cliente.logradouro, cliente.numero].filter(Boolean).join(", ");
  if (line1) parts.push(line1);
  if (cliente.bairro?.trim()) parts.push(cliente.bairro.trim());
  const city = [cliente.cidade, cliente.uf].filter(Boolean).join("/");
  if (city) parts.push(city);
  if (cliente.cep?.trim()) parts.push(`CEP ${cliente.cep.trim()}`);
  return parts.join(" · ") || "Endereço não cadastrado na carteira.";
}
