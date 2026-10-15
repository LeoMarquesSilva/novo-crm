/**
 * Exportação da lista de grupos da aba Clientes em CSV (separador ";" e BOM, para abrir
 * direto no Excel em pt-BR).
 */
import { sortedPlans } from "@/modules/icp/domain/plano-contas";
import type { IcpGroupRow } from "@/modules/icp/domain/compute";
import { employeeRangeText, entryAreaLabel, formatCnpj, groupName, noSectorLabel } from "./icp-format";

export const ICP_CLIENTS_CSV_HEADER = [
  "Faixa",
  "Grupo",
  "Segmento",
  "Atividade (CNAE)",
  "Colaboradores (LinkedIn)",
  "Pessoas no LinkedIn",
  "Página no LinkedIn",
  "Site",
  "Cidade",
  "UF",
  "Empresa de referência",
  "CNPJ",
  "Sócios administradores",
  "Entrada",
  "Áreas que faturaram",
  "Tipo de contrato (plano de contas)",
  "Pastas ativas",
  "Receita 12 meses",
  "Média mensal",
  "Em atraso",
] as const;

export function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Conteúdo do CSV (com BOM), uma linha por grupo, na ordem recebida. */
export function buildClientsCsv(rows: IcpGroupRow[]): string {
  const lines = rows.map((g) =>
    [
      g.tier,
      groupName(g.grupo),
      g.sectorBucket ?? noSectorLabel(g.clientType),
      g.sector,
      g.profile?.employeeRange ? employeeRangeText(g.profile.employeeRange) : null,
      g.profile?.linkedinMembers,
      g.profile?.linkedinUrl,
      g.profile?.website,
      g.city,
      g.uf,
      g.referenceCompany?.razaoSocial,
      g.referenceCompany ? formatCnpj(g.referenceCompany.cnpj) : null,
      g.decisionMakers.map((d) => d.nome).join(", "),
      g.entryArea ? entryAreaLabel(g.entryArea) : null,
      g.areas.join(", "),
      sortedPlans(g.revenueByPlan)
        .map(([plan]) => plan)
        .join(", "),
      g.activeFolders,
      Math.round(g.revenue12m),
      Math.round(g.monthly),
      Math.round(g.overdue),
    ]
      .map(csvCell)
      .join(";"),
  );
  return "﻿" + [ICP_CLIENTS_CSV_HEADER.join(";"), ...lines].join("\r\n");
}

export function clientsCsvFileName(now = new Date()): string {
  return `icp-clientes-${now.toISOString().slice(0, 10)}.csv`;
}

/** Baixa a lista filtrada em CSV. */
export function downloadClientsCsv(rows: IcpGroupRow[]): void {
  const blob = new Blob([buildClientsCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = clientsCsvFileName();
  link.click();
  URL.revokeObjectURL(url);
}
