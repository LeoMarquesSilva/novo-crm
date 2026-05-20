import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const USE_CASES = ["due_diligence", "lead_notification", "pipeline_alert", "general"] as const;

const updateSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "Informe um nome para identificar o destino.").max(120),
  destination: z.string().trim().min(8),
  destination_type: z.enum(["number", "group"]).default("number"),
  is_active: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
  use_case: z.enum(USE_CASES).default("due_diligence"),
});

const deleteSchema = z.object({
  id: z.string().uuid(),
});

export async function GET() {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_due_config")
      .select("*")
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("label", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data?.find((item) => item.is_active) ?? data?.[0] ?? null,
      items: data ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = updateSchema.parse(body);
    const supabase = createSupabaseAdminClient();
    const row = {
      label: parsed.label,
      destination: parsed.destination,
      destination_type: parsed.destination_type,
      is_active: parsed.is_active,
      notes: parsed.notes?.trim() || null,
      use_case: parsed.use_case,
    };

    if (parsed.is_active) {
      // Desativa apenas outros registros do mesmo use_case
      const { error: deactivateError } = await supabase
        .from("whatsapp_due_config")
        .update({ is_active: false })
        .eq("use_case", parsed.use_case)
        .neq("id", parsed.id ?? "00000000-0000-0000-0000-000000000000");
      if (deactivateError) {
        return NextResponse.json({ error: deactivateError.message }, { status: 500 });
      }
    }

    if (parsed.id) {
      const { data, error } = await supabase
        .from("whatsapp_due_config")
        .update(row)
        .eq("id", parsed.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ data });
    }

    const { data, error } = await supabase
      .from("whatsapp_due_config")
      .insert(row)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminApi();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const parsed = deleteSchema.parse(body);
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("whatsapp_due_config")
      .delete()
      .eq("id", parsed.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
