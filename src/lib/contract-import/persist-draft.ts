import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SioeRateioSnapshot } from "@/lib/contract-import/sioe-rateio";
import { applyAnnualRenewalDefaults } from "@/lib/crm/contract-renewal-date";
import { fetchSioeHonorariosRateio } from "@/lib/sioe/rateios";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ContractConfigurationInput } from "@/modules/contracts/domain/contract-validation";
import type { Database, Json } from "@/lib/supabase/database.types";

function centsToReais(cents: unknown): number | null {
  if (cents == null) return null;
  const asNumber = typeof cents === "bigint" ? Number(cents) : Number(cents);
  if (!Number.isFinite(asNumber)) return null;
  return asNumber / 100;
}

export async function createImportedContractDraft(input: {
  supabase: SupabaseClient<Database>;
  actorId: string;
  title: string;
  grupoId: string | null;
  clientId: string | null;
  configuration: ContractConfigurationInput;
  extras: Json;
}): Promise<{ contractId: string; versionId: string }> {
  const now = new Date().toISOString();
  const contractId = randomUUID();
  const versionId = input.configuration.version.id || randomUUID();
  const configuration = applyAnnualRenewalDefaults(input.configuration);

  try {
    const { error: contractError } = await input.supabase.from("contratos").insert({
      id: contractId,
      cliente_id: input.clientId,
      grupo_id: input.grupoId,
      titulo: input.title,
      status: "rascunho",
      status_assinatura: "assinado",
      origem_importacao: "pdf",
      vigente_de: configuration.startsAt,
      prazo_indeterminado: configuration.indefinite,
      dia_vencimento: configuration.dueDay,
      data_base_renovacao: configuration.renewalDate,
      data_alerta_renovacao: configuration.renewalAlertDate,
      indice_reajuste: configuration.adjustmentIndex,
      primeiro_vencimento: configuration.firstInvoiceAt,
      primeiro_faturamento_condicionado: configuration.firstInvoiceConditioned,
      criado_por: input.actorId,
      atualizado_por: input.actorId,
      created_at: now,
      updated_at: now,
    });
    if (contractError) throw new Error(contractError.message);

    const { error: versionError } = await input.supabase.from("contrato_versoes").insert({
      id: versionId,
      contrato_id: contractId,
      numero: 1,
      status: "rascunho",
      vigente_de: configuration.version.effectiveFrom,
      vigente_ate: configuration.version.effectiveTo,
      origem_snapshot: input.extras,
      criado_por: input.actorId,
      atualizado_por: input.actorId,
      created_at: now,
      updated_at: now,
    });
    if (versionError) throw new Error(versionError.message);

    await writeImportedVersionContents({
      supabase: input.supabase,
      versionId,
      configuration,
      now,
    });

    return { contractId, versionId };
  } catch (error) {
    await input.supabase.from("contratos").delete().eq("id", contractId);
    throw error;
  }
}

