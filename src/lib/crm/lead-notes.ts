import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppUserProfile } from "@/lib/auth/server";
import { actorFromAppUserRow } from "@/lib/crm/in-app-notification-meta";

export type LeadNoteAuthor = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
};

export type LeadNoteMention = LeadNoteAuthor;

export type LeadNoteItem = {
  id: string;
  oportunidadeId: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  canManage: boolean;
  author: LeadNoteAuthor | null;
  mentions: LeadNoteMention[];
};

export type LeadMentionableUser = LeadNoteAuthor & {
  role: string;
  area: string | null;
};

type LeadNoteRow = {
  id: string;
  oportunidade_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  created_by_app_user_id: string;
  author: {
    id: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
  mentions: Array<{
    mentioned_app_user: {
      id: string;
      full_name: string;
      avatar_url: string | null;
    } | null;
  }>;
};

function asLeadNoteRows(value: unknown): LeadNoteRow[] {
  return Array.isArray(value) ? (value as LeadNoteRow[]) : [];
}

function normalizeMentionIds(ids: string[], authorAppUserId?: string): string[] {
  return [
    ...new Set(
      ids
        .map((id) => id.trim())
        .filter(Boolean)
        .filter((id) => id !== authorAppUserId),
    ),
  ];
}

function toNoteItem(row: LeadNoteRow, viewer: AppUserProfile | null): LeadNoteItem {
  const canManage =
    Boolean(viewer) &&
    (viewer?.role === "admin" || viewer?.id === row.created_by_app_user_id);

  return {
    id: row.id,
    oportunidadeId: row.oportunidade_id,
    body: row.body,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    canManage,
    author: row.author
      ? {
          id: row.author.id,
          fullName: row.author.full_name,
          avatarUrl: row.author.avatar_url,
        }
      : null,
    mentions: row.mentions
      .map((mention) => mention.mentioned_app_user)
      .filter((user): user is NonNullable<typeof user> => user != null)
      .map((user) => ({
        id: user.id,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
      })),
  };
}

export async function listLeadNotes(
  supabase: SupabaseClient,
  oportunidadeId: string,
  viewer: AppUserProfile | null,
): Promise<{ ok: true; notes: LeadNoteItem[] } | { ok: false; error: string; status?: number }> {
  const { data, error } = await supabase
    .from("lead_notes")
    .select(`
      id,
      oportunidade_id,
      body,
      is_pinned,
      created_at,
      updated_at,
      edited_at,
      created_by_app_user_id,
      author:app_users!lead_notes_created_by_app_user_id_fkey(id, full_name, avatar_url),
      mentions:lead_note_mentions(
        mentioned_app_user:app_users!lead_note_mentions_mentioned_app_user_id_fkey(id, full_name, avatar_url)
      )
    `)
    .eq("oportunidade_id", oportunidadeId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true, notes: asLeadNoteRows(data).map((row) => toNoteItem(row, viewer)) };
}

export async function listLeadMentionableUsers(
  supabase: SupabaseClient,
): Promise<{ ok: true; users: LeadMentionableUser[] } | { ok: false; error: string; status?: number }> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, avatar_url, role, area")
    .order("full_name", { ascending: true });

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return {
    ok: true,
    users: (data ?? []).map((user) => ({
      id: user.id,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      role: String(user.role),
      area: user.area,
    })),
  };
}

