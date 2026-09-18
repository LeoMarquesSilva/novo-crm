import { z } from "zod";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import {
  deriveGrupoAreasFromSignals,
  mergeGrupoPracticeAreas,
  parseAreasAtuacao,
  prefillGrupoAreaKeys,
} from "@/lib/crm/grupo-areas-atuacao";
import {
  campaignTokenPayload,
  GRUPO_INTAKE_CAMPAIGN_SCOPE,
  isCampaignIntakeToken,
  resolveCampaignIntakeAction,
  type CampaignIntakeTokenRecord,
} from "@/lib/crm/grupo-intake-campaign";
import {
  prepareGrupoIntakeRowSave,
  type GrupoIntakeGridRow,
} from "@/lib/crm/grupo-intake-grid";
import { parseGrupoIntakeIndication } from "@/lib/crm/grupo-intake-indication";
import {
  carteiraIntakePublicBaseUrl,
  createGrupoIntakeToken,
  grupoIntakeExpiresAt,
  grupoIntakePublicPath,
  hashGrupoIntakeToken,
  isGrupoIntakeTokenFormat,
  GRUPO_INTAKE_DEFAULT_TTL_DAYS,
} from "@/lib/crm/grupo-intake-token";
import { fetchGruposEconomicosCarteira } from "@/lib/crm/fetch-grupos-economicos";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchOrqestraiClientGroups } from "@/lib/orqestrai/client-groups";
import {
  buildOrqestraiGroupLookup,
  enrichCarteiraGrupoOrqestrai,
} from "@/lib/crm/carteira-grupo-enrichment";
import { fetchSioeGrupoAreaSignals, fetchSioeGrupoAreaSignalsByGroups } from "@/lib/sioe/grupo-areas";
import type { Json } from "@/lib/supabase/database.types";

export type { GrupoIntakeGridRow };

export const grupoIntakeRowSubmitSchema = z.object({
  grupoId: z.string().uuid(),
  tipoLead: z.string(),
  tipoIndicacao: z.string().nullable().optional(),
  nomeIndicacao: z.string().nullable().optional(),
  selectedAreaKeys: z.array(z.string()),
});

/** @deprecated formulário 1 grupo; o POST público agora espera grupoId. */
export const grupoIntakeSubmitSchema = grupoIntakeRowSubmitSchema;

export type GrupoIntakeGridData = {
  expiresAt: string;
  groups: GrupoIntakeGridRow[];
  practiceAreas: readonly typeof CRM_PRACTICE_AREAS[number][];
};

type IntakeTokenRow = {
  id: string;
  grupo_id: string | null;
  expires_at: string;
  used_at: string | null;
  payload: Json;
  scope?: string | null;
};

async function findTokenByRaw(rawToken: string): Promise<IntakeTokenRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("grupo_intake_tokens")
    .select("id, grupo_id, expires_at, used_at, payload, scope")
    .eq("token_hash", hashGrupoIntakeToken(rawToken))
    .maybeSingle();
  if (error) throw error;
  return (data as IntakeTokenRow | null) ?? null;
}

function invalidTokenResponse(
  token: IntakeTokenRow | null,
): { ok: false; status: 400 | 404 | 410; error: string } | null {
  if (!token) return { ok: false, status: 404, error: "Este link não existe ou já foi substituído." };
  if (new Date(token.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 410, error: "Este link expirou. Peça um novo ao CRM." };
  }
  if (!isCampaignIntakeToken({ grupoId: token.grupo_id, scope: token.scope })) {
    return {
      ok: false,
      status: 410,
      error: "Este link pontual foi substituído pela grade única. Peça o link de preenchimento ao CRM.",
    };
  }
  return null;
}

