import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import {
  deriveGrupoAreasFromSignals,
  type GrupoAreaAtuacao,
} from "@/lib/crm/grupo-areas-atuacao";
import { prepareGrupoIntakeRowSave } from "@/lib/crm/grupo-intake-grid";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchSioeGrupoAreaSignals } from "@/lib/sioe/grupo-areas";
import type { Json } from "@/lib/supabase/database.types";

export const saveGrupoCarteiraSchema = z.object({
  tipoLead: z.string(),
  tipoIndicacao: z.string().nullable().optional(),
  nomeIndicacao: z.string().nullable().optional(),
  selectedAreaKeys: z.array(z.string()),
});

export type SaveGrupoCarteiraInput = z.infer<typeof saveGrupoCarteiraSchema>;

const INTAKE_COLUMNS_MISSING =
  "As colunas de indicação/áreas ainda não existem neste banco. Aplique a migration local 20260918180000_grupo_intake_indicacao_areas.sql.";

function isMissingIntakeColumn(message: string): boolean {
  return /tipo_lead|tipo_indicacao|nome_indicacao|areas_atuacao|intake_filled/.test(message);
}

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
      };
    }
  | { ok: false; status: 404 | 409; error: string }
> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("grupos_economicos")
    .select("id, nome, tipo_lead, tipo_indicacao, nome_indicacao, areas_atuacao")
    .eq("id", grupoId)
    .maybeSingle();
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
    },
  };
}

export async function saveGrupoCarteira(
  grupoId: string,
  input: SaveGrupoCarteiraInput,
): Promise<
  | {
      ok: true;
      data: {
        tipoLead: string;
        tipoIndicacao: string | null;
        nomeIndicacao: string | null;
        areasAtuacao: GrupoAreaAtuacao[];
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

  const now = prepared.value.intakeUpdatedAt;
  const { error: updateError } = await supabase
    .from("grupos_economicos")
    .update({
      tipo_lead: prepared.value.tipoLead,
      tipo_indicacao: prepared.value.tipoIndicacao,
      nome_indicacao: prepared.value.nomeIndicacao,
      areas_atuacao: prepared.value.areas as unknown as Json,
      intake_filled_at: prepared.value.intakeFilledAt,
      intake_updated_at: now,
      updated_at: now,
    })
    .eq("id", grupo.id);
  if (updateError) {
    if (isMissingIntakeColumn(updateError.message)) {
      return { ok: false, status: 409, error: INTAKE_COLUMNS_MISSING };
    }
    throw updateError;
  }

  return {
    ok: true,
    data: {
      tipoLead: prepared.value.tipoLead,
      tipoIndicacao: prepared.value.tipoIndicacao,
      nomeIndicacao: prepared.value.nomeIndicacao,
      areasAtuacao: prepared.value.areas,
    },
  };
}
