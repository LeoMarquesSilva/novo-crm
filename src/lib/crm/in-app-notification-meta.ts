/**
 * Metadados e convenção de payload para `crm_in_app_notifications`.
 * `originado_por` é um snapshot em JSON (RLS de `app_users` impede joins no cliente).
 */

export type InAppNotificationActor = {
  app_user_id: string;
  full_name: string;
  avatar_url: string | null;
};

export type AppUserActorRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
};

export const CRM_IN_APP_NOTIFICATION_TIPO_LABELS: Record<string, string> = {
  indicator_pending_approval:     "Indicadores",
  due_area_task:                  "DUE — levantamento",
  due_compilacao:                 "DUE — compilação",
  due_revisao_area:               "DUE — revisão",
  due_revisao_resposta:           "DUE — resposta da revisão",
  proposta_escopo_area:           "Proposta — escopo",
  lead_note_mention:              "Anotações",
  contrato_assinado:              "Contrato assinado",
  contrato_parcialmente_assinado: "Contrato — assinatura parcial",
  contrato_cancelado:             "Contrato cancelado",
  contract_review_requested:      "Revisão de contrato solicitada",
};

/** Tipos `crm_in_app_notifications.tipo` que disparam a tab "SLA de etapa" (vazio até existir job/API). */
export const SLA_STAGE_NOTIFICATION_TIPOS = new Set<string>([
  // Ex.: "etapa_sla_excedido" quando implementado
]);

function isDueNotificationTipo(tipo: string): boolean {
  return (
    tipo === "due_area_task" ||
    tipo === "due_compilacao" ||
    tipo === "due_revisao_area" ||
    tipo === "due_revisao_resposta"
  );
}

export type NotificationTabGroupId =
  | "todas"
  | "due"
  | "propostas"
  | "contratos"
  | "indicadores"
  | "anotacoes"
  | "sla_etapa"
  | "outras";

/** Tabs agregadas na UI (vários `tipo` por grupo). */
export const NOTIFICATION_TAB_GROUPS: Array<{
  id: Exclude<NotificationTabGroupId, "todas" | "outras">;
  label: string;
}> = [
  { id: "due",       label: "DUE"        },
  { id: "propostas", label: "Propostas"  },
  { id: "contratos", label: "Contratos"  },
  { id: "indicadores", label: "Indicadores" },
  { id: "anotacoes", label: "Anotações"  },
  { id: "sla_etapa", label: "SLA de etapa" },
];

export function notificationTabGroupForTipo(tipo: string): Exclude<NotificationTabGroupId, "todas"> {
  if (isDueNotificationTipo(tipo)) return "due";
  if (tipo === "proposta_escopo_area") return "propostas";
  if (tipo === "indicator_pending_approval") return "indicadores";
  if (tipo === "lead_note_mention") return "anotacoes";
  if (SLA_STAGE_NOTIFICATION_TIPOS.has(tipo)) return "sla_etapa";
  if (
    tipo === "contrato_assinado" ||
    tipo === "contrato_parcialmente_assinado" ||
    tipo === "contrato_cancelado" ||
    tipo === "contract_review_requested"
  ) return "contratos";
  return "outras";
}

export function inAppNotificationTipoLabel(tipo: string): string {
  return CRM_IN_APP_NOTIFICATION_TIPO_LABELS[tipo] ?? tipo;
}

export function actorFromAppUserRow(row: AppUserActorRow | null | undefined): InAppNotificationActor | null {
  if (!row?.id || !String(row.full_name ?? "").trim()) return null;
  return {
    app_user_id: row.id,
    full_name: row.full_name.trim(),
    avatar_url: row.avatar_url ?? null,
  };
}

function parseActorSnapshot(
  payload: unknown,
  field: "originado_por" | "lead_criador",
): InAppNotificationActor | null {
  if (payload == null || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>)[field];
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const app_user_id = typeof o.app_user_id === "string" ? o.app_user_id.trim() : "";
  const full_name = typeof o.full_name === "string" ? o.full_name.trim() : "";
  if (!app_user_id || !full_name) return null;
  const avatar_url =
    o.avatar_url === null || o.avatar_url === undefined
      ? null
      : typeof o.avatar_url === "string"
        ? o.avatar_url
        : null;
  return { app_user_id, full_name, avatar_url };
}

export function parseOriginadoPor(payload: unknown): InAppNotificationActor | null {
  return parseActorSnapshot(payload, "originado_por");
}

/** Snapshot acrescentado no servidor (criador da oportunidade) quando não há `originado_por`. */
export function parseLeadCriadorPor(payload: unknown): InAppNotificationActor | null {
  return parseActorSnapshot(payload, "lead_criador");
}

/** Resumo do levantamento DUE por área (enriquecido no servidor, alinhado ao cartão do pipeline). */
export type DueLevantamentoEnrichmentPayload = {
  disponibilizados: number;
  total: number;
  atrasados: number;
  areas: Array<{
    areaKey: string;
    entregue: boolean;
    emAtraso: boolean;
    semProcessosAtivos: boolean;
  }>;
};

export function parseDueLevantamentoEnrichment(payload: unknown): DueLevantamentoEnrichmentPayload | null {
  if (payload == null || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).due_levantamento;
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const disponibilizados = typeof o.disponibilizados === "number" ? o.disponibilizados : Number(o.disponibilizados);
  const total = typeof o.total === "number" ? o.total : Number(o.total);
  const atrasados = typeof o.atrasados === "number" ? o.atrasados : Number(o.atrasados);
  if (!Number.isFinite(total) || total <= 0) return null;
  const areasRaw = o.areas;
  if (!Array.isArray(areasRaw)) return null;
  const areas: DueLevantamentoEnrichmentPayload["areas"] = [];
  for (const a of areasRaw) {
    if (a == null || typeof a !== "object") continue;
    const row = a as Record<string, unknown>;
    const areaKey = typeof row.areaKey === "string" ? row.areaKey.trim() : "";
    if (!areaKey) continue;
    areas.push({
      areaKey,
      entregue: Boolean(row.entregue),
      emAtraso: Boolean(row.emAtraso),
      semProcessosAtivos: Boolean(row.semProcessosAtivos),
    });
  }
  return {
    disponibilizados: Number.isFinite(disponibilizados) ? disponibilizados : 0,
    total,
    atrasados: Number.isFinite(atrasados) ? atrasados : 0,
    areas,
  };
}

/** Datas do lead / intake enriquecidas no servidor (`oportunidades` + `lead_intakes`). */
export type LeadContextoDatasPayload = {
  lead_criado_em: string | null;
  due_entrega_em: string | null;
  reuniao_em: string | null;
};

export function parseLeadContextoDatas(payload: unknown): LeadContextoDatasPayload | null {
  if (payload == null || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>).lead_contexto_datas;
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const v = o[key];
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t || null;
  };
  return {
    lead_criado_em: pick("lead_criado_em"),
    due_entrega_em: pick("due_entrega_em"),
    reuniao_em: pick("reuniao_em"),
  };
}

/** Formata ISO (UTC) para exibição em pt-BR (data e hora curtas). */
export function formatContextoDateTimePtBr(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