async function loadDerivedAreasByGrupo(grupos: Array<{ id: string; nome: string }>) {
  const derived = new Map<string, ReturnType<typeof deriveGrupoAreasFromSignals>>();
  if (grupos.length === 0) return derived;

  const supabase = createSupabaseAdminClient();
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("documento, sioe_pessoa_id, grupo_id");
  if (error) throw error;

  const byGrupo = new Map<string, { documents: string[]; sioePessoaIds: string[] }>();
  for (const row of clientes ?? []) {
    if (!row.grupo_id) continue;
    const current = byGrupo.get(row.grupo_id) ?? { documents: [], sioePessoaIds: [] };
    if (row.documento) current.documents.push(row.documento);
    if (row.sioe_pessoa_id) current.sioePessoaIds.push(row.sioe_pessoa_id);
    byGrupo.set(row.grupo_id, current);
  }

  try {
    const signals = await fetchSioeGrupoAreaSignalsByGroups(
      grupos.map((grupo) => {
        const ids = byGrupo.get(grupo.id);
        return {
          id: grupo.id,
          nome: grupo.nome,
          documents: ids?.documents ?? [],
          sioePessoaIds: ids?.sioePessoaIds ?? [],
        };
      }),
    );
    for (const grupo of grupos) {
      derived.set(grupo.id, deriveGrupoAreasFromSignals(signals.get(grupo.id) ?? {
        rateioDepartamentos: [],
        pastaAreas: [],
        pastaDepartamentos: [],
      }));
    }
  } catch {
    for (const grupo of grupos) derived.set(grupo.id, []);
  }
  return derived;
}

async function loadDerivedAreasForGrupo(grupoId: string, groupName: string) {
  const supabase = createSupabaseAdminClient();
  const { data: clientes, error } = await supabase
    .from("clientes")
    .select("documento, sioe_pessoa_id")
    .eq("grupo_id", grupoId);
  if (error) throw error;
  const signals = await fetchSioeGrupoAreaSignals({
    documents: (clientes ?? []).map((row) => row.documento),
    sioePessoaIds: (clientes ?? []).map((row) => row.sioe_pessoa_id).filter((id): id is string => Boolean(id)),
    groupNames: [groupName],
  });
  return deriveGrupoAreasFromSignals(signals);
}

export async function loadGrupoIntakeGrid(
  rawToken: string,
): Promise<{ ok: true; data: GrupoIntakeGridData } | { ok: false; status: 400 | 404 | 410; error: string }> {
  if (!isGrupoIntakeTokenFormat(rawToken)) {
    return { ok: false, status: 400, error: "Link inválido." };
  }
  const token = await findTokenByRaw(rawToken);
  const invalid = invalidTokenResponse(token);
  if (invalid || !token) {
    return invalid ?? { ok: false, status: 404, error: "Este link não existe ou já foi substituído." };
  }

  const supabase = createSupabaseAdminClient();
  const [{ data: grupos, error: gruposError }, orqestraiGroups] = await Promise.all([
    fetchGruposEconomicosCarteira(supabase),
    fetchOrqestraiClientGroups().catch(() => null),
  ]);
  if (gruposError) throw new Error(gruposError.message);

  const orqestraiLookup = buildOrqestraiGroupLookup(orqestraiGroups);
  const derivedByGrupo = await loadDerivedAreasByGrupo(grupos);

  const groups: GrupoIntakeGridRow[] = grupos.map((grupo) => {
    const savedIndication = parseGrupoIntakeIndication({
      tipoLead: grupo.tipo_lead,
      tipoIndicacao: grupo.tipo_indicacao,
      nomeIndicacao: grupo.nome_indicacao,
    });
    const derivedAreas = derivedByGrupo.get(grupo.id) ?? [];
    const savedAreas = parseAreasAtuacao(grupo.areas_atuacao);
    const enriched = enrichCarteiraGrupoOrqestrai(grupo, orqestraiLookup);
    const orqestraiDerived = mergeGrupoPracticeAreas({
      responsibleArea: enriched.responsibleArea,
      legalAreas: enriched.legalAreas,
    }).map((areaKey) => ({ areaKey, sources: ["pasta" as const] }));
    return {
      id: grupo.id,
      nome: grupo.nome,
      clienteStatus: enriched.clienteStatus,
      alreadyFilled: Boolean(grupo.intake_filled_at),
      indication: savedIndication.ok ? savedIndication.value : null,
      derivedAreas,
      prefilledAreaKeys: prefillGrupoAreaKeys({
        derived: [...derivedAreas, ...orqestraiDerived],
        saved: savedAreas,
      }),
    };
  });

  return {
    ok: true,
    data: {
      expiresAt: token.expires_at,
      groups,
      practiceAreas: CRM_PRACTICE_AREAS,
    },
  };
}

/** Compatível com a página pública antiga. */
export async function loadGrupoIntakeForm(rawToken: string) {
  return loadGrupoIntakeGrid(rawToken);
}

