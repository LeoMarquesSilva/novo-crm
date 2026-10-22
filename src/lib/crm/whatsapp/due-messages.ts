/**
 * Valores das mensagens de WhatsApp da DUE e do escopo da proposta, e as regras de quando mandar.
 * Puro (sem banco): as funções de `due-area-tasks.ts` e `proposta-escopo-notify-channels.ts` leem os
 * dados, montam os valores aqui e renderizam o modelo em vigor (`template-store.ts`).
 */
import { isDueReviewApprovedForCycle } from "@/lib/crm/due-area-task-status";
import { formatDateTimeMinutesBr } from "@/lib/format-datetime";
import type { WhatsappTemplateValues } from "@/lib/crm/whatsapp/templates";

/** `2026-10-27T15:42:56Z` → `27/10/2026 às 12:42` (Brasília, sem segundos). */
export function formatPrazoWhatsapp(iso: string | null | undefined): string {
  if (!iso) return "";
  const text = formatDateTimeMinutesBr(iso);
  return text === "—" ? "" : text.replace(", ", " às ");
}

/** Link só quando o CRM tem endereço público (um caminho relativo não abre no WhatsApp). */
export function whatsappLink(link: string | null | undefined): string {
  return link && /^https?:\/\//.test(link) ? link : "";
}

function cicloLabel(cycle: number): string {
  return cycle > 1 ? `${cycle} (depois dos ajustes)` : String(cycle);
}

function joinList(items: string[]): string {
  return items.join(", ");
}

// ─── Levantamento concluído ───────────────────────────────────────────────────

export type LevantamentoEntrega = {
  area: string;
  semProcessosAtivos: boolean;
  /** Nomes das planilhas da área já anexadas. */
  planilhas: string[];
};

export function describeLevantamentoEntrega(entrega: LevantamentoEntrega): string {
  if (entrega.semProcessosAtivos) return "sem processos ativos";
  if (entrega.planilhas.length === 1) return "planilha anexada";
  if (entrega.planilhas.length > 1) return `${entrega.planilhas.length} planilhas anexadas`;
  return "pasta Due Diligence confirmada";
}

export function buildLevantamentoConcluidoValues(input: {
  cliente: string;
  entregas: LevantamentoEntrega[];
  link: string;
}): WhatsappTemplateValues {
  return {
    cliente: input.cliente,
    areas: input.entregas.map((e) => `• ${e.area}: ${describeLevantamentoEntrega(e)}`).join("\n"),
    link: whatsappLink(input.link),
  };
}

// ─── Revisão: início do ciclo ─────────────────────────────────────────────────

export type RevisorDaArea = { area: string; responsavel: string | null };

export function buildRevisaoInicioValues(input: {
  cliente: string;
  ciclo: number;
  prazoIso: string | null;
  revisores: RevisorDaArea[];
  link: string;
}): WhatsappTemplateValues {
  const semResponsavel = input.revisores.filter((r) => !r.responsavel).map((r) => r.area);
  return {
    cliente: input.cliente,
    ciclo: cicloLabel(input.ciclo),
    prazo: formatPrazoWhatsapp(input.prazoIso),
    areas: input.revisores.map((r) => `• ${r.area}: ${r.responsavel ?? "sem responsável"}`).join("\n"),
    avisos: semResponsavel.length
      ? `*Atenção:* defina no cadastro de usuários quem revisa ${joinList(semResponsavel)}.`
      : "",
    link: whatsappLink(input.link),
  };
}

// ─── Revisão: resultado do ciclo ──────────────────────────────────────────────

export type ReviewRow = {
  area_key: string | null;
  status: string | null;
  revision_cycle: number | string | null;
  observacao_ajustes?: string | null;
  respondido_por?: string | null;
};

export type ReviewCycleResult =
  | { kind: "aprovada"; areas: ReviewRow[] }
  | { kind: "ajustes"; ajustes: ReviewRow[]; aprovadas: string[]; pendentes: string[] };

const cycleOf = (row: ReviewRow) => Number(row.revision_cycle) || 0;
const respondida = (row: ReviewRow) => row.status === "ok" || row.status === "ajustes_solicitados";

/** Última tarefa de cada área até o ciclo (quem aprovou num ciclo anterior não volta a revisar). */
function latestByArea(rows: ReviewRow[], cycle: number): ReviewRow[] {
  const latest = new Map<string, ReviewRow>();
  for (const row of rows) {
    if (cycleOf(row) > cycle) continue;
    const area = String(row.area_key ?? "");
    const current = latest.get(area);
    if (!current || cycleOf(row) > cycleOf(current)) latest.set(area, row);
  }
  return [...latest.values()];
}

