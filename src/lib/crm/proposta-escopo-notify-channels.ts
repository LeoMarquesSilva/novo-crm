import type { SupabaseClient } from "@supabase/supabase-js";
import { appUserAreaCandidatesForScopeKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import type { InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import { IntegrationError } from "@/lib/http/api-errors";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { applyWhatsappRedirect } from "@/modules/crm/infrastructure/integrations/evolution-whatsapp";
import { buildEscopoPedidoValues, type EscopoPedidoArea } from "@/lib/crm/whatsapp/due-messages";
import { claimWhatsappSend, markWhatsappSendFailed, withOneWhatsappRetry } from "@/lib/crm/whatsapp/send-log";
import { buildWhatsappMessage } from "@/lib/crm/whatsapp/template-store";

type SolicitacaoRow = {
  id: string;
  oportunidade_id: string;
  area_key: string;
  gestor_app_user_id: string | null;
  notificado_em: string | null;
  prazo_ate: string | null;
};

function getPublicAppUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.VERCEL_URL?.replace(/\/$/, "") ||
    "";
  if (!base) return "";
  return base.startsWith("http") ? base : `https://${base}`;
}

async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "CRM <onboarding@resend.dev>";
  if (!key) return false;
  const res = await fetchWithTimeout("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}

async function sendEvolutionGroupText(text: string): Promise<boolean> {
  const base = (
    process.env.EVOLUTION_API_BASE_URL ?? process.env.EVOLUTION_API_URL
  )?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance =
    process.env.EVOLUTION_INSTANCE_NAME ?? process.env.EVOLUTION_INSTANCE;
  const groupJid = process.env.EVOLUTION_GROUP_JID;
  if (!base || !apiKey || !instance || !groupJid) return false;
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;
  const message = applyWhatsappRedirect(groupJid, text);
  // 5xx da Evolution ou queda de rede: uma nova tentativa imediata.
  return withOneWhatsappRetry(async () => {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: message.destination, text: message.text }),
    });
    if (res.status >= 500) {
      throw new IntegrationError("evolution", "Evolution API indisponível.", `HTTP ${res.status}`, res.status);
    }
    return res.ok;
  });
}

/**
 * Para cada solicitação ainda não notificada: in-app + e-mail (Resend) por gestor, com auditoria. No WhatsApp
 * (Evolution) sai UMA mensagem com todas as áreas do pedido, no fim.
 */
