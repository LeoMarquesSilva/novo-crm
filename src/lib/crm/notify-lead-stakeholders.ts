import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStakeholderContext = {
  criadoPorAppUserId: string | null;
  solicitanteEmail: string | null;
  rdOwnerEmail: string | null;
  cadastradoPorEmail: string | null;
};

function normalizeEmail(email: string | null | undefined): string | null {
  const v = email?.trim().toLowerCase();
  return v && v.includes("@") ? v : null;
}

function normalizeLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getRdOwnerEmailFromReconciliation(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const root = details as Record<string, unknown>;
  const deal =
    root.deal && typeof root.deal === "object"
      ? (root.deal as Record<string, unknown>)
      : null;
  if (!deal || !Array.isArray(deal.deal_custom_fields)) return null;

  const targets = ["cadastro realizado por", "cadastro realizado por (e-mail)"].map(normalizeLabel);
  for (const field of deal.deal_custom_fields) {
    if (!field || typeof field !== "object") continue;
    const row = field as Record<string, unknown>;
    const customField =
      row.custom_field && typeof row.custom_field === "object"
        ? (row.custom_field as Record<string, unknown>)
        : null;
    const rawLabel =
      typeof customField?.label === "string"
        ? customField.label
        : typeof row.label === "string"
          ? row.label
          : null;
    if (!rawLabel || !targets.includes(normalizeLabel(rawLabel))) continue;
    const value =
      typeof row.value === "string"
        ? row.value
        : typeof row.content === "string"
          ? row.content
          : null;
    return normalizeEmail(value);
  }
  return null;
}

/** Carrega dono (RD), cadastrado por e e-mail do solicitante para notificações do lead. */
export async function fetchLeadStakeholderContext(
  supabase: SupabaseClient,
  oportunidadeId: string,
): Promise<LeadStakeholderContext> {
  const [{ data: opp }, { data: intake }, { data: recon }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select("criado_por, solicitante_email")
      .eq("id", oportunidadeId)
      .maybeSingle(),
    supabase
      .from("lead_intakes")
      .select("cadastrado_por_email")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle(),
    supabase
      .from("rd_deal_reconciliacao")
      .select("detalhes")
      .eq("oportunidade_id", oportunidadeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    criadoPorAppUserId: opp?.criado_por ? String(opp.criado_por) : null,
    solicitanteEmail: normalizeEmail(opp?.solicitante_email),
    rdOwnerEmail: getRdOwnerEmailFromReconciliation(recon?.detalhes),
    cadastradoPorEmail: normalizeEmail(intake?.cadastrado_por_email),
  };
}

/**
 * Resolve auth_user_id de: dono (RD), cadastrado por (criado_por / intake) e solicitado por (e-mail interno).
 */
export async function resolveLeadStakeholderAuthUserIds(
  supabase: SupabaseClient,
  ctx: LeadStakeholderContext,
): Promise<string[]> {
  const appUserIds = new Set<string>();
  if (ctx.criadoPorAppUserId) appUserIds.add(ctx.criadoPorAppUserId);

  const emails = new Set<string>();
  for (const email of [ctx.solicitanteEmail, ctx.rdOwnerEmail, ctx.cadastradoPorEmail]) {
    if (email) emails.add(email);
  }

  const authIds = new Set<string>();

  if (appUserIds.size > 0) {
    const { data: byId } = await supabase
      .from("app_users")
      .select("auth_user_id")
      .in("id", [...appUserIds])
      .not("auth_user_id", "is", null);
    for (const row of byId ?? []) {
      if (row.auth_user_id) authIds.add(String(row.auth_user_id));
    }
  }

  if (emails.size > 0) {
    const { data: authList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of authList?.users ?? []) {
      const mail = normalizeEmail(u.email);
      if (mail && emails.has(mail) && u.id) authIds.add(u.id);
    }
  }

  return [...authIds];
}

/** Notificação in-app apenas para os envolvidos do lead (sem broadcast admin/comercial). */
export async function notifyLeadStakeholdersInApp(
  supabase: SupabaseClient,
  authUserIds: string[],
  tipo: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const unique = [...new Set(authUserIds.filter(Boolean))];
  if (unique.length === 0) return;

  await supabase.from("crm_in_app_notifications").insert(
    unique.map((userId) => ({
      user_id: userId,
      tipo,
      payload: payload as never,
    })),
  );
}
