import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

const updateFieldSchema = z.object({
  label: z.string().min(1).optional(),
  is_required: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  condition_json: z.record(z.string(), z.unknown()).nullable().optional(),
  field_options: z.array(z.string()).nullable().optional(),
});

type FieldDefinitionUpdate =
  Database["public"]["Tables"]["field_definitions"]["Update"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const parsed = updateFieldSchema.parse(body);
    const update: FieldDefinitionUpdate = {
      ...parsed,
      condition_json: parsed.condition_json as Json | null | undefined,
      field_options: parsed.field_options as Json | null | undefined,
    };

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("field_definitions")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("field_definitions").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