export async function createLeadNote(
  supabase: SupabaseClient,
  oportunidadeId: string,
  input: {
    body: string;
    mentionedAppUserIds: string[];
    isPinned: boolean;
  },
  viewer: AppUserProfile,
): Promise<{ ok: true; note: LeadNoteItem } | { ok: false; error: string; status?: number }> {
  if (!["admin", "comercial"].includes(viewer.role)) {
    return { ok: false, error: "Apenas comercial ou admin podem criar anotações.", status: 403 };
  }

  const trimmedBody = input.body.trim();
  const { data: note, error } = await supabase
    .from("lead_notes")
    .insert({
      oportunidade_id: oportunidadeId,
      body: trimmedBody,
      created_by_app_user_id: viewer.id,
      is_pinned: input.isPinned,
    } as never)
    .select("id")
    .single();

  if (error || !note) {
    return { ok: false, error: error?.message ?? "Não foi possível criar a anotação.", status: 500 };
  }

  const noteId = (note as { id: string }).id;
  const mentionIds = normalizeMentionIds(input.mentionedAppUserIds, viewer.id);
  const validMentionIds = await filterMentionableUserIds(supabase, mentionIds);

  if (validMentionIds.length > 0) {
    const { error: mentionError } = await supabase.from("lead_note_mentions").insert(
      validMentionIds.map((mentionedAppUserId) => ({
        note_id: noteId,
        mentioned_app_user_id: mentionedAppUserId,
      })) as never,
    );

    if (mentionError) {
      return { ok: false, error: mentionError.message, status: 500 };
    }

    await notifyMentionedUsers(supabase, oportunidadeId, noteId, trimmedBody, viewer, validMentionIds);
  }

  const listed = await listLeadNotes(supabase, oportunidadeId, viewer);
  if (!listed.ok) return listed;
  const created = listed.notes.find((item) => item.id === noteId);
  if (!created) {
    return { ok: false, error: "Anotação criada, mas não foi possível recarregá-la.", status: 500 };
  }

  return { ok: true, note: created };
}

export async function updateLeadNote(
  supabase: SupabaseClient,
  oportunidadeId: string,
  noteId: string,
  input: {
    body?: string;
    mentionedAppUserIds?: string[];
    isPinned?: boolean;
  },
  viewer: AppUserProfile,
): Promise<{ ok: true; note: LeadNoteItem } | { ok: false; error: string; status?: number }> {
  const existing = await getExistingNote(supabase, oportunidadeId, noteId);
  if (!existing.ok) return existing;
  if (!canManageNote(viewer, existing.createdByAppUserId)) {
    return { ok: false, error: "Você não pode editar esta anotação.", status: 403 };
  }

  const patch: Record<string, unknown> = {};
  if (input.body !== undefined) {
    patch.body = input.body.trim();
    patch.edited_at = new Date().toISOString();
  }
  if (input.isPinned !== undefined) {
    patch.is_pinned = input.isPinned;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("lead_notes")
      .update(patch as never)
      .eq("id", noteId)
      .eq("oportunidade_id", oportunidadeId)
      .is("deleted_at", null);
    if (error) return { ok: false, error: error.message, status: 500 };
  }

  if (input.mentionedAppUserIds) {
    const mentionIds = normalizeMentionIds(input.mentionedAppUserIds, existing.createdByAppUserId);
    const validMentionIds = await filterMentionableUserIds(supabase, mentionIds);
    const currentMentionIds = await getCurrentMentionIds(supabase, noteId);
    const currentSet = new Set(currentMentionIds);
    const addedMentionIds = validMentionIds.filter((id) => !currentSet.has(id));

    const { error: deleteError } = await supabase
      .from("lead_note_mentions")
      .delete()
      .eq("note_id", noteId);
    if (deleteError) return { ok: false, error: deleteError.message, status: 500 };

    if (validMentionIds.length > 0) {
      const { error: insertError } = await supabase.from("lead_note_mentions").insert(
        validMentionIds.map((mentionedAppUserId) => ({
          note_id: noteId,
          mentioned_app_user_id: mentionedAppUserId,
        })) as never,
      );
      if (insertError) return { ok: false, error: insertError.message, status: 500 };
    }

    if (addedMentionIds.length > 0) {
      await notifyMentionedUsers(
        supabase,
        oportunidadeId,
        noteId,
        input.body?.trim() || existing.body,
        viewer,
        addedMentionIds,
      );
    }
  }

  const listed = await listLeadNotes(supabase, oportunidadeId, viewer);
  if (!listed.ok) return listed;
  const updated = listed.notes.find((item) => item.id === noteId);
  if (!updated) {
    return { ok: false, error: "Anotação atualizada, mas não foi possível recarregá-la.", status: 500 };
  }
  return { ok: true, note: updated };
}

