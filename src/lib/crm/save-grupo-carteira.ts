import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { fetchAppUsersByEmailLookup } from "@/lib/crm/resolve-app-user-display";
import { leadDigitalPlatforms } from "@/modules/crm/application/services/new-lead-payload";
import {
  deriveGrupoAreasFromSignals,
  type GrupoAreaAtuacao,
} from "@/lib/crm/grupo-areas-atuacao";
import { prepareGrupoIntakeRowSave } from "@/lib/crm/grupo-intake-grid";
import { requestIndicatorApprovalIfNew } from "@/lib/crm/ensure-pending-indicator";
import {
  EMPTY_INDICATION_NAME_OPTIONS,
  loadIndicationNameOptions,
  type IndicationNameOptions,
} from "@/lib/crm/indication-name-options";
import type { AppUserActorRow } from "@/lib/crm/in-app-notification-meta";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchSioeGrupoAreaSignals } from "@/lib/sioe/grupo-areas";
import type { Json } from "@/lib/supabase/database.types";

export const saveGrupoCarteiraSchema = z.object({
  tipoLead: z.string(),
  tipoIndicacao: z.string().nullable().optional(),
  nomeIndicacao: z.string().nullable().optional(),
  selectedAreaKeys: z.array(z.string()),
  plataforma: z.string().nullable().optional(),
  areaCrossSelling: z.string().nullable().optional(),
  decisor: z.string().nullable().optional(),
  captadorOportunidadeId: z.string().uuid().nullable().optional(),
  captadorEmail: z.string().nullable().optional(),
});

export type SaveGrupoCarteiraInput = z.infer<typeof saveGrupoCarteiraSchema>;

const INTAKE_COLUMNS_MISSING =
  "As colunas de indicação/áreas ainda não existem neste banco. Aplique a migration local 20260918180000_grupo_intake_indicacao_areas.sql.";

function isMissingIntakeColumn(message: string): boolean {
  return /tipo_lead|tipo_indicacao|nome_indicacao|areas_atuacao|intake_filled/.test(message);
}

function isMissingOriginExtraColumn(message: string): boolean {
  return /plataforma|area_cross_selling|decisor/.test(message);
}

const ORIGIN_EXTRA_MIGRATION =
  "Plataforma, área do cross selling e decisor não foram gravados. Aplique a migration local 20261008183000_lead_plataforma_area_cross_selling.sql.";

export async function loadDerivedAreasForGrupo(
  grupoId: string,
  groupName: string,
): Promise<GrupoAreaAtuacao[]> {
  const supabase = createSupabaseAdminClient();
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("documento, sioe_pessoa_id")
    .eq("grupo_id", grupoId);
  if (error) throw error;
  try {
    const signals = await fetchSioeGrupoAreaSignals({
      documents: (clientes ?? []).map((row) => row.documento),
      sioePessoaIds: (clientes ?? [])
        .map((row) => row.sioe_pessoa_id)
        .filter((id): id is string => Boolean(id)),
      groupNames: [groupName],
    });
    return deriveGrupoAreasFromSignals(signals);
  } catch {
    return [];
  }
}

export async function loadGrupoCarteiraEdit(grupoId: string): Promise<
  | {
      ok: true;
      data: {
        id: string;
        nome: string;
        tipoLead: string | null;
        tipoIndicacao: string | null;
        nomeIndicacao: string | null;
        areasAtuacao: Json;
        derivedAreas: GrupoAreaAtuacao[];
        practiceAreas: readonly (typeof CRM_PRACTICE_AREAS)[number][];
        indicationOptions: IndicationNameOptions;
      };
    }
  | { ok: false; status: 404 | 409; error: string }