export async function dispatchPropostaEscopoChannelNotifications(
  supabase: SupabaseClient,
  oportunidadeId: string,
  options?: {
    areaKeys?: string[];
    targetsByArea?: Record<string, string[]>;
    originado_por?: InAppNotificationActor | null;
  },
): Promise<void> {
  const { data: op, error: opErr } = await supabase
    .from("oportunidades")
    .select("solicitante_nome")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (opErr || !op) return;

  let pendingQuery = supabase
    .from("proposta_escopo_solicitacao")
    .select("id, oportunidade_id, area_key, gestor_app_user_id, notificado_em, prazo_ate")
    .eq("oportunidade_id", oportunidadeId)
    .is("notificado_em", null);
  if (options?.areaKeys?.length) {
    pendingQuery = pendingQuery.in("area_key", options.areaKeys);
  }
  const { data: pending, error: pErr } = await pendingQuery;
  if (pErr || !pending?.length) return;

  const appUrl = getPublicAppUrl();
  const leadPath = `/crm/leads/${oportunidadeId}`;
  const waAreas: EscopoPedidoArea[] = [];
  const waRowIds: string[] = [];

  for (const row of pending as SolicitacaoRow[]) {
    waRowIds.push(row.id);
    const explicitTargets = options?.targetsByArea?.[row.area_key]
      ?? options?.targetsByArea?.[normalizePracticeAreaKey(row.area_key)]
      ?? [];
    const rawTargetIds = explicitTargets.length
      ? explicitTargets
      : row.gestor_app_user_id
        ? [row.gestor_app_user_id]
        : [];
    const targetIds = [...new Set(rawTargetIds.map((id) => id.trim()).filter(Boolean))];
    if (targetIds.length === 0) {
      waAreas.push({ area: row.area_key, gestores: [] });
      const err = "Sem gestor com app_users.area igual a esta área.";
      const now = new Date().toISOString();
      await supabase
        .from("proposta_escopo_solicitacao")
        .update({ notificado_em: now, ultimo_erro_canais: err, updated_at: now })
        .eq("id", row.id);
      continue;
    }

    const { data: gestores, error: gErr } = await supabase
      .from("app_users")
      .select("id, auth_user_id, full_name, area")
      .in("id", targetIds)
      .in("area", appUserAreaCandidatesForScopeKey(row.area_key));
    const validGestores = gestores ?? [];
    waAreas.push({
      area: row.area_key,
      gestores: gErr ? [] : validGestores.map((g) => String(g.full_name ?? "").trim()).filter(Boolean),
    });
    if (gErr || validGestores.length === 0) {
      const now = new Date().toISOString();
      await supabase
        .from("proposta_escopo_solicitacao")
        .update({
          notificado_em: now,
          ultimo_erro_canais: "Gestor sem auth_user_id.",
          updated_at: now,
        })
        .eq("id", row.id);
      continue;
    }

    const title = `Preencher escopo — ${row.area_key}`;
    const bodyText = `Oportunidade: ${String(op.solicitante_nome ?? "—")}. Área: ${row.area_key}. Preencha o escopo detalhado na etapa de elaboração da proposta.`;
    const link = appUrl ? `${appUrl}${leadPath}` : leadPath;
    const origin = options?.originado_por ?? null;
    const payload = {
      oportunidade_id: oportunidadeId,
      area_key: row.area_key,
      path: leadPath,
      link,
      title,
      ...(origin ? { originado_por: origin } : {}),
    };

    let emailOk = false;
    let errMsg: string | null = null;

    for (const gestor of validGestores) {
      const authUserId = gestor.auth_user_id as string;
      if (!authUserId) {
        errMsg = (errMsg ? errMsg + "; " : "") + `${gestor.full_name}: sem auth_user_id.`;
        continue;
      }

      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(authUserId);
      const email = authErr ? null : authData.user?.email ?? null;

      const { error: nInsErr } = await supabase.from("crm_in_app_notifications").insert({
        user_id: authUserId,
        tipo: "proposta_escopo_area",
        payload: payload as never,
      });
      if (nInsErr) errMsg = (errMsg ? errMsg + "; " : "") + `in-app ${gestor.full_name}: ${nInsErr.message}`;

      if (email) {
        const sent = await sendResendEmail(
          email,
          title,
          `<p>${bodyText}</p><p><a href="${link}">Abrir oportunidade no CRM</a></p>`,
        );
        emailOk = emailOk || sent;
        if (!sent && process.env.RESEND_API_KEY) {
          errMsg = (errMsg ? errMsg + "; " : "") + `e-mail Resend falhou para ${gestor.full_name}.`;
        }
      }
    }

    const now = new Date().toISOString();
    await supabase
      .from("proposta_escopo_solicitacao")
      .update({
        notificado_em: now,
        email_enviado_em: emailOk ? now : null,
        ultimo_erro_canais: errMsg,
        updated_at: now,
      })
      .eq("id", row.id);
  }

  if (waAreas.length === 0) return;
  const prazos = (pending as SolicitacaoRow[])
    .map((row) => row.prazo_ate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const text = await buildWhatsappMessage(
    supabase,
    "proposta_escopo_pedido",
    buildEscopoPedidoValues({
      cliente: String(op.solicitante_nome ?? ""),
      prazoIso: prazos[0] ?? null,
      areas: waAreas,
      link: appUrl ? `${appUrl}${leadPath}` : leadPath,
    }),
  );
  if (!text) return;
  const sendLog = {
    oportunidadeId,
    sourceId: `proposta-escopo:${[...waRowIds].sort().join("|")}`,
    title: "WhatsApp: escopo da proposta solicitado",
    text,
  };
  if (!(await claimWhatsappSend(supabase, sendLog))) return;
  let waOk = false;
  try {
    waOk = await sendEvolutionGroupText(text);
  } catch {
    waOk = false;
  }
  if (!waOk) {
    await markWhatsappSendFailed(supabase, sendLog);
    return;
  }
  await supabase
    .from("proposta_escopo_solicitacao")
    .update({ whatsapp_enviado_em: new Date().toISOString() })
    .in("id", waRowIds);
}
