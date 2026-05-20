import type { SupabaseClient } from "@supabase/supabase-js";
import { displayStringToValueJson, valueJsonToDisplayString } from "@/lib/crm/pipeline-field-values";
import { indicationTypes, leadAreas, leadTypes } from "@/modules/crm/application/services/new-lead-payload";
import { isAllowedRdFieldOverrideKey } from "@/lib/crm/lead-rd-field-labels";
import { appUserAreaToEscopoJsonKey, normalizePracticeAreaKey } from "@/lib/crm/area-keys-alignment";
import { parseEscopoJson } from "@/lib/crm/proposta-escopo-json";
import type { Database } from "@/lib/supabase/database.types";
import { actorFromAppUserRow, type InAppNotificationActor } from "@/lib/crm/in-app-notification-meta";
import {
  refreshSolicitacaoConcluidaForEscopoJson,
  syncPropostaEscopoSolicitacoesForOportunidade,
} from "@/lib/crm/proposta-escopo-solicitacoes";

const EMPRESA_FIELD_RE = /^empresa_(\d+)_(razao|doc|tipo)$/;
/** Atualização atómica: `empresa_1` + JSON `{ razao_social, tipo_documento, documento }`. */
const EMPRESA_BUNDLE_RE = /^empresa_(\d+)$/;

export type PatchViewerContext = {
  authUserId: string;
  appUserId: string;
  role: Database["public"]["Enums"]["user_role"];
  /** Área do usuário em `app_users.area`; se definida, escopo só pode mudar nessa chave (exceto admin). */
  appArea: string | null;
};

export type PatchLeadDetailPayload = {
  /** Atualiza um campo do cadastro inicial (`lead_intakes` e, se aplicável, `oportunidades`). */
  intakeField?: { key: string; value: string };
  /** Sobrepõe valor exibido para um campo do snapshot RD (armazenado em `crm_rd_field_overrides`). */
  rdField?: { key: string; value: string };
  /** Atualiza valor em `field_values` (campos configuráveis por etapa, preenchidos na transição). */
  pipelineField?: { fieldDefinitionId: string; value: string };
};

export async function patchLeadDetail(
  supabase: SupabaseClient,
  oportunidadeId: string,
  body: PatchLeadDetailPayload,
  options?: { viewer?: PatchViewerContext },
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const n =
    (body.intakeField ? 1 : 0) + (body.rdField ? 1 : 0) + (body.pipelineField ? 1 : 0);
  if (n !== 1) {
    return {
      ok: false,
      error: "Envie exatamente um bloco: intakeField, rdField ou pipelineField.",
      status: 400,
    };
  }

  if (body.pipelineField) {
    return patchPipelineFieldValue(supabase, oportunidadeId, body.pipelineField, options?.viewer);
  }

  if (body.rdField) {
    return patchRdFieldOverride(supabase, oportunidadeId, body.rdField.key, body.rdField.value);
  }

  return patchIntakeField(supabase, oportunidadeId, body.intakeField!.key, body.intakeField!.value);
}

