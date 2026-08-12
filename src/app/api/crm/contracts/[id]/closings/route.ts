import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  ClosingPreparationError,
  prepareMonthlyClosing,
  type ClosingPreparationRepository,
  type PreparedRevisionWrite,
} from "@/modules/contracts/application/services/prepare-monthly-closing";
import type { BillingComponent, ContractVersionSnapshot } from "@/modules/contracts/domain/entities";
import { moneyCents } from "@/modules/contracts/domain/money";

const uuid = z.string().uuid();
const competency = z.string().regex(/^\d{4}-\d{2}-01$/);
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const cents = (value: number | null) => moneyCents(BigInt(Math.round(Number(value ?? 0) * 100)));
const jsonSafe = (value: unknown): Json => typeof value === "bigint" ? value.toString() : Array.isArray(value) ? value.map(jsonSafe) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, jsonSafe(child)])) : value as Json;

class SupabaseClosingRepository implements ClosingPreparationRepository {
  private supabase = createSupabaseAdminClient();
  async findContract(contractId: string) {
    const { data, error } = await this.supabase.from("contratos").select("status").eq("id", contractId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { lifecycle: data.status } : null;
  }
  async findApplicableVersion(contractId: string, target: string): Promise<ContractVersionSnapshot | null> {
    const { data: version, error } = await this.supabase.from("contrato_versoes").select("id,vigente_de,vigente_ate")
      .eq("contrato_id", contractId).eq("status", "ativa").lte("vigente_de", target)
      .or(`vigente_ate.is.null,vigente_ate.gte.${target}`).order("numero", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!version?.vigente_de) return null;
    const [componentsResult, allocationsResult, sharesResult, commissionsResult] = await Promise.all([
      this.supabase.from("contrato_componentes_cobranca").select("*").eq("versao_id", version.id).order("ordem"),
      this.supabase.from("contrato_rateios_area").select("*").eq("versao_id", version.id),
      this.supabase.from("contrato_participacoes_socios").select("*").eq("versao_id", version.id),
      this.supabase.from("contrato_comissoes").select("*").eq("versao_id", version.id),
    ]);
    const componentRows = componentsResult.data ?? [];
    const componentIds = componentRows.map((row) => row.id);
    const installments = componentIds.length ? (await this.supabase.from("contrato_parcelas").select("*").in("componente_id", componentIds)).data ?? [] : [];
    const components = componentRows.map((row) => ({
      id: row.id, kind: row.tipo, description: row.descricao,
      effectiveFrom: row.periodo_inicio ?? version.vigente_de!, effectiveTo: row.periodo_fim,
      ...(row.area_id ? { areaId: row.area_id } : {}),
      amountCents: cents(row.valor_fixo), chargeMode: row.modo_cobranca_variavel,
      includedQuantity: row.quantidade_incluida ?? 0, unitAmountCents: row.valor_unitario === null ? null : cents(row.valor_unitario),
      percentageBasisPoints: row.percentual === null ? undefined : Math.round(row.percentual * 100),
      requiresManualRelease: row.liberacao_manual_necessaria,
      areaAllocationEligible: row.elegivel_rateio, partnerShareEligible: row.elegivel_participacao, commissionEligible: row.elegivel_comissao,
      installments: installments.filter((entry) => entry.componente_id === row.id).map((entry) => ({ number: entry.numero, competency: entry.competencia, amountCents: cents(entry.valor) })),
      reason: row.condicao_liberacao ?? "Ajuste contratual",
    })) as unknown as BillingComponent[];
    return {
      id: version.id, effectiveFrom: version.vigente_de, effectiveTo: version.vigente_ate, components,
      areaAllocations: (allocationsResult.data ?? []).map((row): ContractVersionSnapshot["areaAllocations"][number] | null => row.modo === "percentual" ? { id: row.id, ...(row.componente_id ? { componentId: row.componente_id } : {}), areaId: row.area_id, mode: "percentual", percentageBasisPoints: Math.round(Number(row.percentual) * 100) } : row.valor === null ? null : { id: row.id, ...(row.componente_id ? { componentId: row.componente_id } : {}), areaId: row.area_id, mode: "valor", amountCents: cents(row.valor) }).filter((row): row is ContractVersionSnapshot["areaAllocations"][number] => row !== null),
      partnerShares: (sharesResult.data ?? []).flatMap((row) => row.socio_app_user_id ? [{ id: row.id, ...(row.componente_id ? { componentId: row.componente_id } : {}), beneficiaryId: row.socio_app_user_id, percentageBasisPoints: Math.round(row.percentual * 100) }] : []),
      commissions: (commissionsResult.data ?? []).map((row): ContractVersionSnapshot["commissions"][number] | null => !row.beneficiario_app_user_id ? null : row.percentual !== null ? { id: row.id, ...(row.componente_id ? { componentId: row.componente_id } : {}), beneficiaryId: row.beneficiario_app_user_id, mode: "percentual", percentageBasisPoints: Math.round(row.percentual * 100) } : row.valor === null ? null : { id: row.id, ...(row.componente_id ? { componentId: row.componente_id } : {}), beneficiaryId: row.beneficiario_app_user_id, mode: "valor", amountCents: cents(row.valor) }).filter((row): row is ContractVersionSnapshot["commissions"][number] => row !== null),
    };
  }
  async findClosing(contractId: string, target: string) {
    const { data, error } = await this.supabase.from("contrato_fechamentos").select("id,revisao_atual_id,status").eq("contrato_id", contractId).eq("competencia", target).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const revision = data.revisao_atual_id ? (await this.supabase.from("contrato_fechamento_revisoes").select("numero,status").eq("id", data.revisao_atual_id).single()).data : null;
    return { id: data.id, currentRevisionId: data.revisao_atual_id, currentRevision: revision?.numero ?? 0, currentStatus: revision?.status ?? data.status };
  }
  async listConsumptions(contractId: string, versionId: string, target: string) {
    const { data, error } = await this.supabase.from("contrato_consumos_mensais").select("*").eq("contrato_id", contractId).eq("versao_id", versionId).eq("competencia", target);
    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((row) => row.componente_id ? [{ id: row.id, componentId: row.componente_id, ...(row.area_id ? { areaId: row.area_id } : {}), kind: row.tipo as "processo" | "hora" | "quilometro" | "valor_manual", ...(row.quantidade === null ? {} : { quantity: row.quantidade }), ...(row.valor === null ? {} : { amountCents: cents(row.valor) }) }] : []);
  }
  async listManualResolutions(_contractId: string, versionId: string, target: string) {
    const { data } = await this.supabase.from("contrato_componentes_cobranca").select("id,liberado_em,valor_fixo,base_calculo").eq("versao_id", versionId).not("liberado_em", "is", null);
    return (data ?? []).map((row) => ({ componentId: row.id, competency: target, released: true, ...(row.valor_fixo === null ? {} : { amountCents: cents(row.valor_fixo) }), ...(row.base_calculo && /^\d+(\.\d+)?$/.test(row.base_calculo) ? { baseCents: cents(Number(row.base_calculo)) } : {}) }));
  }
  async createCalculatedRevision(input: PreparedRevisionWrite) {
    const { data, error } = await this.supabase.rpc("create_contract_closing_revision", {
      p_actor_id: input.actorId, p_competencia: input.competency, p_contract_id: input.contractId,
      p_expected_revision: input.expectedRevision, p_items: jsonSafe(input.items), p_totals: jsonSafe(input.totals), p_version_id: input.versionId,
    });
    if (error) throw new Error(error.message);
    const row = data[0];
    if (!row) throw new Error("Fechamento não retornado.");
    return { closingId: row.closing_id, revisionId: row.revision_id, revision: row.revision_number };
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi(); if (!auth.ok) return auth.response;
  const params = z.object({ id: uuid }).safeParse(await context.params); if (!params.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("contrato_fechamentos").select("id,competencia,status,revisao_atual_id,versao_id,updated_at").eq("contrato_id", params.data.id).order("competencia", { ascending: false });
  if (error) return json({ ok: false, code: "INTERNAL_ERROR", error: error.message }, 500);
  const revisionIds = (data ?? []).flatMap((closing) => closing.revisao_atual_id ? [closing.revisao_atual_id] : []);
  const revisions = revisionIds.length ? await supabase.from("contrato_fechamento_revisoes").select("id,numero").in("id", revisionIds) : { data: [], error: null };
  if (revisions.error) return json({ ok: false, code: "INTERNAL_ERROR", error: revisions.error.message }, 500);
  const revisionMap = new Map((revisions.data ?? []).map((revision) => [revision.id, revision.numero]));
  return json({
    ok: true,
    permissions: {
      canPrepare: canAccessContractCapability({ role: auth.profile.role, capability: "prepare_closing" }),
      canApprove: canAccessContractCapability({ role: auth.profile.role, capability: "approve_closing" }),
      canRegisterVios: canAccessContractCapability({ role: auth.profile.role, capability: "register_vios" }),
    },
    closings: (data ?? []).map((closing) => ({ ...closing, currentRevision: closing.revisao_atual_id ? revisionMap.get(closing.revisao_atual_id) ?? 0 : 0 })),
  });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuthApi(); if (!auth.ok) return auth.response;
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "prepare_closing" })) return json({ ok: false, code: "CONTRACT_FORBIDDEN" }, 403);
  const params = z.object({ id: uuid }).safeParse(await context.params);
  const body = z.object({ competency, expectedRevision: z.number().int().nonnegative() }).safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  try {
    const result = await prepareMonthlyClosing(new SupabaseClosingRepository(), { contractId: params.data.id, actorId: auth.profile.id, ...body.data });
    return json({ ok: true, ...result }, 201);
  } catch (error) {
    if (error instanceof ClosingPreparationError) return json({ ok: false, code: error.code, error: error.message }, error.code.includes("NOT_FOUND") ? 404 : 409);
    return json({ ok: false, code: "INTERNAL_ERROR", error: error instanceof Error ? error.message : "Falha ao preparar fechamento." }, 500);
  }
}
