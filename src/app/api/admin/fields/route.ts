import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  nextAvailableFieldCode,
  normalizeLabelKey,
  slugifyFieldCodeFromLabel,
} from "@/lib/crm/field-code";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

const createFieldSchema = z.object({
  entity_name: z.string().min(1),
  label: z.string().min(1).max(240),
  field_type: z.string().min(1),
  is_required: z.boolean().default(false),
  pipeline_code: z.string().default("vendas"),
  stage_code: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  condition_json: z.record(z.string(), z.unknown()).nullable().optional(),
  field_options: z.array(z.string()).nullable().optional(),
});

type FieldDefinitionInsert =
  Database["public"]["Tables"]["field_definitions"]["Insert"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const pipeline = searchParams.get("pipeline") ?? "vendas";

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("field_definitions")
      .select("*")
      .eq("pipeline_code", pipeline)
      .order("stage_code", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = createFieldSchema.parse(body);

    const supabase = createSupabaseAdminClient();

    const { data: samePipeline } = await supabase
      .from("field_definitions")
      .select("label")
      .eq("pipeline_code", parsed.pipeline_code);

    const labelKey = normalizeLabelKey(parsed.label);
    if (
      samePipeline?.some((row) => normalizeLabelKey(row.label) === labelKey)
    ) {
      return NextResponse.json(
        {
          error:
            "Já existe um campo com este nome de exibição neste funil. Escolha outro label.",
        },
        { status: 409 },
      );
    }

    const { data: sameEntity } = await supabase
      .from("field_definitions")
      .select("field_code")
      .eq("entity_name", parsed.entity_name);

    const existingCodes = (sameEntity ?? []).map((r) => r.field_code);
    const base = slugifyFieldCodeFromLabel(parsed.label);
    const field_code = nextAvailableFieldCode(base, existingCodes);

    const fieldToInsert: FieldDefinitionInsert = {
      entity_name: parsed.entity_name,
      field_code,
      label: parsed.label.trim(),
      field_type: parsed.field_type,
      is_required: parsed.is_required,
      pipeline_code: parsed.pipeline_code,
      stage_code: parsed.stage_code ?? null,
      sort_order: parsed.sort_order,
      condition_json: (parsed.condition_json ?? null) as Json | null,
      field_options: parsed.field_options ? parsed.field_options : null,
    };

    const { data, error } = await supabase
      .from("field_definitions")
      .insert(fieldToInsert)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
