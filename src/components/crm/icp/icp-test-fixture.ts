/**
 * Dados de exemplo para os testes da tela do ICP, calculados pelo domínio real
 * (`computeIcp`) a partir de um conjunto pequeno de linhas do VIOS, Receita e ORQESTRAI.
 */
import { computeIcp, type IcpData, type IcpInput } from "@/modules/icp/domain/compute";
import type { IcpCnpjRecord } from "@/modules/icp/domain/cnpj";

export const ICP_FIXTURE_NOW = new Date("2026-10-01T12:00:00Z");

const pay = (grupo: string, departamento: string, valor: number, planoContas = "HONORÁRIOS MENSAIS", dataPagamento = "2026-03-10") => ({
  grupo,
  departamento,
  planoContas,
  valor,
  dataPagamento,
});

function company(overrides: Partial<IcpCnpjRecord> & Pick<IcpCnpjRecord, "cnpj">): IcpCnpjRecord {
  return {
    status: "ok",
    razao_social: null,
    nome_fantasia: null,
    situacao_cadastral: "ATIVA",
    data_inicio_atividade: null,
    natureza_juridica: null,
    porte: "DEMAIS",
    capital_social: 1_000_000,
    matriz: true,
    uf: "SP",
    municipio: "CAMPINAS",
    cep: null,
    cnae_principal: "2222600",
    cnae_descricao: "Fabricação de embalagens de material plástico",
    cnaes_secundarios: [],
    opcao_simples: false,
    socios: [],
    source: "teste",
    error: null,
    fetched_at: "2026-09-20T10:00:00Z",
    ...overrides,
  };
}

export function icpFixtureInput(): IcpInput {
  return {
    now: ICP_FIXTURE_NOW,
    revenue: [
      pay("Grupo Alfa", "Insolvência", 150_000),
      pay("Grupo Alfa", "Trabalhista", 60_000),
      pay("Grupo Alfa", "Cível", 40_000),
      pay("Grupo Beta", "Cível", 80_000, "HONORÁRIOS SPOT"),
      pay("Grupo Beta", "Tributário", 20_000, "HONORÁRIOS SPOT"),
      pay("Grupo Gama", "Trabalhista", 30_000, "HONORÁRIOS DE ÊXITO"),
      pay("Grupo Delta", "Recuperação de Crédito", 8_000),
    ],
    excludedPayers: { count: 2, revenue: 12_000 },
    processes: [
      { grupo: "Grupo Alfa", area: "Cível | Insolvência", dataCadastro: "2025-02-01" },
      { grupo: "Grupo Beta", area: "Cível", dataCadastro: "2023-05-01" },
      { grupo: "Grupo Gama", area: "Trabalhista", dataCadastro: "2024-01-15" },
    ],
    activeFolders: [
      { grupo: "Grupo Alfa", area: "Insolvência" },
      { grupo: "Grupo Alfa", area: "Insolvência" },
      { grupo: "Grupo Alfa", area: "Trabalhista" },
      { grupo: "Grupo Beta", area: "Cível" },
    ],
    pessoas: [
      { grupo: "Grupo Alfa", tipo: "PESSOA JURÍDICA", uf: "SP", cidade: "Campinas", categoria: "Cliente ativo" },
      { grupo: "Grupo Beta", tipo: "PESSOA JURÍDICA", uf: "SP", cidade: "São Paulo", categoria: "Cliente ativo" },
      { grupo: "Grupo Gama", tipo: "PESSOA FÍSICA", uf: "MG", cidade: "Belo Horizonte", categoria: "Cliente ativo" },
    ],
    overdue: [
      { grupo: "Grupo Alfa", departamento: "Insolvência", valor: 7_000 },
      { grupo: "Grupo Gama", departamento: "Trabalhista", valor: 20_000 },
    ],
    hours: [
      { grupo: "Grupo Alfa", area: "Insolvência", horas: 400 },
      { grupo: "Grupo Alfa", area: "Trabalhista", horas: 120 },
      { grupo: "Grupo Beta", area: "Cível", horas: 90 },
      // Hora interna (sem grupo): entra no custo por hora da área, não em cliente.
      { grupo: "", area: "Insolvência", horas: 50 },
    ],
    personnelCost: [
      { departamento: "Insolvência", valor: 60_000 },
      { departamento: "Trabalhista", valor: 12_000 },
      { departamento: "Cível", valor: 9_000 },
    ],
    companies: [
      {
        grupo: "Grupo Alfa",
        categoria: "Cliente ativo",
        record: company({
          cnpj: "12345678000190",
          razao_social: "ALFA EMBALAGENS S.A.",
          socios: [
            { nome: "MARIA DA SILVA", qualificacao: "Sócio-Administrador", desde: "2010-01-01" },
            { nome: "JOÃO SOUZA", qualificacao: "Sócio", desde: "2012-01-01" },
          ],
        }),
      },
    ],
    nps: [
      { cargo: "Sócio(a) / Proprietário(a)", recommend: 10 },
      { cargo: "Financeiro", recommend: 9 },
      { cargo: "Diretor", recommend: 6 },
    ],
    npsThemes: [
      { id: "relacionamento", polarity: "strength" },
      { id: "tecnica", polarity: "strength" },
      { id: "disponibilidade", polarity: "pain" },
    ],
    linkedin: [
      { reportType: "followers", dimension: "industry", label: "Serviços advocatícios", value: 60 },
      { reportType: "followers", dimension: "industry", label: "Fabricação de produtos de material plástico", value: 10 },
      { reportType: "followers", dimension: "seniority", label: "Diretor", value: 5 },
      { reportType: "followers", dimension: "seniority", label: "Sênior", value: 95 },
    ],
    ga4Cities: [
      { city: "Campinas", sessions: 1200 },
      { city: "São Paulo", sessions: 900 },
    ],
    whatsapp: [
      { leadSource: "meta_ads", pipelineStage: "lead_recebido" },
      { leadSource: "site_whatsapp", pipelineStage: "qualificado" },
    ],
    profiles: [
      {
        grupo: "Grupo Alfa",
        employeeRange: "51-200",
        employeeMin: 51,
        linkedinMembers: 57,
        linkedinUrl: "https://www.linkedin.com/company/alfa-embalagens",
        linkedinName: "Alfa Embalagens",
        website: "https://www.alfa.com.br",
        logoUrl: null,
        confidence: "alta",
      },
    ],
  };
}

export function icpFixtureData(): IcpData {
  return computeIcp(icpFixtureInput());
}
