import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  insertInvestmentSubtype,
  insertInvestmentType,
  insertScopeSubtype,
  insertScopeType,
  nextInvestmentSubtypeSortOrder,
  nextScopeSubtypeSortOrder,
} from "@/lib/crm/proposal-catalog-write";
import { CRM_PRACTICE_AREAS } from "@/lib/crm/crm-areas";
import { recomputePlaceholderKeys } from "@/lib/scope-import/schemas";

const patchSchema = z.object({
  template: z.string().optional(),
  areaKey: z.string().optional(),
  typeLabel: z.string().optional(),
  subtypeLabel: z.string().optional(),
  conceito: z.string().optional(),
});

const approveSchema = z.object({
  action: z.literal("aprovar"),
  target: z.union([
    z.object({ scopeTypeId: z.string().uuid() }),
    z.object({ investmentTypeId: z.string().uuid() }),
    z.object({
      newType: z.object({
        areaKey: z.string().optional(),
        label: z.string().min(1),
      }),
    }),
  ]),
});

const rejectSchema = z.object({
  action: z.literal("rejeitar"),
  reason: z.string().optional(),
});

const decisionSchema = z.discriminatedUnion("action", [approveSchema, rejectSchema]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: current, error: loadError } = await supabase
      .from("scope_import_suggestions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!current) {
      return NextResponse.json({ ok: false, error: "Sugestão não encontrada." }, { status: 404 });
    }
    if (current.status !== "pendente") {
      return NextResponse.json(
        { ok: false, error: "Só é possível editar sugestões pendentes." },
        { status: 409 },
      );
    }

    const template = body.template ?? current.template ?? "";
    const conceito = body.conceito ?? current.conceito ?? "";
    const patch = {
      template: body.template ?? current.template,
      area_key: body.areaKey ?? current.area_key,
      type_label: body.typeLabel ?? current.type_label,
      subtype_label: body.subtypeLabel ?? current.subtype_label,
      conceito: body.conceito ?? current.conceito,
      placeholder_keys: recomputePlaceholderKeys(template, conceito),
    };

    if (patch.area_key && !CRM_PRACTICE_AREAS.includes(patch.area_key as (typeof CRM_PRACTICE_AREAS)[number])) {
      return NextResponse.json({ ok: false, error: "Área inválida." }, { status: 422 });
    }

    const { data: updated, error } = await supabase
      .from("scope_import_suggestions")
      .update(patch)
      .eq("id", id)
      .eq("status", "pendente")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Sugestão já foi revisada." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao editar sugestão.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = decisionSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    const { data: suggestion, error: loadError } = await supabase
      .from("scope_import_suggestions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!suggestion) {
      return NextResponse.json({ ok: false, error: "Sugestão não encontrada." }, { status: 404 });
    }
    if (suggestion.status !== "pendente") {
      return NextResponse.json(
        { ok: false, error: "Sugestão já foi revisada." },
        { status: 409 },
      );
    }

    if (body.action === "rejeitar") {
      const { data: updated, error } = await supabase
        .from("scope_import_suggestions")
        .update({
          status: "rejeitado",
          rejection_reason: body.reason ?? null,
          reviewed_by: auth.profile.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pendente")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        return NextResponse.json(
          { ok: false, error: "Sugestão já foi revisada." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, data: updated });
    }

    const template = suggestion.template ?? "";
    const placeholderKeys = recomputePlaceholderKeys(template, suggestion.conceito);

    if (suggestion.kind === "escopo") {
      let scopeTypeId: string | null = null;
      if ("scopeTypeId" in body.target) {
        scopeTypeId = body.target.scopeTypeId;
      } else if ("newType" in body.target) {
        const areaKey = body.target.newType.areaKey ?? suggestion.area_key;
        if (!areaKey) {
          return NextResponse.json({ ok: false, error: "Área obrigatória para novo tipo." }, { status: 422 });
        }
        const { data: typeRow, error: typeError } = await insertScopeType(supabase, {
          areaKey,
          label: body.target.newType.label,
        })
          .select("id")
          .single();
        if (typeError) throw typeError;
        scopeTypeId = typeRow.id;
      }

      if (!scopeTypeId) {
        return NextResponse.json({ ok: false, error: "Destino de escopo inválido." }, { status: 422 });
      }

      const sortOrder = await nextScopeSubtypeSortOrder(supabase, scopeTypeId);
      const { data: subtypeRow, error: subtypeError } = await insertScopeSubtype(supabase, {
        scopeTypeId,
        label: suggestion.subtype_label ?? "Subtipo",
        subtypeKey: suggestion.subtype_key ?? undefined,
        escopoTemplate: template,
        placeholderKeys,
        sortOrder,
        isActive: true,
      })
        .select("id")
        .single();
      if (subtypeError) throw subtypeError;

      const { data: updated, error } = await supabase
        .from("scope_import_suggestions")
        .update({
          status: "aprovado",
          reviewed_by: auth.profile.id,
          reviewed_at: new Date().toISOString(),
          created_type_id: scopeTypeId,
          created_subtype_id: subtypeRow.id,
        })
        .eq("id", id)
        .eq("status", "pendente")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        return NextResponse.json(
          { ok: false, error: "Sugestão já foi revisada." },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: true, data: updated });
    }

    let investmentTypeId: string | null = null;
    if ("investmentTypeId" in body.target) {
      investmentTypeId = body.target.investmentTypeId;
    } else if ("newType" in body.target) {
      const { data: typeRow, error: typeError } = await insertInvestmentType(supabase, {
        label: body.target.newType.label,
      })
        .select("id")
        .single();
      if (typeError) throw typeError;
      investmentTypeId = typeRow.id;
    }

    if (!investmentTypeId) {
      return NextResponse.json({ ok: false, error: "Destino de investimento inválido." }, { status: 422 });
    }

    const sortOrder = await nextInvestmentSubtypeSortOrder(supabase, investmentTypeId);
    const { data: subtypeRow, error: subtypeError } = await insertInvestmentSubtype(supabase, {
      investmentTypeId,
      label: suggestion.subtype_label ?? "Subtipo",
      subtypeKey: suggestion.subtype_key ?? undefined,
      conceito: suggestion.conceito ?? "",
      template,
      placeholderKeys,
      sortOrder,
      isActive: true,
    })
      .select("id")
      .single();
    if (subtypeError) throw subtypeError;

    const { data: updated, error } = await supabase
      .from("scope_import_suggestions")
      .update({
        status: "aprovado",
        reviewed_by: auth.profile.id,
        reviewed_at: new Date().toISOString(),
        created_type_id: investmentTypeId,
        created_subtype_id: subtypeRow.id,
      })
      .eq("id", id)
      .eq("status", "pendente")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json(
        { ok: false, error: "Sugestão já foi revisada." },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao revisar sugestão.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
