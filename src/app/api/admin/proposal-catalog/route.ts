import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { loadProposalCatalogAdmin } from "@/lib/crm/proposal-catalog-db";
import { extractPlaceholderKeysFromText, PROPOSTA_TIPOS_CATALOG } from "@/data/proposta-tipos-catalog";
import { PROPOSTA_INVESTIMENTO_TIPOS_CATALOG } from "@/data/proposta-investimento-catalog";
import { slugifyFieldCodeFromLabel } from "@/lib/crm/field-code";

const kindSchema = z.enum(["scope_type", "scope_subtype", "investment_type", "investment_subtype"]);

const createSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("seed_defaults"),
  }),
  z.object({
    kind: z.literal("scope_type"),
    areaKey: z.string().min(1),
    label: z.string().min(1).max(180),
    typeKey: z.string().optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("scope_subtype"),
    scopeTypeId: z.string().uuid(),
    label: z.string().min(1).max(180),
    subtypeKey: z.string().optional(),
    escopoTemplate: z.string().optional(),
    placeholderKeys: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("investment_type"),
    label: z.string().min(1).max(180),
    typeKey: z.string().optional(),
    sortOrder: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("investment_subtype"),
    investmentTypeId: z.string().uuid(),
    label: z.string().min(1).max(180),
    subtypeKey: z.string().optional(),
    conceito: z.string().optional(),
    template: z.string().optional(),
    placeholderKeys: z.array(z.string()).optional(),
    sortOrder: z.number().int().optional(),
  }),
]);

const deleteSchema = z.object({
  kind: kindSchema,
  id: z.string().uuid(),
});