async function patchPipelineFieldValue(
  supabase: SupabaseClient,
  oportunidadeId: string,
  payload: { fieldDefinitionId: string; value: string },
  viewer?: PatchViewerContext,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { data: defRows, error: defErr } = await supabase
    .from("field_definitions")
    .select("id, field_type, entity_name, field_code")
    .eq("id", payload.fieldDefinitionId)
    .limit(1);

  if (defErr) return { ok: false, error: defErr.message };
  const def = defRows?.[0];
  if (!def || def.entity_name !== "oportunidade") {
    return { ok: false, error: "Campo de pipeline inválido.", status: 400 };
  }

  const fieldCode = String((def as { field_code?: string }).field_code ?? "");

  let valueStr = payload.value;
  if (fieldCode === "cp_escopo_detalhe_json" && viewer) {
    if (viewer.role !== "admin" && viewer.role !== "comercial") {
      return {
        ok: false,
        error: "Sem permissão para editar o escopo detalhado.",
        status: 403,
      };
    }
    const areaRestrita = (viewer.appArea ?? "").trim();
    /** Chave no JSON = valor canónico em `crm-areas.ts` (aliases legados via `area-keys-alignment`). */
    const escopoJsonKey = areaRestrita ? appUserAreaToEscopoJsonKey(areaRestrita) : "";
    if (viewer.role !== "admin" && areaRestrita && escopoJsonKey) {
      let incoming: Record<string, unknown>;
      try {
        incoming = JSON.parse(valueStr) as Record<string, unknown>;
      } catch {
        return { ok: false, error: "JSON de escopo inválido.", status: 400 };
      }
      const { data: fvRows } = await supabase
        .from("field_values")
        .select("value_json")
        .eq("entity_name", "oportunidade")
        .eq("entity_record_id", oportunidadeId)
        .eq("field_definition_id", payload.fieldDefinitionId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(1);
      const fvRow = fvRows?.[0];
      const existingRaw = fvRow?.value_json;
      const existingStr =
        typeof existingRaw === "object" && existingRaw !== null
          ? JSON.stringify(existingRaw)
          : valueJsonToDisplayString(existingRaw);
      let existing: Record<string, unknown> = {};
      try {
        existing = existingStr.trim() ? (JSON.parse(existingStr) as Record<string, unknown>) : {};
      } catch {
        existing = {};
      }
      for (const k of Object.keys(incoming)) {
        if (k === escopoJsonKey) continue;
        const a = JSON.stringify(incoming[k]);
        const b = JSON.stringify(existing[k]);
        if (a !== b) {
          return {
            ok: false,
            error: "Só pode alterar o escopo da sua área.",
            status: 403,
          };
        }
      }
      const merged = { ...existing, [escopoJsonKey]: incoming[escopoJsonKey] };
      valueStr = JSON.stringify(merged);
    }
  }

  const valueJson = displayStringToValueJson(String(def.field_type), valueStr);

  /** `maybeSingle()` falha se existirem linhas duplicadas em `field_values` para o mesmo campo. */
  const { data: existingRows, error: exErr } = await supabase
    .from("field_values")
    .select("id")
    .eq("entity_name", "oportunidade")
    .eq("entity_record_id", oportunidadeId)
    .eq("field_definition_id", payload.fieldDefinitionId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (exErr) return { ok: false, error: exErr.message };
  const existing = existingRows?.[0];

  const now = new Date().toISOString();

  if (existing?.id) {
    const { error: upErr } = await supabase
      .from("field_values")
      .update({ value_json: valueJson as never, updated_at: now })
      .eq("id", existing.id);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: insErr } = await supabase.from("field_values").insert({
      entity_name: "oportunidade",
      entity_record_id: oportunidadeId,
      field_definition_id: payload.fieldDefinitionId,
      value_json: valueJson as never,
      updated_at: now,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error: opErr } = await supabase
    .from("oportunidades")
    .update({ updated_at: now })
    .eq("id", oportunidadeId);
  if (opErr) return { ok: false, error: opErr.message };

  if (fieldCode === "cp_areas_objeto") {
    let originado_por: InAppNotificationActor | null = null;
    if (viewer?.appUserId) {
      const { data: actorRow } = await supabase
        .from("app_users")
        .select("id, full_name, avatar_url")
        .eq("id", viewer.appUserId)
        .maybeSingle();
      originado_por = actorFromAppUserRow(actorRow);
    }
    await syncPropostaEscopoSolicitacoesForOportunidade(supabase, oportunidadeId, valueStr, {
      originado_por,
    });
  }
  if (fieldCode === "cp_escopo_detalhe_json") {
    const escopo = parseEscopoJson(valueStr);
    await refreshSolicitacaoConcluidaForEscopoJson(supabase, oportunidadeId, escopo, {
      preenchidoPorAppUserId: viewer?.appUserId ?? null,
    });
  }

  return { ok: true };
}

async function patchRdFieldOverride(
  supabase: SupabaseClient,
  oportunidadeId: string,
  key: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  if (!isAllowedRdFieldOverrideKey(key)) {
    return { ok: false, error: "Campo RD inválido.", status: 400 };
  }
  const trimmed = value.trim();
  const { data: row, error: fetchErr } = await supabase
    .from("oportunidades")
    .select("crm_rd_field_overrides")
    .eq("id", oportunidadeId)
    .maybeSingle();

  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: "Negociação não encontrada.", status: 404 };

  const current =
    row.crm_rd_field_overrides &&
    typeof row.crm_rd_field_overrides === "object" &&
    !Array.isArray(row.crm_rd_field_overrides)
      ? { ...(row.crm_rd_field_overrides as Record<string, string>) }
      : {};

  if (!trimmed) {
    delete current[key];
  } else {
    current[key] = trimmed;
  }

  const { error: upErr } = await supabase
    .from("oportunidades")
    .update({
      crm_rd_field_overrides: current,
      updated_at: new Date().toISOString(),
    })
    .eq("id", oportunidadeId);

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

async function patchIntakeField(
  supabase: SupabaseClient,
  oportunidadeId: string,
  key: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const trimmed = value.trim();

  if (key === "email_solicitante") {
    if (!trimmed) return { ok: false, error: "E-mail do solicitante não pode ficar vazio.", status: 400 };
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!emailOk) return { ok: false, error: "E-mail inválido.", status: 400 };
    const { error } = await supabase
      .from("oportunidades")
      .update({ solicitante_email: trimmed, updated_at: new Date().toISOString() })
      .eq("id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "solicitante_nome") {
    if (!trimmed) return { ok: false, error: "Nome do lead não pode ficar vazio.", status: 400 };
    const { error } = await supabase
      .from("oportunidades")
      .update({ solicitante_nome: trimmed, updated_at: new Date().toISOString() })
      .eq("id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "havera_due_diligence" || key === "due_diligence_intake") {
    const sim = trimmed.toLowerCase() === "sim";
    const nao = trimmed.toLowerCase() === "não" || trimmed.toLowerCase() === "nao";
    if (!sim && !nao) {
      return { ok: false, error: "Use Sim ou Não para due diligence.", status: 400 };
    }
    const { error: e1 } = await supabase
      .from("oportunidades")
      .update({ havera_due_diligence: sim, updated_at: new Date().toISOString() })
      .eq("id", oportunidadeId);
    if (e1) return { ok: false, error: e1.message };
    const { data: intakeDd } = await supabase
      .from("lead_intakes")
      .select("oportunidade_id")
      .eq("oportunidade_id", oportunidadeId)
      .maybeSingle();
    if (intakeDd) {
      const { error: e2 } = await supabase
        .from("lead_intakes")
        .update({ due_diligence: sim })
        .eq("oportunidade_id", oportunidadeId);
      if (e2) return { ok: false, error: e2.message };
    }
    return { ok: true };
  }

  const { data: intake, error: intakeErr } = await supabase
    .from("lead_intakes")
    .select("*")
    .eq("oportunidade_id", oportunidadeId)
    .maybeSingle();

  if (intakeErr) return { ok: false, error: intakeErr.message };
  if (!intake) {
    return {
      ok: false,
      error:
        "Este lead não tem cadastro inicial no CRM; só é possível editar nome e e-mail do lead (cartão superior) ou usar sobreposição nos campos RD.",
      status: 400,
    };
  }

  if (key === "cadastrado_por") {
    if (!trimmed) return { ok: false, error: "Valor inválido.", status: 400 };
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
    if (!emailOk) return { ok: false, error: "E-mail inválido.", status: 400 };
    const { error } = await supabase
      .from("lead_intakes")
      .update({ cadastrado_por_email: trimmed })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  /** Acrescenta uma empresa em branco (edição na ficha do lead). */
  if (key === "empresa_append") {
    const empresas = Array.isArray(intake.empresas_json) ? [...intake.empresas_json] : [];
    empresas.push({
      razao_social: "Nova empresa",
      tipo_documento: "CNPJ",
      documento: "",
    });
    const { error: upErr } = await supabase
      .from("lead_intakes")
      .update({ empresas_json: empresas })
      .eq("oportunidade_id", oportunidadeId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true };
  }

  /** Remove empresa por índice 1-based (`value` = "1", "2", …). Mantém pelo menos uma linha. */
  if (key === "empresa_delete") {
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1) {
      return { ok: false, error: "Índice de empresa inválido.", status: 400 };
    }
    const idx = n - 1;
    const empresas = Array.isArray(intake.empresas_json) ? [...intake.empresas_json] : [];
    if (empresas.length <= 1) {
      return {
        ok: false,
        error: "É necessário manter pelo menos uma empresa no cadastro.",
        status: 400,
      };
    }
    if (idx < 0 || idx >= empresas.length) {
      return { ok: false, error: "Empresa não encontrada.", status: 400 };
    }
    empresas.splice(idx, 1);
    const { error: upErr } = await supabase
      .from("lead_intakes")
      .update({ empresas_json: empresas })
      .eq("oportunidade_id", oportunidadeId);
    if (upErr) return { ok: false, error: upErr.message };

    const first = empresas[0];
    if (first && typeof first === "object") {
      const rs = (first as Record<string, unknown>).razao_social;
      const nome = typeof rs === "string" ? rs.trim() : "";
      if (nome) {
        const { error: opErr } = await supabase
          .from("oportunidades")
          .update({ solicitante_nome: nome, updated_at: new Date().toISOString() })
          .eq("id", oportunidadeId);
        if (opErr) return { ok: false, error: opErr.message };
      }
    }
    return { ok: true };
  }

  const bundleMatch = EMPRESA_BUNDLE_RE.exec(key);
  if (bundleMatch) {
    const idx = Number(bundleMatch[1]) - 1;
    let parsed: { razao_social?: unknown; tipo_documento?: unknown; documento?: unknown };
    try {
      parsed = JSON.parse(trimmed) as typeof parsed;
    } catch {
      return { ok: false, error: "Formato inválido (JSON esperado).", status: 400 };
    }
    const rs = typeof parsed.razao_social === "string" ? parsed.razao_social.trim() : "";
    const tipo =
      parsed.tipo_documento === "CPF" || parsed.tipo_documento === "CNPJ"
        ? parsed.tipo_documento
        : null;
    const doc = typeof parsed.documento === "string" ? parsed.documento.trim() : "";
    if (!rs) return { ok: false, error: "Razão social não pode ficar vazia.", status: 400 };
    if (!tipo) return { ok: false, error: "Tipo de documento deve ser CPF ou CNPJ.", status: 400 };
    if (!doc) return { ok: false, error: "Documento não pode ficar vazio.", status: 400 };

    const empresas = Array.isArray(intake.empresas_json) ? [...intake.empresas_json] : [];
    if (idx < 0 || idx >= empresas.length) {
      return { ok: false, error: "Empresa não encontrada neste cadastro.", status: 400 };
    }
    const row = empresas[idx];
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Empresa não encontrada neste cadastro.", status: 400 };
    }
    empresas[idx] = {
      ...(row as Record<string, unknown>),
      razao_social: rs,
      tipo_documento: tipo,
      documento: doc,
    };

    const { error: upEmp } = await supabase
      .from("lead_intakes")
      .update({ empresas_json: empresas })
      .eq("oportunidade_id", oportunidadeId);
    if (upEmp) return { ok: false, error: upEmp.message };

    if (idx === 0) {
      const { error: opErr } = await supabase
        .from("oportunidades")
        .update({ solicitante_nome: rs, updated_at: new Date().toISOString() })
        .eq("id", oportunidadeId);
      if (opErr) return { ok: false, error: opErr.message };
    }
    return { ok: true };
  }

  if (key === "contexto_comercial") {
    const { error } = await supabase
      .from("lead_intakes")
      .update({ contexto_comercial: trimmed || null })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "data_entrega_due") {
    const d = trimmed ? trimmed.slice(0, 10) : null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { ok: false, error: "Data inválida (use AAAA-MM-DD).", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ data_entrega_due: d })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "horario_entrega_due") {
    const t = trimmed ? (trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed) : null;
    if (t && !/^\d{2}:\d{2}$/.test(t)) {
      return { ok: false, error: "Horário inválido (use HH:MM).", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ horario_entrega_due: t })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "areas_analise") {
    const partsRaw = trimmed
      ? trimmed
          .split(/[,;\n]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const parts = [...new Set(partsRaw.map((p) => normalizePracticeAreaKey(p)))];
    const allowed = new Set(leadAreas as readonly string[]);
    const invalid = parts.filter((p) => !allowed.has(p));
    if (invalid.length) {
      return {
        ok: false,
        error: `Áreas inválidas: ${invalid.join(", ")}. Use as áreas do formulário (ex.: Cível, Tributário).`,
        status: 400,
      };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ areas_analise: parts })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "local_reuniao") {
    if (!trimmed) return { ok: false, error: "Local da reunião é obrigatório.", status: 400 };
    const { error } = await supabase
      .from("lead_intakes")
      .update({ local_reuniao: trimmed })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "data_reuniao") {
    const d = trimmed ? trimmed.slice(0, 10) : null;
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return { ok: false, error: "Data inválida.", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ data_reuniao: d })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "horario_reuniao") {
    const t = trimmed ? (trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed) : null;
    if (t && !/^\d{2}:\d{2}$/.test(t)) {
      return { ok: false, error: "Horário inválido.", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ horario_reuniao: t })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "tipo_lead") {
    if (!trimmed) return { ok: false, error: "Tipo de lead é obrigatório.", status: 400 };
    if (!(leadTypes as readonly string[]).includes(trimmed)) {
      return { ok: false, error: "Tipo de lead inválido.", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ tipo_lead: trimmed })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "tipo_indicacao") {
    if (trimmed && !(indicationTypes as readonly string[]).includes(trimmed)) {
      return { ok: false, error: "Tipo de indicação inválido.", status: 400 };
    }
    const { error } = await supabase
      .from("lead_intakes")
      .update({ tipo_indicacao: trimmed || null })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (key === "nome_indicacao") {
    const { error } = await supabase
      .from("lead_intakes")
      .update({ nome_indicacao: trimmed || null })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const empresaMatch = EMPRESA_FIELD_RE.exec(key);
  if (empresaMatch) {
    const idx = Number(empresaMatch[1]) - 1;
    const part = empresaMatch[2];
    const empresas = Array.isArray(intake.empresas_json) ? [...intake.empresas_json] : [];
    const row = empresas[idx];
    if (!row || typeof row !== "object") {
      return { ok: false, error: "Empresa não encontrada neste cadastro.", status: 400 };
    }
    const e = { ...(row as Record<string, unknown>) };
    if (part === "razao") {
      if (!trimmed) return { ok: false, error: "Razão social não pode ficar vazia.", status: 400 };
      e.razao_social = trimmed;
    } else if (part === "doc") {
      if (!trimmed) return { ok: false, error: "Documento não pode ficar vazio.", status: 400 };
      const withTipo = /^(CPF|CNPJ)\s+(.+)$/i.exec(trimmed);
      if (withTipo) {
        const t = withTipo[1].toUpperCase();
        if (t !== "CPF" && t !== "CNPJ") {
          return { ok: false, error: "Use CPF ou CNPJ antes do número.", status: 400 };
        }
        const num = withTipo[2].trim();
        if (!num) return { ok: false, error: "Informe o número do CPF/CNPJ.", status: 400 };
        e.tipo_documento = t;
        e.documento = num;
      } else {
        e.documento = trimmed;
      }
    } else if (part === "tipo") {
      if (trimmed !== "CPF" && trimmed !== "CNPJ") {
        return { ok: false, error: "Tipo de documento deve ser CPF ou CNPJ.", status: 400 };
      }
      e.tipo_documento = trimmed;
    }
    empresas[idx] = e;

    const { error } = await supabase
      .from("lead_intakes")
      .update({ empresas_json: empresas })
      .eq("oportunidade_id", oportunidadeId);
    if (error) return { ok: false, error: error.message };

    if (idx === 0 && part === "razao") {
      const { error: opErr } = await supabase
        .from("oportunidades")
        .update({ solicitante_nome: trimmed, updated_at: new Date().toISOString() })
        .eq("id", oportunidadeId);
      if (opErr) return { ok: false, error: opErr.message };
    }
    return { ok: true };
  }

  return { ok: false, error: "Campo de cadastro inicial não editável ou desconhecido.", status: 400 };
}