export async function submitGrupoIntakeRow(
  rawToken: string,
  body: z.infer<typeof grupoIntakeRowSubmitSchema>,
): Promise<{ ok: true } | { ok: false; status: 400 | 404 | 410 | 422; error: string }> {
  if (!isGrupoIntakeTokenFormat(rawToken)) {
    return { ok: false, status: 400, error: "Link inválido." };
  }
  const token = await findTokenByRaw(rawToken);
  const invalid = invalidTokenResponse(token);
  if (invalid || !token) {
    return invalid ?? { ok: false, status: 404, error: "Este link não existe ou já foi substituído." };
  }

  const supabase = createSupabaseAdminClient();
  const { data: grupo, error: grupoError } = await supabase
    .from("grupos_economicos")
    .select("id, nome, intake_filled_at")
    .eq("id", body.grupoId)
    .maybeSingle();
  if (grupoError) throw grupoError;
  if (!grupo) return { ok: false, status: 404, error: "Grupo econômico não encontrado." };

  let derivedAreas: ReturnType<typeof deriveGrupoAreasFromSignals> = [];
  try {
    derivedAreas = await loadDerivedAreasForGrupo(grupo.id, grupo.nome);
  } catch {
    derivedAreas = [];
  }

  const prepared = prepareGrupoIntakeRowSave({
    draft: body,
    derived: derivedAreas,
    previousFilledAt: grupo.intake_filled_at,
    now: new Date().toISOString(),
  });
  if (!prepared.ok) return { ok: false, status: 422, error: prepared.error };

  const now = prepared.value.intakeUpdatedAt;
  const { error: updateGrupoError } = await supabase
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
  if (updateGrupoError) throw updateGrupoError;

  const { error: updateTokenError } = await supabase
    .from("grupo_intake_tokens")
    .update({
      used_at: now,
      payload: {
        ...campaignTokenPayload(rawToken),
        lastGrupoId: grupo.id,
      } as unknown as Json,
    })
    .eq("id", token.id);
  if (updateTokenError) throw updateTokenError;

  return { ok: true };
}

export async function submitGrupoIntake(
  rawToken: string,
  body: z.infer<typeof grupoIntakeRowSubmitSchema>,
) {
  return submitGrupoIntakeRow(rawToken, body);
}

async function listActiveCampaignTokens(): Promise<CampaignIntakeTokenRecord[]> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("grupo_intake_tokens")
    .select("id, grupo_id, expires_at, payload, scope")
    .eq("scope", GRUPO_INTAKE_CAMPAIGN_SCOPE)
    .is("grupo_id", null)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    grupoId: row.grupo_id,
    scope: row.scope,
    expiresAt: row.expires_at,
    payload: row.payload,
  }));
}

async function expireTokenIds(ids: string[], nowIso: string) {
  if (!ids.length) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("grupo_intake_tokens")
    .update({ expires_at: nowIso })
    .in("id", ids);
  if (error) throw error;
}

export async function ensureCarteiraIntakeLink(input: {
  request: Request;
  createdBy: string;
  expiresInDays?: number;
  rotate?: boolean;
}): Promise<{ url: string; expiresAt: string; reused: boolean }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const resolved = resolveCampaignIntakeAction({
    activeTokens: await listActiveCampaignTokens(),
    now,
    rotate: input.rotate,
  });

  if (resolved.expireIds.length) await expireTokenIds(resolved.expireIds, nowIso);

  if (resolved.action === "reuse") {
    return {
      url: `${carteiraIntakePublicBaseUrl(input.request)}${grupoIntakePublicPath(resolved.rawToken)}`,
      expiresAt: resolved.token.expiresAt,
      reused: true,
    };
  }

  const minted = createGrupoIntakeToken();
  const expiresAt = grupoIntakeExpiresAt(input.expiresInDays ?? GRUPO_INTAKE_DEFAULT_TTL_DAYS, now);
  const expiresIso = expiresAt.toISOString();
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("grupo_intake_tokens").insert({
    token_hash: minted.hash,
    scope: GRUPO_INTAKE_CAMPAIGN_SCOPE,
    grupo_id: null,
    expires_at: expiresIso,
    created_by: input.createdBy,
    payload: campaignTokenPayload(minted.raw) as unknown as Json,
  });
  if (error) throw error;

  return {
    url: `${carteiraIntakePublicBaseUrl(input.request)}${grupoIntakePublicPath(minted.raw)}`,
    expiresAt: expiresIso,
    reused: false,
  };
}
