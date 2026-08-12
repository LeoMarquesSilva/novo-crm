import { NextResponse } from "next/server";
import { z } from "zod";

import { canAccessContractCapability } from "@/lib/auth/crm-access-policy";
import { requireAuthApi } from "@/lib/auth/server";
import {
  ContractConfigurationError,
  saveContractConfiguration,
} from "@/modules/contracts/application/services/save-contract-configuration";
import type { ContractConfigurationInput } from "@/modules/contracts/domain/contract-validation";
import { SupabaseContractRepository } from "@/modules/contracts/infrastructure/supabase-contract-repository";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.union([
  z.string().regex(/^-?\d+$/),
  z.number().int().safe(),
]).transform((value) => BigInt(value));

const installment = z.object({
  number: z.number().int().positive(),
  competency: date,
  amountCents: cents,
});

const component = z.object({
  id: uuid,
  kind: z.enum([
    "mensal_fixo", "mensal_preco_fechado", "mensal_escalonado", "variavel_processo",
    "variavel_hora", "mensal_condicionado", "spot", "manutencao", "exito_percentual",
    "exito_valor_fixo", "acordo", "despesa_km", "reembolso", "ajuste",
  ]),
  description: z.string().trim().min(1),
  effectiveFrom: date,
  effectiveTo: date.nullable(),
  areaId: uuid.optional(),
  tax: z.object({
    mode: z.enum(["added", "included"]),
    percentageBasisPoints: z.number().int().min(0),
  }).optional(),
  areaAllocationEligible: z.boolean().optional(),
  partnerShareEligible: z.boolean().optional(),
  commissionEligible: z.boolean().optional(),
  amountCents: cents.optional(),
  installments: z.array(installment).optional(),
  requiresManualRelease: z.boolean().optional(),
  chargeMode: z.enum(["quantidade_total", "excedente"]).optional(),
  includedQuantity: z.number().min(0).optional(),
  unitAmountCents: cents.nullable().optional(),
  percentageBasisPoints: z.number().int().min(0).optional(),
  reason: z.string().trim().min(1).optional(),
}).superRefine((value, context) => {
  const fixedAmountKinds = [
    "mensal_fixo", "mensal_escalonado", "manutencao", "mensal_condicionado",
    "exito_valor_fixo", "ajuste",
  ];
  if (fixedAmountKinds.includes(value.kind) && value.amountCents === undefined) {
    context.addIssue({ code: "custom", path: ["amountCents"], message: "Valor obrigatório para o componente." });
  }
  if (value.kind === "mensal_preco_fechado" && !value.installments?.length) {
    context.addIssue({ code: "custom", path: ["installments"], message: "Informe ao menos uma parcela." });
  }
  if (["variavel_processo", "variavel_hora", "despesa_km"].includes(value.kind)) {
    if (!value.chargeMode) context.addIssue({ code: "custom", path: ["chargeMode"], message: "Modo de cobrança obrigatório." });
    if (value.includedQuantity === undefined) context.addIssue({ code: "custom", path: ["includedQuantity"], message: "Quantidade incluída obrigatória." });
    if (!("unitAmountCents" in value)) context.addIssue({ code: "custom", path: ["unitAmountCents"], message: "Tarifa unitária deve ser informada, ainda que nula." });
  }
  if (value.kind === "exito_percentual" && value.percentageBasisPoints === undefined) {
    context.addIssue({ code: "custom", path: ["percentageBasisPoints"], message: "Percentual obrigatório." });
  }
  if (["mensal_condicionado", "exito_valor_fixo", "exito_percentual", "reembolso"].includes(value.kind) && value.requiresManualRelease !== true) {
    context.addIssue({ code: "custom", path: ["requiresManualRelease"], message: "Liberação manual obrigatória." });
  }
  if (value.kind === "ajuste" && !value.reason) {
    context.addIssue({ code: "custom", path: ["reason"], message: "Motivo do ajuste obrigatório." });
  }
});