export async function writeImportedVersionContents(input: {
  supabase: SupabaseClient<Database>;
  versionId: string;
  configuration: ContractConfigurationInput;
  now?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const existingAreas = await input.supabase
    .from("contrato_areas")
    .select("id, area_key")
    .eq("versao_id", input.versionId);
  if (existingAreas.error) throw new Error(existingAreas.error.message);
  const areaIdByKey = new Map((existingAreas.data ?? []).map((row) => [row.area_key, row.id]));

  for (const area of input.configuration.areas) {
    if (areaIdByKey.has(area.areaKey)) continue;
    const { error } = await input.supabase.from("contrato_areas").insert({
      id: area.id,
      versao_id: input.versionId,
      area_key: area.areaKey,
      processos_incluidos: area.includedProcesses ?? null,
      horas_incluidas: area.includedHours ?? null,
      valor_excedente_processo: centsToReais(area.processExcessRateCents ?? null),
      valor_excedente_hora: centsToReais(area.hourExcessRateCents ?? null),
      created_at: now,
      updated_at: now,
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    areaIdByKey.set(area.areaKey, area.id);
  }

  const resolveAreaId = (areaId: string | undefined | null) => {
    if (!areaId) return null;
    const configArea = input.configuration.areas.find((area) => area.id === areaId);
    return (configArea ? areaIdByKey.get(configArea.areaKey) : null) ?? areaId;
  };

  const { count: existingComponents, error: componentCountError } = await input.supabase
    .from("contrato_componentes_cobranca")
    .select("id", { count: "exact", head: true })
    .eq("versao_id", input.versionId);
  if (componentCountError) throw new Error(componentCountError.message);
  if (!existingComponents) {
    for (const [index, component] of input.configuration.version.components.entries()) {
      const amount = "amountCents" in component ? centsToReais(component.amountCents) : null;
      const unit =
        "unitAmountCents" in component ? centsToReais(component.unitAmountCents ?? null) : null;
      const percent =
        "percentageBasisPoints" in component && component.percentageBasisPoints != null
          ? Number(component.percentageBasisPoints) / 100
          : null;
      const { error } = await input.supabase.from("contrato_componentes_cobranca").insert({
        id: component.id,
        versao_id: input.versionId,
        area_id: resolveAreaId(component.areaId),
        tipo: component.kind,
        descricao: component.description,
        periodo_inicio: component.effectiveFrom,
        periodo_fim: component.effectiveTo,
        valor_fixo: amount,
        valor_unitario: unit,
        quantidade_incluida: "includedQuantity" in component ? component.includedQuantity ?? null : null,
        percentual: percent,
        modo_cobranca_variavel: "chargeMode" in component ? component.chargeMode ?? null : null,
        liberacao_manual_necessaria:
          "requiresManualRelease" in component ? Boolean(component.requiresManualRelease) : false,
        tratamento_tributario: component.tax ? JSON.stringify(component.tax) : null,
        elegivel_rateio: Boolean(component.areaAllocationEligible),
        elegivel_participacao: Boolean(component.partnerShareEligible),
        elegivel_comissao: Boolean(component.commissionEligible),
        ordem: index,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(error.message);

      if (component.kind === "mensal_preco_fechado" && component.installments) {
        for (const installment of component.installments) {
          const { error: parcelaError } = await input.supabase.from("contrato_parcelas").insert({
            componente_id: component.id,
            numero: installment.number,
            competencia: installment.competency,
            vencimento: installment.competency,
            valor: centsToReais(installment.amountCents) ?? 0,
            created_at: now,
            updated_at: now,
          });
          if (parcelaError) throw new Error(parcelaError.message);
        }
      }
    }
  }

  const { count: existingAllocations, error: allocationCountError } = await input.supabase
    .from("contrato_rateios_area")
    .select("id", { count: "exact", head: true })
    .eq("versao_id", input.versionId);
  if (allocationCountError) throw new Error(allocationCountError.message);
  if (!existingAllocations) {
    const areaIdByConfigId = new Map(input.configuration.areas.map((area) => [area.id, areaIdByKey.get(area.areaKey) ?? area.id]));
    for (const allocation of input.configuration.version.areaAllocations) {
      const areaId = areaIdByConfigId.get(allocation.areaId) ?? allocation.areaId;
      const { error } = await input.supabase.from("contrato_rateios_area").insert({
        id: allocation.id,
        versao_id: input.versionId,
        componente_id: allocation.componentId ?? null,
        area_id: areaId,
        modo: allocation.mode,
        percentual: allocation.mode === "percentual" ? Number(allocation.percentageBasisPoints) / 100 : null,
        valor: allocation.mode === "valor" ? centsToReais(allocation.amountCents) : null,
        created_at: now,
        updated_at: now,
      });
      if (error) throw new Error(error.message);
    }
  }
}

const RATEIO_ELIGIBLE_KINDS = new Set([
  "mensal_fixo",
  "mensal_escalonado",
  "mensal_preco_fechado",
  "variavel_processo",
]);

function asSnapshotRecord(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

export async function syncSioeRateioOntoVersion(input: {
  supabase: SupabaseClient<Database>;
  versionId: string;
  snapshot: SioeRateioSnapshot | null;
  origemSnapshot?: Json | null;
}): Promise<{ applied: boolean; source: "sioe" | "single_area" | null }> {
  const now = new Date().toISOString();
  const [areasResult, componentsResult, allocationsResult, versionResult] = await Promise.all([
    input.supabase.from("contrato_areas").select("id, area_key").eq("versao_id", input.versionId),
    input.supabase.from("contrato_componentes_cobranca").select("id, tipo").eq("versao_id", input.versionId),
    input.supabase.from("contrato_rateios_area").select("id").eq("versao_id", input.versionId),
    input.supabase.from("contrato_versoes").select("origem_snapshot").eq("id", input.versionId).maybeSingle(),
  ]);
  if (areasResult.error) throw new Error(areasResult.error.message);
  if (componentsResult.error) throw new Error(componentsResult.error.message);
  if (allocationsResult.error) throw new Error(allocationsResult.error.message);
  if (versionResult.error) throw new Error(versionResult.error.message);
  if ((allocationsResult.data ?? []).length > 0) return { applied: false, source: null };

  const areaIdByKey = new Map((areasResult.data ?? []).map((row) => [row.area_key, row.id]));
  const source: "sioe" | "single_area" | null = input.snapshot?.shares.length
    ? "sioe"
    : areaIdByKey.size === 1
      ? "single_area"
      : null;
  const shares = input.snapshot?.shares.length
    ? input.snapshot.shares
    : source === "single_area"
      ? [{ areaKey: [...areaIdByKey.keys()][0] ?? "", percentageBasisPoints: 10_000 }]
      : [];
  if (!shares.length || (shares.length === 1 && !shares[0]?.areaKey)) {
    return { applied: false, source: null };
  }

  for (const share of shares) {
    if (areaIdByKey.has(share.areaKey)) continue;
    const id = randomUUID();
    const { error } = await input.supabase.from("contrato_areas").insert({
      id,
      versao_id: input.versionId,
      area_key: share.areaKey,
      processos_incluidos: null,
      horas_incluidas: null,
      valor_excedente_processo: null,
      valor_excedente_hora: null,
      created_at: now,
      updated_at: now,
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    areaIdByKey.set(share.areaKey, id);
  }

  for (const share of shares) {
    const areaId = areaIdByKey.get(share.areaKey);
    if (!areaId) continue;
    const { error } = await input.supabase.from("contrato_rateios_area").insert({
      id: randomUUID(),
      versao_id: input.versionId,
      componente_id: null,
      area_id: areaId,
      modo: "percentual",
      percentual: share.percentageBasisPoints / 100,
      valor: null,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }

  for (const component of componentsResult.data ?? []) {
    if (!RATEIO_ELIGIBLE_KINDS.has(component.tipo)) continue;
    const { error } = await input.supabase
      .from("contrato_componentes_cobranca")
      .update({ elegivel_rateio: true, updated_at: now })
      .eq("id", component.id);
    if (error) throw new Error(error.message);
  }

  if (input.snapshot || input.origemSnapshot) {
    const current = asSnapshotRecord((input.origemSnapshot ?? versionResult.data?.origem_snapshot ?? {}) as Json);
    const { error } = await input.supabase
      .from("contrato_versoes")
      .update({
        origem_snapshot: {
          ...current,
          ...(input.snapshot ? { sioeRateio: input.snapshot } : {}),
        } as Json,
        updated_at: now,
      })
      .eq("id", input.versionId);
    if (error) throw new Error(error.message);
  }

  return { applied: true, source };
}

export async function maybeBackfillImportedDraftRateio(
  contractId: string,
): Promise<{ applied: boolean; source: "sioe" | "single_area" | null }> {
  const supabase = createSupabaseAdminClient();
  const { data: contract, error } = await supabase
    .from("contratos")
    .select("id, origem_importacao, cliente_id, grupo_id, status")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contract || contract.origem_importacao !== "pdf" || contract.status !== "rascunho") {
    return { applied: false, source: null };
  }

  const { data: version, error: versionError } = await supabase
    .from("contrato_versoes")
    .select("id, origem_snapshot")
    .eq("contrato_id", contractId)
    .eq("status", "rascunho")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) return { applied: false, source: null };

  const { count, error: countError } = await supabase
    .from("contrato_rateios_area")
    .select("id", { count: "exact", head: true })
    .eq("versao_id", version.id);
  if (countError) throw new Error(countError.message);
  if (count) return { applied: false, source: null };

  const [{ data: cliente }, { data: grupo }] = await Promise.all([
    contract.cliente_id
      ? supabase.from("clientes").select("documento").eq("id", contract.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    contract.grupo_id
      ? supabase.from("grupos_economicos").select("nome").eq("id", contract.grupo_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const snapshot = await fetchSioeHonorariosRateio(cliente?.documento ? [cliente.documento] : [], {
    groupNames: grupo?.nome ? [grupo.nome] : [],
  });
  return syncSioeRateioOntoVersion({
    supabase,
    versionId: version.id,
    snapshot,
    origemSnapshot: version.origem_snapshot,
  });
}