/**
 * O ciclo terminou? Manda UMA mensagem quando (a) um pedido de ajuste devolveu a DUE para Compilação ou
 * (b) todas as áreas do ciclo responderam. Uma aprovação no meio do ciclo não gera mensagem.
 */
export function decideReviewCycleResult(
  rows: ReviewRow[],
  cycle: number,
  options: { returnedToCompilacao: boolean },
): ReviewCycleResult | null {
  const cycleRows = rows.filter((row) => cycleOf(row) === cycle);
  if (cycleRows.length === 0) return null;
  const allResponded = cycleRows.every(respondida);
  if (!options.returnedToCompilacao && !allResponded) return null;

  const ajustes = cycleRows.filter((row) => row.status === "ajustes_solicitados");
  if (ajustes.length === 0) {
    if (!isDueReviewApprovedForCycle(rows, cycle)) return null;
    return { kind: "aprovada", areas: latestByArea(rows, cycle) };
  }
  const latest = latestByArea(rows, cycle);
  return {
    kind: "ajustes",
    ajustes,
    aprovadas: latest.filter((row) => row.status === "ok").map((row) => String(row.area_key ?? "")),
    pendentes: cycleRows.filter((row) => !respondida(row)).map((row) => String(row.area_key ?? "")),
  };
}

export function buildRevisaoResultadoValues(input: {
  cliente: string;
  ciclo: number;
  result: ReviewCycleResult;
  link: string;
}): WhatsappTemplateValues {
  const base = { cliente: input.cliente, ciclo: cicloLabel(input.ciclo), link: whatsappLink(input.link) };
  if (input.result.kind === "aprovada") {
    return {
      ...base,
      areas: input.result.areas
        .map((row) => `• ${row.area_key}: aprovada${row.respondido_por ? ` por ${row.respondido_por}` : ""}`)
        .join("\n"),
    };
  }
  return {
    ...base,
    ajustes: input.result.ajustes
      .map((row) => {
        const obs = row.observacao_ajustes?.trim();
        return `• ${row.area_key}: ${obs || "ajuste pedido (sem observação)"}`;
      })
      .join("\n"),
    aprovadas: joinList(input.result.aprovadas),
    pendentes: joinList(input.result.pendentes),
  };
}

// ─── Revisão: ajuste pedido depois da mensagem do ciclo ───────────────────────

/**
 * A mensagem do ciclo já saiu e uma área pediu ajuste depois dela (antes não saía nada). Devolve a linha da
 * área quando o complemento deve sair: pediu ajuste neste ciclo e não está entre os ajustes da mensagem
 * enviada (que lista cada um como `• Área: …`).
 */
export function decideAjusteAdicional(
  rows: ReviewRow[],
  cycle: number,
  input: { areaKey: string; sentCycleText: string },
): ReviewRow | null {
  const row = rows.find((r) => cycleOf(r) === cycle && String(r.area_key ?? "") === input.areaKey);
  if (!row || row.status !== "ajustes_solicitados") return null;
  if (input.sentCycleText.includes(`• ${input.areaKey}:`)) return null;
  return row;
}

export function buildRevisaoAjusteAdicionalValues(input: {
  cliente: string;
  ciclo: number;
  row: ReviewRow;
  link: string;
}): WhatsappTemplateValues {
  return {
    cliente: input.cliente,
    ciclo: cicloLabel(input.ciclo),
    area: String(input.row.area_key ?? ""),
    observacao: input.row.observacao_ajustes?.trim() || "ajuste pedido (sem observação)",
    respondido_por: input.row.respondido_por ?? "",
    link: whatsappLink(input.link),
  };
}

// ─── Escopo da proposta ───────────────────────────────────────────────────────

export type EscopoPedidoArea = { area: string; gestores: string[] };

export function buildEscopoPedidoValues(input: {
  cliente: string;
  prazoIso: string | null;
  areas: EscopoPedidoArea[];
  link: string;
}): WhatsappTemplateValues {
  return {
    cliente: input.cliente,
    prazo: formatPrazoWhatsapp(input.prazoIso),
    areas: input.areas
      .map((a) => `• ${a.area}: ${a.gestores.length ? joinList(a.gestores) : "sem gestor na área"}`)
      .join("\n"),
    link: whatsappLink(input.link),
  };
}
