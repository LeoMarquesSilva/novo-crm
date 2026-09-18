import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
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

  try {
    const { error: contractError } = await input.supabase.from("contratos").insert({
      id: contractId,
      cliente_id: input.clientId,
      grupo_id: input.grupoId,
      titulo: input.title,
      status: "rascunho",
      status_assinatura: "assinado",
      origem_importacao: "pdf",
      vigente_de: input.configuration.startsAt,
      prazo_indeterminado: input.configuration.indefinite,
      dia_vencimento: input.configuration.dueDay,
      indice_reajuste: input.configuration.adjustmentIndex,
      primeiro_vencimento: input.configuration.firstInvoiceAt,
      primeiro_faturamento_condicionado: input.configuration.firstInvoiceConditioned,
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
      vigente_de: input.configuration.version.effectiveFrom,
      vigente_ate: input.configuration.version.effectiveTo,
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
      configuration: input.configuration,
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
