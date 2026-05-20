import type { OpportunityStage } from "@/modules/crm/domain/entities";

export type DwellTrafficStatus = "ok" | "warning" | "critical" | "unknown";

/** Dias corridos na etapa: 0..okMax = verde; okMax+1..warnMax = amarelo; > warnMax = vermelho. */
export interface StageDwellBands {
  okMax: number;
  warnMax: number;
}

/**
 * Padrão global (ajuste por etapa em BY_STAGE quando o fluxo exigir outra cadência).
 * Ex.: verde ≤3, amarelo 4–7, vermelho ≥8.
 */
const DEFAULT_BANDS: StageDwellBands = { okMax: 3, warnMax: 7 };

const BY_STAGE: Partial<Record<OpportunityStage, StageDwellBands>> = {
  levantamento_dados: { okMax: 5, warnMax: 12 },
  compilacao: { okMax: 4, warnMax: 10 },
  revisao: { okMax: 4, warnMax: 10 },
  due_diligence_finalizada: { okMax: 5, warnMax: 12 },
  reuniao: { okMax: 3, warnMax: 8 },
  confeccao_proposta: { okMax: 4, warnMax: 10 },
  proposta_enviada: { okMax: 5, warnMax: 14 },
  confeccao_contrato: { okMax: 4, warnMax: 10 },
  contrato_elaborado: { okMax: 4, warnMax: 10 },
  contrato_enviado: { okMax: 5, warnMax: 12 },
  contrato_assinado: { okMax: 21, warnMax: 60 },
  aguardando_cadastro: { okMax: 5, warnMax: 12 },
  cadastro_novo_cliente: { okMax: 7, warnMax: 14 },
  inclusao_faturamento: { okMax: 5, warnMax: 12 },
  boas_vindas: { okMax: 5, warnMax: 10 },
  reuniao_kickoff: { okMax: 5, warnMax: 10 },
};

export function getStageDwellBands(etapa: OpportunityStage): StageDwellBands {
  return BY_STAGE[etapa] ?? DEFAULT_BANDS;
}

export function getDwellTrafficStatus(
  dias: number | null | undefined,
  etapa: OpportunityStage,
): DwellTrafficStatus {
  if (dias === null || dias === undefined) return "unknown";
  const { okMax, warnMax } = getStageDwellBands(etapa);
  if (dias <= okMax) return "ok";
  if (dias <= warnMax) return "warning";
  return "critical";
}

export function formatSlaTooltipLines(etapa: OpportunityStage): string {
  const { okMax, warnMax } = getStageDwellBands(etapa);
  return [
    `Verde: até ${okMax} dia(s) nesta etapa.`,
    `Amarelo: ${okMax + 1} a ${warnMax} dia(s) (esgotando o tempo).`,
    `Vermelho: acima de ${warnMax} dia(s) (muito tempo parado).`,
  ].join("\n");
}