export async function deleteLeadNote(
  supabase: SupabaseClient,
  oportunidadeId: string,
  noteId: string,
  viewer: AppUserProfile,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const existing = await getExistingNote(supabase, oportunidadeId, noteId);
  if (!existing.ok) return existing;
  if (!canManageNote(viewer, existing.createdByAppUserId)) {
    return { ok: false, error: "Você não pode excluir esta anotação.", status: 403 };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("lead_notes")
    .update({ deleted_at: now } as never)
    .eq("id", noteId)
    .eq("oportunidade_id", oportunidadeId);

  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }

  return { ok: true };
}

function canManageNote(viewer: AppUserProfile, createdByAppUserId: string): boolean {
  return viewer.role === "admin" || viewer.id === createdByAppUserId;
}

async function getExistingNote(
  supabase: SupabaseClient,
  oportunidadeId: string,
  noteId: string,
): Promise<
  | { ok: true; body: string; createdByAppUserId: string }
  | { ok: false; error: string; status?: number }
> {
  const { data, error } = await supabase
    .from("lead_notes")
    .select("body, created_by_app_user_id")
    .eq("id", noteId)
    .eq("oportunidade_id", oportunidadeId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "Anotação não encontrada.", status: 404 };

  return {
    ok: true,
    body: String(data.body ?? ""),
    createdByAppUserId: String(data.created_by_app_user_id),
  };
}

async function filterMentionableUserIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("app_users").select("id").in("id", ids);
  const valid = new Set((data ?? []).map((user) => user.id));
  return ids.filter((id) => valid.has(id));
}

async function getCurrentMentionIds(
  supabase: SupabaseClient,
  noteId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("lead_note_mentions")
    .select("mentioned_app_user_id")
    .eq("note_id", noteId);
  return (data ?? []).map((row) => row.mentioned_app_user_id);
}

async function notifyMentionedUsers(
  supabase: SupabaseClient,
  oportunidadeId: string,
  noteId: string,
  body: string,
  author: AppUserProfile,
  mentionedAppUserIds: string[],
): Promise<void> {
  const mentionIds = normalizeMentionIds(mentionedAppUserIds, author.id);
  if (mentionIds.length === 0) return;

  const [{ data: users }, { data: oportunidade }] = await Promise.all([
    supabase
      .from("app_users")
      .select("id, auth_user_id")
      .in("id", mentionIds),
    supabase
      .from("oportunidades")
      .select("solicitante_nome")
      .eq("id", oportunidadeId)
      .maybeSingle(),
  ]);

  const preview = body.length > 160 ? `${body.slice(0, 157)}...` : body;
  const title = `${author.full_name} marcou você em uma anotação`;
  const leadName = String(oportunidade?.solicitante_nome ?? "lead");
  const originado_por = actorFromAppUserRow({
    id: author.id,
    full_name: author.full_name,
    avatar_url: author.avatar_url,
  });
  const rows = (users ?? [])
    .filter((user) => user.auth_user_id && user.auth_user_id !== author.auth_user_id)
    .map((user) => ({
      user_id: user.auth_user_id,
      tipo: "lead_note_mention",
      payload: {
        title,
        leadId: oportunidadeId,
        noteId,
        authorName: author.full_name,
        leadName,
        preview,
        path: `/crm/leads/${oportunidadeId}`,
        ...(originado_por ? { originado_por } : {}),
      },
    }));

  if (rows.length === 0) return;
  await supabase.from("crm_in_app_notifications").insert(rows as never);
}
