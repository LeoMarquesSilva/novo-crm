import type { FirmParty } from "./types";
import { getFirmSigners } from "@/lib/d4sign/firm-signers";

/**
 * Dados institucionais já usados no renderer legado.
 * Centralizados aqui para não repetir CNPJ/endereço em templates.
 */
export const DEFAULT_FIRM_PARTY: FirmParty = {
  razaoSocial: "BISMARCHI | PIRES – SOCIEDADE DE ADVOGADOS",
  cnpj: "26.080.152/0001-35",
  endereco: "Rua Coronel Quirino, n° 1.266, bairro Cambuí",
  cidade: "Campinas",
  uf: "SP",
  cep: "13025-002",
  telefone: "(19) 3254-6446",
  email: "contato@bismarchipires.com.br",
  bank: {
    banco: "Santander",
    agencia: "4192",
    conta: "13002200-8",
    titular: "Bismarchi e Pires – Sociedade de Advogados",
    cnpj: "26.080.152/0001-35",
    pix: "19 9 8100 4389",
  },
  representatives: getFirmSigners().map((s) => ({
    name: s.name,
    oab: s.oab,
    email: s.email,
  })),
};

export function getContractedFirm(): FirmParty {
  return {
    ...DEFAULT_FIRM_PARTY,
    representatives: getFirmSigners().map((s) => ({
      name: s.name,
      oab: s.oab,
      email: s.email,
    })),
  };
}