const areaAllocation = z.discriminatedUnion("mode", [
  z.object({ id: uuid, componentId: uuid.optional(), areaId: uuid, mode: z.literal("percentual"), percentageBasisPoints: z.number().int().min(0) }),
  z.object({ id: uuid, componentId: uuid.optional(), areaId: uuid, mode: z.literal("valor"), amountCents: cents }),
]);

const commission = z.discriminatedUnion("mode", [
  z.object({ id: uuid, componentId: uuid.optional(), beneficiaryId: uuid, mode: z.literal("percentual"), percentageBasisPoints: z.number().int().min(0) }),
  z.object({ id: uuid, componentId: uuid.optional(), beneficiaryId: uuid, mode: z.literal("valor"), amountCents: cents }),
]);

const configuration = z.object({
  clientId: uuid.nullable(),
  startsAt: date.nullable(),
  firstInvoiceAt: date.nullable(),
  firstInvoiceConditioned: z.boolean(),
  responsibles: z.array(z.object({ id: uuid, role: z.string().trim().min(1) })),
  areas: z.array(z.object({
    id: uuid,
    areaKey: z.string().trim().min(1),
    includedProcesses: z.number().min(0).nullable().optional(),
    includedHours: z.number().min(0).nullable().optional(),
    processExcessRateCents: cents.nullable().optional(),
    hourExcessRateCents: cents.nullable().optional(),
  })),
  version: z.object({
    id: uuid,
    effectiveFrom: date,
    effectiveTo: date.nullable(),
    components: z.array(component),
    areaAllocations: z.array(areaAllocation),
    partnerShares: z.array(z.object({
      id: uuid,
      componentId: uuid.optional(),
      beneficiaryId: uuid,
      percentageBasisPoints: z.number().int().min(0),
    })),
    commissions: z.array(commission),
  }),
});

const bodySchema = z.object({
  expectedVersionUpdatedAt: z.string().datetime({ offset: true }),
  configuration,
});

function json(body: object, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuthApi();
  if (!auth.ok) {
    const code = auth.response.status === 401 ? "UNAUTHENTICATED" : "PROFILE_REQUIRED";
    return json({ ok: false, code, error: "Autenticação necessária.", issues: [] }, auth.response.status);
  }
  if (!canAccessContractCapability({ role: auth.profile.role, capability: "configure" })) {
    return json({ ok: false, code: "CONTRACT_FORBIDDEN", error: "Sem permissão para configurar contratos.", issues: [] }, 403);
  }

  const params = z.object({ id: uuid }).safeParse(await context.params);
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST", error: "Corpo JSON inválido.", issues: [] }, 400);
  }
  const body = bodySchema.safeParse(raw);
  if (!params.success || !body.success) {
    return json({
      ok: false,
      code: "INVALID_REQUEST",
      error: "Requisição inválida.",
      issues: [...(params.success ? [] : params.error.issues), ...(body.success ? [] : body.error.issues)],
    }, 400);
  }

  try {
    const result = await saveContractConfiguration(new SupabaseContractRepository(), {
      role: auth.profile.role,
      actorId: auth.profile.id,
      contractId: params.data.id,
      expectedVersionUpdatedAt: body.data.expectedVersionUpdatedAt,
      configuration: body.data.configuration as ContractConfigurationInput,
    });
    return json({ ok: true, updatedAt: result.updatedAt }, 200);
  } catch (error) {
    if (error instanceof ContractConfigurationError) {
      const status = error.code === "CONTRACT_CONFIGURATION_INVALID" ? 422
        : error.code === "CONTRACT_NOT_FOUND" ? 404
        : error.code === "CONTRACT_FORBIDDEN" ? 403
        : 409;
      return json({ ok: false, code: error.code, error: error.message, issues: error.issues ?? [] }, status);
    }
    console.error("Falha ao salvar configuração contratual", error);
    return json({ ok: false, code: "INTERNAL_ERROR", error: "Falha ao salvar configuração contratual.", issues: [] }, 500);
  }
}
