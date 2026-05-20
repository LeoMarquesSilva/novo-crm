import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthApi } from "@/lib/auth/server";
import {
  createLeadNote,
  listLeadMentionableUsers,
  listLeadNotes,
} from "@/lib/crm/lead-notes";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const createNoteSchema = z.object({
  body: z.string().trim().min(1, "Escreva uma anotação.").max(4000, "A anotação deve ter até 4000 caracteres."),
  mentionedAppUserIds: z.array(z.string().uuid()).optional().default([]),
  isPinned: z.boolean().optional().default(false),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const [notesResult, usersResult] = await Promise.all([
      listLeadNotes(supabase, id, auth.profile),
      listLeadMentionableUsers(supabase),
    ]);

    if (!notesResult.ok) {
      return NextResponse.json(
        { ok: false, error: notesResult.error },
        { status: notesResult.status ?? 500 },
      );
    }

    if (!usersResult.ok) {
      return NextResponse.json(
        { ok: false, error: usersResult.error },
        { status: usersResult.status ?? 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      notes: notesResult.notes,
      users: usersResult.users,
      viewer: auth.profile
        ? {
            id: auth.profile.id,
            role: auth.profile.role,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao carregar anotações.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthApi();
    if (!auth.ok) return auth.response;
    if (!auth.profile) {
      return NextResponse.json({ ok: false, error: "Usuário sem perfil no CRM." }, { status: 403 });
    }

    const json = await request.json();
    const parsed = createNoteSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().formErrors.join("; ") || "Payload inválido." },
        { status: 400 },
      );
    }

    const { id } = await params;
    const supabase = createSupabaseAdminClient();
    const result = await createLeadNote(supabase, id, parsed.data, auth.profile);

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({ ok: true, note: result.note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha inesperada ao criar anotação.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
