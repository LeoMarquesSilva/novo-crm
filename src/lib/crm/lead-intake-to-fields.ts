/**
 * Mapeia uma linha `lead_intakes` para pares label/valor na ficha do lead.
 * Sem dependências de React (pode ser testada de forma isolada).
 */

export type LeadIntakeFilledField = { key: string; label: string; value: string };

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function formatDateOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, 10);
}

function formatTimeHm(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function filledFieldsFromLeadIntake(
  intake: Record<string, unknown>,
  opts: { solicitanteEmail: string | null },
): LeadIntakeFilledField[] {
  const out: LeadIntakeFilledField[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    const v =
      typeof value === "string"
        ? value.trim()
        : value != null && value !== ""
          ? String(value).trim()
          : "";
    if (v) out.push({ key, label, value: v });
  };

  if (opts.solicitanteEmail) {
    push("email_solicitante", "E-mail do solicitante", opts.solicitanteEmail);
  }

  const solicitante = asString(intake.solicitante_nome);
  if (solicitante) push("solicitante_nome", "Solicitante", solicitante);

  const cad = asString(intake.cadastrado_por_email);
  if (cad) push("cadastrado_por", "Cadastro realizado por", cad);

  const ctx = asString(intake.contexto_comercial);
  if (ctx) push("contexto_comercial", "Contexto comercial", ctx);

  out.push({
    key: "due_diligence_intake",
    label: "Due diligence (cadastro)",
    value: intake.due_diligence === true ? "Sim" : "Não",
  });

  const dDue = formatDateOnly(intake.data_entrega_due);
  if (dDue) push("data_entrega_due", "Data de entrega (Due)", dDue);

  const hDue = formatTimeHm(intake.horario_entrega_due);
  if (hDue) push("horario_entrega_due", "Horário de entrega (Due)", hDue);

  /** Empresas: a ficha usa `LeadDetailData.empresas_json` → `empresasIntake` (um bloco por empresa). */

  const areas = intake.areas_analise;
  if (Array.isArray(areas) && areas.length > 0) {
    const parts = areas.map((a) => String(a)).filter(Boolean);
    if (parts.length) push("areas_analise", "Áreas que serão objeto de análise", parts.join(", "));
  }

  push("local_reuniao", "Local da reunião", asString(intake.local_reuniao));

  const dReu = formatDateOnly(intake.data_reuniao);
  if (dReu) push("data_reuniao", "Data da reunião", dReu);

  const hReu = formatTimeHm(intake.horario_reuniao);
  if (hReu) push("horario_reuniao", "Horário da reunião", hReu);

  push("tipo_lead", "Tipo de lead", asString(intake.tipo_lead));
  const ti = asString(intake.tipo_indicacao);
  if (ti) push("tipo_indicacao", "Tipo de indicação", ti);
  const ni = asString(intake.nome_indicacao);
  if (ni) push("nome_indicacao", "Nome da indicação", ni);

  const spId = asString(intake.sharepoint_agendamento_id);
  if (spId) push("sharepoint_agendamento_id", "Agendamento SharePoint (ID)", spId);

  const spUrl = asString(intake.sharepoint_agendamento_url);
  if (spUrl) push("sharepoint_agendamento_url", "Agendamento SharePoint (link)", spUrl);

  const spCreatedAt = asString(intake.sharepoint_agendamento_created_at);
  if (spCreatedAt) {
    push("sharepoint_agendamento_created_at", "Agendamento SharePoint criado em", spCreatedAt);
  }

  const spError = asString(intake.sharepoint_agendamento_error);
  if (spError) push("sharepoint_agendamento_error", "Erro SharePoint (Due)", spError);

  return out;
}