> {
  const supabase = createSupabaseAdminClient();
  const [{ data, error }, indicationOptions] = await Promise.all([
    supabase
      .from("grupos_economicos")
      .select("id, nome, tipo_lead, tipo_indicacao, nome_indicacao, areas_atuacao")
      .eq("id", grupoId)
      .maybeSingle(),
    loadIndicationNameOptions(supabase).catch(() => EMPTY_INDICATION_NAME_OPTIONS),
  ]);
  if (error) {
    if (isMissingIntakeColumn(error.message)) {
      return { ok: false, status: 409, error: INTAKE_COLUMNS_MISSING };
    }
    throw error;
  }
  if (!data) return { ok: false, status: 404, error: "Grupo econômico não encontrado." };

  return {
    ok: true,
    data: {
      id: data.id,
      nome: data.nome,
      tipoLead: data.tipo_lead,
      tipoIndicacao: data.tipo_indicacao,
      nomeIndicacao: data.nome_indicacao,
      areasAtuacao: data.areas_atuacao,
      derivedAreas: await loadDerivedAreasForGrupo(data.id, data.nome),
      practiceAreas: CRM_PRACTICE_AREAS,
      indicationOptions,
    },
  };
}

export async function saveGrupoCarteira(
  grupoId: string,
  input: SaveGrupoCarteiraInput,
  actor?: AppUserActorRow | null,
): Promise<
  | {
      ok: true;
      data: {
        tipoLead: string;
        tipoIndicacao: string | null;
        nomeIndicacao: string | null;
        areasAtuacao: GrupoAreaAtuacao[];
        plataforma: string | null;
        areaCrossSelling: string | null;
        decisor: string | null;
        captadorNome: string | null;
        warning?: string;
      };
    }
  | { ok: false; status: 404 | 409 | 422; error: string }