const patchSchema = z.object({
  kind: kindSchema,
  id: z.string().uuid(),
  label: z.string().min(1).max(180).optional(),
  areaKey: z.string().min(1).optional(),
  escopoTemplate: z.string().optional(),
  conceito: z.string().optional(),
  template: z.string().optional(),
  placeholderKeys: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

type ScopeTypeUpdate = Database["public"]["Tables"]["proposal_scope_types"]["Update"];
type ScopeSubtypeUpdate = Database["public"]["Tables"]["proposal_scope_subtypes"]["Update"];
type InvestmentTypeUpdate = Database["public"]["Tables"]["proposal_investment_types"]["Update"];
type InvestmentSubtypeUpdate =
  Database["public"]["Tables"]["proposal_investment_subtypes"]["Update"];

function cleanKey(value: string | undefined, label: string) {
  return (value?.trim() || slugifyFieldCodeFromLabel(label)).slice(0, 80);
}

function cleanPlaceholders(explicit: string[] | undefined, ...texts: string[]) {
  const keys = explicit?.length ? explicit : extractPlaceholderKeysFromText(...texts);
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const data = await loadProposalCatalogAdmin();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar catálogo.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = createSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();

    if (body.kind === "seed_defaults") {
      await seedDefaults(supabase);
      return NextResponse.json({ ok: true, data: await loadProposalCatalogAdmin(supabase) }, { status: 201 });
    }

    let insertError: { message: string } | null = null;

    if (body.kind === "scope_type") {
      const { error } = await supabase.from("proposal_scope_types").insert({
        area_key: body.areaKey.trim(),
        type_key: cleanKey(body.typeKey, body.label),
        label: body.label.trim(),
        sort_order: body.sortOrder ?? 0,
      });
      insertError = error;
    } else if (body.kind === "scope_subtype") {
      const escopoTemplate = body.escopoTemplate ?? "";
      const { error } = await supabase.from("proposal_scope_subtypes").insert({
        scope_type_id: body.scopeTypeId,
        subtype_key: cleanKey(body.subtypeKey, body.label),
        label: body.label.trim(),
        escopo_template: escopoTemplate,
        investimento_template: "",
        placeholder_keys: cleanPlaceholders(body.placeholderKeys, escopoTemplate),
        sort_order: body.sortOrder ?? 0,
      });
      insertError = error;
    } else if (body.kind === "investment_type") {
      const { error } = await supabase.from("proposal_investment_types").insert({
        type_key: cleanKey(body.typeKey, body.label),
        label: body.label.trim(),
        sort_order: body.sortOrder ?? 0,
      });
      insertError = error;
    } else {
      const template = body.template ?? "";
      const { error } = await supabase.from("proposal_investment_subtypes").insert({
        investment_type_id: body.investmentTypeId,
        subtype_key: cleanKey(body.subtypeKey, body.label),
        label: body.label.trim(),
        conceito: body.conceito ?? "",
        template,
        placeholder_keys: cleanPlaceholders(body.placeholderKeys, template),
        sort_order: body.sortOrder ?? 0,
      });
      insertError = error;
    }

    if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: await loadProposalCatalogAdmin(supabase) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao criar item.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

async function seedDefaults(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  for (const [areaKey, types] of Object.entries(PROPOSTA_TIPOS_CATALOG)) {
    for (const [typeIndex, type] of (types ?? []).entries()) {
      const { data: typeRow, error: typeError } = await supabase
        .from("proposal_scope_types")
        .upsert(
          {
            area_key: areaKey,
            type_key: type.tipoId,
            label: type.label,
            sort_order: typeIndex * 10,
            is_active: true,
          },
          { onConflict: "area_key,type_key" },
        )
        .select("id")
        .single();
      if (typeError) throw typeError;

      for (const [subtypeIndex, subtype] of type.subtipos.entries()) {
        const { error } = await supabase
          .from("proposal_scope_subtypes")
          .upsert(
            {
              scope_type_id: typeRow.id,
              subtype_key: subtype.subtipoId,
              label: subtype.label,
              escopo_template: subtype.escopoTemplate,
              investimento_template: "",
              placeholder_keys: subtype.placeholderKeys ?? [],
              sort_order: subtypeIndex * 10,
              is_active: true,
            },
            { onConflict: "scope_type_id,subtype_key" },
          );
        if (error) throw error;
      }
    }
  }

  for (const [typeIndex, type] of PROPOSTA_INVESTIMENTO_TIPOS_CATALOG.entries()) {
    const { data: typeRow, error: typeError } = await supabase
      .from("proposal_investment_types")
      .upsert(
        {
          type_key: type.tipoId,
          label: type.label,
          sort_order: typeIndex * 10,
          is_active: true,
        },
        { onConflict: "type_key" },
      )
      .select("id")
      .single();
    if (typeError) throw typeError;

    for (const [subtypeIndex, subtype] of type.subtipos.entries()) {
      const { error } = await supabase
        .from("proposal_investment_subtypes")
        .upsert(
          {
            investment_type_id: typeRow.id,
            subtype_key: subtype.subtipoId,
            label: subtype.label,
            conceito: subtype.conceito,
            template: subtype.template,
            placeholder_keys: subtype.placeholderKeys,
            sort_order: subtypeIndex * 10,
            is_active: true,
          },
          { onConflict: "investment_type_id,subtype_key" },
        );
      if (error) throw error;
    }
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = deleteSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const { error } = await deleteCatalogRow(supabase, body.kind, body.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: await loadProposalCatalogAdmin(supabase) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao excluir item.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = patchSchema.parse(await request.json());
    const supabase = createSupabaseAdminClient();
    const patch = buildCatalogPatch(body);
    const { error } = await updateCatalogRow(supabase, body.kind, body.id, patch);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: await loadProposalCatalogAdmin(supabase) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao atualizar item.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

function addCommonCatalogPatchFields(
  patch: { label?: string; sort_order?: number; is_active?: boolean },
  body: z.infer<typeof patchSchema>,
) {
  if (body.label !== undefined) patch.label = body.label.trim();
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  if (body.isActive !== undefined) patch.is_active = body.isActive;
}

function buildCatalogPatch(
  body: z.infer<typeof patchSchema>,
): ScopeTypeUpdate | ScopeSubtypeUpdate | InvestmentTypeUpdate | InvestmentSubtypeUpdate {
  switch (body.kind) {
    case "scope_type": {
      const patch: ScopeTypeUpdate = {};
      addCommonCatalogPatchFields(patch, body);
      if (body.areaKey !== undefined) patch.area_key = body.areaKey.trim();
      return patch;
    }
    case "scope_subtype": {
      const patch: ScopeSubtypeUpdate = {};
      addCommonCatalogPatchFields(patch, body);
      if (body.escopoTemplate !== undefined) patch.escopo_template = body.escopoTemplate;
      patch.investimento_template = "";
      if (body.placeholderKeys !== undefined) {
        patch.placeholder_keys = cleanPlaceholders(body.placeholderKeys);
      }
      return patch;
    }
    case "investment_type": {
      const patch: InvestmentTypeUpdate = {};
      addCommonCatalogPatchFields(patch, body);
      return patch;
    }
    case "investment_subtype": {
      const patch: InvestmentSubtypeUpdate = {};
      addCommonCatalogPatchFields(patch, body);
      if (body.conceito !== undefined) patch.conceito = body.conceito;
      if (body.template !== undefined) patch.template = body.template;
      if (body.placeholderKeys !== undefined) {
        patch.placeholder_keys = cleanPlaceholders(body.placeholderKeys);
      }
      return patch;
    }
  }
}

function updateCatalogRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  kind: z.infer<typeof kindSchema>,
  id: string,
  patch: ScopeTypeUpdate | ScopeSubtypeUpdate | InvestmentTypeUpdate | InvestmentSubtypeUpdate,
) {
  switch (kind) {
    case "scope_type":
      return supabase.from("proposal_scope_types").update(patch as ScopeTypeUpdate).eq("id", id);
    case "scope_subtype":
      return supabase
        .from("proposal_scope_subtypes")
        .update(patch as ScopeSubtypeUpdate)
        .eq("id", id);
    case "investment_type":
      return supabase
        .from("proposal_investment_types")
        .update(patch as InvestmentTypeUpdate)
        .eq("id", id);
    case "investment_subtype":
      return supabase
        .from("proposal_investment_subtypes")
        .update(patch as InvestmentSubtypeUpdate)
        .eq("id", id);
  }
}

async function deleteCatalogRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  kind: z.infer<typeof kindSchema>,
  id: string,
) {
  switch (kind) {
    case "scope_subtype":
      return supabase.from("proposal_scope_subtypes").delete().eq("id", id);
    case "scope_type": {
      const { error: childError } = await supabase
        .from("proposal_scope_subtypes")
        .delete()
        .eq("scope_type_id", id);
      if (childError) return { error: childError };
      return supabase.from("proposal_scope_types").delete().eq("id", id);
    }
    case "investment_subtype":
      return supabase.from("proposal_investment_subtypes").delete().eq("id", id);
    case "investment_type": {
      const { error: childError } = await supabase
        .from("proposal_investment_subtypes")
        .delete()
        .eq("investment_type_id", id);
      if (childError) return { error: childError };
      return supabase.from("proposal_investment_types").delete().eq("id", id);
    }
  }
}
