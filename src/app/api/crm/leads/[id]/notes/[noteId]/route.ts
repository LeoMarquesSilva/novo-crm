import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import { deleteLeadNote, updateLeadNote } from "@/lib/crm/lead-notes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const updateNoteSchema = z
  .object({
    body: z
      .string()
      .trim()
      .min(1, "Escreva uma anotação.")
      .max(4000, "A anotação deve ter até 4000 caracteres.")
      .optional(),
    mentionedAppUserIds: z.array(z.string().uuid()).optional(),
    isPinned: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.body !== undefined ||
      data.mentionedAppUserIds !== undefined ||
      data.isPinned !== undefined,
    { message: "Envie pelo menos um campo para atualizar." },
  );

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
      return NextResponse.json({ ok: false, error: "Usuário sem perfil no CRM." }, { status: 403 });
    }

    const json = await request.json();
    const parsed = updateNoteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().formErrors.join("; ") || "Payload inválido." },
        { status: 400 },
      );
    }

    const { id, noteId } = await params;
    const supabase = createSupabaseAdminClient();
    const result = await updateLeadNote(supabase, id, noteId, parsed.data, auth.profile);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({ ok: true, note: result.note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao atualizar anotação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
      return NextResponse.json({ ok: false, error: "Usuário sem perfil no CRM." }, { status: 403 });
    }

    const { id, noteId } = await params;
    const supabase = createSupabaseAdminClient();
    const result = await deleteLeadNote(supabase, id, noteId, auth.profile);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao excluir anotação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