> {
  const supabase = createSupabaseAdminClient();
  const { data: grupo, error: grupoError } = await supabase
    .from("grupos_economicos")
    .select("id, nome, intake_filled_at")
    .eq("id", grupoId)
    .maybeSingle();
  if (grupoError) {
    if (isMissingIntakeColumn(grupoError.message)) {
      return { ok: false, status: 409, error: INTAKE_COLUMNS_MISSING };
    }
    throw grupoError;
  }
  if (!grupo) return { ok: false, status: 404, error: "Grupo econômico não encontrado." };

  const derived = await loadDerivedAreasForGrupo(grupo.id, grupo.nome);
  const prepared = prepareGrupoIntakeRowSave({
    draft: {
      grupoId: grupo.id,
      tipoLead: input.tipoLead,
      tipoIndicacao: input.tipoIndicacao,
      nomeIndicacao: input.nomeIndicacao,
      selectedAreaKeys: input.selectedAreaKeys,
    },
    derived,
    previousFilledAt: grupo.intake_filled_at,
    now: new Date().toISOString(),
  });
  if (!prepared.ok) return { ok: false, status: 422, error: prepared.error };

  const plataforma =
    prepared.value.tipoLead === "Lead Digital" ? input.plataforma?.trim() || null : null;
  const areaCrossSelling =
    prepared.value.tipoLead === "Cross Selling" ? input.areaCrossSelling?.trim() || null : null;
  const decisor = input.decisor?.trim() || null;
  if (prepared.value.tipoLead === "Lead Digital" && !plataforma) {
    return { ok: false, status: 422, error: "Plataforma é obrigatória para Lead Digital." };
  }
  if (plataforma && !(leadDigitalPlatforms as readonly string[]).includes(plataforma)) {
    return { ok: false, status: 422, error: "Plataforma inválida." };
  }
  if (prepared.value.tipoLead === "Cross Selling" && !areaCrossSelling) {
    return { ok: false, status: 422, error: "Área é obrigatória para Cross Selling." };
  }
  if (
    areaCrossSelling &&
    !(CRM_PRACTICE_AREAS as readonly string[]).includes(areaCrossSelling)
  ) {
    return { ok: false, status: 422, error: "Área inválida." };
  }

  if (input.captadorEmail?.trim() && !input.captadorOportunidadeId) {
    return {
      ok: false,
      status: 422,
      error: "Não há lead vinculado a este grupo para gravar o captador.",
    };
  }

  const now = prepared.value.intakeUpdatedAt;
  const baseUpdate = {
    tipo_lead: prepared.value.tipoLead,
    tipo_indicacao: prepared.value.tipoIndicacao,
    nome_indicacao: prepared.value.nomeIndicacao,
    areas_atuacao: prepared.value.areas as unknown as Json,
    intake_filled_at: prepared.value.intakeFilledAt,
    intake_updated_at: now,
    updated_at: now,
  };
  let warning: string | undefined;
  const { error: updateError } = await supabase
    .from("grupos_economicos")
    .update({
      ...baseUpdate,
      plataforma,
      area_cross_selling: areaCrossSelling,
      decisor,
    })
    .eq("id", grupo.id);
  if (updateError && isMissingOriginExtraColumn(updateError.message)) {
    const retry = await supabase.from("grupos_economicos").update(baseUpdate).eq("id", grupo.id);
    if (retry.error) {
      if (isMissingIntakeColumn(retry.error.message)) {
        return { ok: false, status: 409, error: INTAKE_COLUMNS_MISSING };
      }
      throw retry.error;
    }
    warning = ORIGIN_EXTRA_MIGRATION;
  } else if (updateError) {
    if (isMissingIntakeColumn(updateError.message)) {
      return { ok: false, status: 409, error: INTAKE_COLUMNS_MISSING };
    }
    throw updateError;
  }

  let captadorNome: string | null = null;
  if (input.captadorEmail !== undefined || input.captadorOportunidadeId) {
    if (input.captadorOportunidadeId) {
      const email = input.captadorEmail?.trim().toLowerCase() || null;
      if (email) {
        const users = await fetchAppUsersByEmailLookup(supabase);
        const user = users[email];
        if (!user) {
          return { ok: false, status: 422, error: "Selecione um utilizador ativo do CRM para o captador." };
        }
        captadorNome = user.fullName;
        const { error: intakeError } = await supabase
          .from("lead_intakes")
          .update({ solicitante_nome: user.fullName })
          .eq("oportunidade_id", input.captadorOportunidadeId);
        if (intakeError) return { ok: false, status: 422, error: intakeError.message };
        const { error: oppError } = await supabase
          .from("oportunidades")
          .update({ solicitante_email: email, updated_at: now })
          .eq("id", input.captadorOportunidadeId);
        if (oppError) return { ok: false, status: 422, error: oppError.message };
      } else {
        const { error: intakeError } = await supabase
          .from("lead_intakes")
          .update({ solicitante_nome: null })
          .eq("oportunidade_id", input.captadorOportunidadeId);
        if (intakeError) return { ok: false, status: 422, error: intakeError.message };
        const { error: oppError } = await supabase
          .from("oportunidades")
          .update({ solicitante_email: null, updated_at: now })
          .eq("id", input.captadorOportunidadeId);
        if (oppError) return { ok: false, status: 422, error: oppError.message };
      }
    }
  }

  await requestIndicatorApprovalIfNew({
    supabase,
    tipoLead: prepared.value.tipoLead,
    tipoIndicacao: prepared.value.tipoIndicacao,
    nomeIndicacao: prepared.value.nomeIndicacao,
    actor,
    previewSuffix: `carteira · ${grupo.nome}`,
  });

  return {
    ok: true,
    data: {
      tipoLead: prepared.value.tipoLead,
      tipoIndicacao: prepared.value.tipoIndicacao,
      nomeIndicacao: prepared.value.nomeIndicacao,
      areasAtuacao: prepared.value.areas,
      plataforma: warning ? null : plataforma,
      areaCrossSelling: warning ? null : areaCrossSelling,
      decisor: warning ? null : decisor,
      captadorNome,
      warning,
    },
  };
}
