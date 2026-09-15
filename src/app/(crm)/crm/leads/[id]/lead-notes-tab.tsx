"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Bell, Edit3, LinkIcon, Loader2, MessageSquareText, Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTimeBr } from "@/lib/format-datetime";
import { initialsFromFullName } from "@/lib/crm/resolve-app-user-display";
import { createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type LeadNoteUser = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role?: string;
  area?: string | null;
};

type LeadNoteItem = {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  canManage: boolean;
  author: LeadNoteUser | null;
  mentions: LeadNoteUser[];
};

type NotesResponse = {
  ok: boolean;
  notes?: LeadNoteItem[];
  users?: LeadNoteUser[];
  viewer?: { id: string; role: string } | null;
  error?: string;
};

type SaveResponse = {
  ok: boolean;
  note?: LeadNoteItem;
  error?: string;
};

type NotesFilter = "all" | "mine" | "mentions";

export function LeadNotesTab({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<LeadNoteItem[]>([]);
  const [users, setUsers] = useState<LeadNoteUser[]>([]);
  const [viewer, setViewer] = useState<{ id: string; role: string } | null>(null);
  const [body, setBody] = useState("");
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [filter, setFilter] = useState<NotesFilter>("all");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editingMentionIds, setEditingMentionIds] = useState<string[]>([]);
  const [editingPinned, setEditingPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotes = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (!silent) setLoading(true);
      if (!silent) setError(null);
      try {
        const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/notes`, { cache: "no-store" });
        const data = (await res.json()) as NotesResponse;
        if (!res.ok || !data.ok) {
          if (!silent) setError(data.error ?? "Não foi possível carregar as anotações.");
          return;
        }
        setNotes(data.notes ?? []);
        setUsers(data.users ?? []);
        setViewer(data.viewer ?? null);
      } catch (err) {
        if (!silent) setError(err instanceof Error ? err.message : "Falha ao carregar anotações.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [leadId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchNotes();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchNotes]);

  useEffect(() => {
    const supabase = createSupabaseClient();
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void fetchNotes({ silent: true });
      }, 200);
    };

    const channel = supabase
      .channel(`lead-notes-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_notes",
          filter: `oportunidade_id=eq.${leadId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_note_mentions",
        },
        scheduleRefresh,
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[lead-notes] Realtime:", err?.message ?? err);
        }
      });

    return () => {
      if (debounce) clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [fetchNotes, leadId]);

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedMentionIds.includes(user.id)),
    [selectedMentionIds, users],
  );

  const filteredUsers = useMemo(() => {
    const q = normalizeSearch(userQuery);
    return users
      .filter((user) => user.id !== viewer?.id)
      .filter((user) => !selectedMentionIds.includes(user.id))
      .filter((user) => {
        if (!q) return true;
        return normalizeSearch(`${user.fullName} ${user.area ?? ""} ${user.role ?? ""}`).includes(q);
      })
      .slice(0, 8);
  }, [selectedMentionIds, userQuery, users, viewer?.id]);

  const visibleNotes = useMemo(() => {
    if (filter === "mine") {
      return notes.filter((note) => note.author?.id === viewer?.id);
    }
    if (filter === "mentions") {
      return notes.filter((note) => note.mentions.some((mention) => mention.id === viewer?.id));
    }
    return notes;
  }, [filter, notes, viewer?.id]);

  async function submitNote() {
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          mentionedAppUserIds: selectedMentionIds,
          isPinned,
        }),
      });
      const data = (await res.json()) as SaveResponse;
      if (!res.ok || !data.ok || !data.note) {
        setError(data.error ?? "Não foi possível salvar a anotação.");
        return;
      }
      setNotes((prev) => sortNotes([data.note!, ...prev]));
      setBody("");
      setSelectedMentionIds([]);
      setUserQuery("");
      setIsPinned(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar anotação.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(noteId: string) {
    if (!editingBody.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: editingBody,
          mentionedAppUserIds: editingMentionIds,
          isPinned: editingPinned,
        }),
      });
      const data = (await res.json()) as SaveResponse;
      if (!res.ok || !data.ok || !data.note) {
        setError(data.error ?? "Não foi possível atualizar a anotação.");
        return;
      }
      setNotes((prev) => sortNotes(prev.map((note) => (note.id === noteId ? data.note! : note))));
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar anotação.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePinned(note: LeadNoteItem) {
    setError(null);
    const nextPinned = !note.isPinned;
    setNotes((prev) =>
      sortNotes(prev.map((item) => (item.id === note.id ? { ...item, isPinned: nextPinned } : item))),
    );
    const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/notes/${encodeURIComponent(note.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: nextPinned }),
    });
    const data = (await res.json()) as SaveResponse;
    if (!res.ok || !data.ok || !data.note) {
      setError(data.error ?? "Não foi possível alterar o destaque da anotação.");
      setNotes((prev) =>
        sortNotes(prev.map((item) => (item.id === note.id ? { ...item, isPinned: note.isPinned } : item))),
      );
      return;
    }
    setNotes((prev) => sortNotes(prev.map((item) => (item.id === note.id ? data.note! : item))));
  }

  async function deleteNote(noteId: string) {
    setError(null);
    const previous = notes;
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    const res = await fetch(`/api/crm/leads/${encodeURIComponent(leadId)}/notes/${encodeURIComponent(noteId)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setNotes(previous);
      setError(data.error ?? "Não foi possível excluir a anotação.");
    }
  }

  function startEdit(note: LeadNoteItem) {
    setEditingNoteId(note.id);
    setEditingBody(note.body);
    setEditingMentionIds(note.mentions.map((mention) => mention.id));
    setEditingPinned(note.isPinned);
  }

  function cancelEdit() {
    setEditingNoteId(null);
    setEditingBody("");
    setEditingMentionIds([]);
    setEditingPinned(false);
  }

  return (
    <section id="anotacoes" className="scroll-mt-6 space-y-4">
      <Card className="overflow-hidden border-neutral-200">
        <CardHeader className="border-b border-neutral-200 bg-white px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <MessageSquareText className="h-4 w-4" />
                Histórico interno
              </div>
              <CardTitle className="text-xl font-extrabold tracking-[-0.035em] text-foreground">
                Anotações do lead
              </CardTitle>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Registre contexto, combine próximos passos e marque colegas para avisos no CRM.
              </p>
            </div>
            <Badge variant="outline" className="h-7 border-neutral-200 bg-white text-foreground">
              {notes.length} {notes.length === 1 ? "anotação" : "anotações"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-(--radius-v2-xl) border border-neutral-200 bg-white p-4">
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Escreva uma anotação sobre este lead..."
              className="min-h-28 resize-y rounded-(--radius-v2-md) border-neutral-200 bg-neutral-50 px-3 py-3"
              maxLength={4000}
            />
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    placeholder="Marcar usuários"
                    className="h-10 rounded-(--radius-v2-md) border-neutral-200 pl-9"
                  />
                </div>
                {selectedUsers.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedUsers.map((user) => (
                      <MentionChip
                        key={user.id}
                        user={user}
                        onRemove={() =>
                          setSelectedMentionIds((prev) => prev.filter((id) => id !== user.id))
                        }
                      />
                    ))}
                  </div>
                ) : null}
                {filteredUsers.length > 0 ? (
                  <div className="mt-2 grid gap-1 rounded-(--radius-v2-md) border border-neutral-200 bg-neutral-50 p-1">
                    {filteredUsers.map((user) => (
                      <UserPickerRow
                        key={user.id}
                        user={user}
                        onPick={() => {
                          setSelectedMentionIds((prev) => [...prev, user.id]);
                          setUserQuery("");
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant={isPinned ? "secondary" : "outline"}
                  onClick={() => setIsPinned((current) => !current)}
                  className="h-10 justify-start"
                >
                  <Pin className="h-4 w-4" />
                  {isPinned ? "Fixada no topo" : "Fixar anotação"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void submitNote()}
                  disabled={saving || !body.trim()}
                  className="h-10"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  Salvar anotação
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Usuários marcados recebem notificação no sino do CRM. O autor, data e horário ficam registrados automaticamente.
            </p>
          </div>

          {error ? (
            <div className="rounded-(--radius-v2-xl) border border-danger-border bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-text">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                Todas
              </FilterButton>
              <FilterButton active={filter === "mine"} onClick={() => setFilter("mine")}>
                Minhas
              </FilterButton>
              <FilterButton active={filter === "mentions"} onClick={() => setFilter("mentions")}>
                Menções
              </FilterButton>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
              Mais recentes e fixadas aparecem primeiro
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center rounded-(--radius-v2-xl) border border-dashed border-neutral-200 bg-neutral-50 py-10 text-sm font-semibold text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando anotações...
            </div>
          ) : visibleNotes.length === 0 ? (
            <div className="rounded-(--radius-v2-xl) border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center">
              <MessageSquareText className="mx-auto h-8 w-8 text-neutral-300" />
              <p className="mt-3 text-sm font-bold text-foreground">Nenhuma anotação neste filtro</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use a caixa acima para registrar o primeiro contexto importante do lead.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleNotes.map((note) => {
                const isEditing = editingNoteId === note.id;
                const editSelectedUsers = users.filter((user) => editingMentionIds.includes(user.id));
                return (
                  <article
                    key={note.id}
                    className={cn(
                      "rounded-(--radius-v2-xl) border bg-white p-4",
                      note.isPinned ? "border-warning-border bg-warning-bg" : "border-neutral-200",
                    )}
                  >
                    <div className="flex gap-3">
                      <Avatar className="h-10 w-10 shrink-0 border-2 border-white">
                        {note.author?.avatarUrl ? <AvatarImage src={note.author.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="bg-brand-navy text-xs font-black text-white">
                          {note.author?.fullName ? initialsFromFullName(note.author.fullName) : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-extrabold text-foreground">
                              {note.author?.fullName ?? "Usuário removido"}
                            </p>
                            <p className="text-xs font-semibold text-muted-foreground">
                              {formatDateTimeBr(note.createdAt)}
                              {note.editedAt ? ` · editada em ${formatDateTimeBr(note.editedAt)}` : null}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {note.isPinned ? (
                              <Badge variant="outline" className="border-warning-border bg-warning-bg text-warning-text">
                                <Pin className="h-3 w-3" />
                                Fixada
                              </Badge>
                            ) : null}
                            {note.canManage ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void togglePinned(note)}
                                  className="h-8 rounded-(--radius-v2-lg) px-2"
                                  title={note.isPinned ? "Desafixar" : "Fixar"}
                                >
                                  {note.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => startEdit(note)}
                                  className="h-8 rounded-(--radius-v2-lg) px-2"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => void deleteNote(note.id)}
                                  className="h-8 rounded-(--radius-v2-lg) px-2"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>

                        {isEditing ? (
                          <div className="mt-3 space-y-3">
                            <Textarea
                              value={editingBody}
                              onChange={(event) => setEditingBody(event.target.value)}
                              className="min-h-24 rounded-(--radius-v2-md) border-neutral-200 bg-white"
                              maxLength={4000}
                            />
                            <div className="flex flex-wrap gap-2">
                              {editSelectedUsers.map((user) => (
                                <MentionChip
                                  key={user.id}
                                  user={user}
                                  onRemove={() =>
                                    setEditingMentionIds((prev) => prev.filter((id) => id !== user.id))
                                  }
                                />
                              ))}
                              {users
                                .filter((user) => user.id !== viewer?.id && !editingMentionIds.includes(user.id))
                                .slice(0, 6)
                                .map((user) => (
                                  <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => setEditingMentionIds((prev) => [...prev, user.id])}
                                    className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-bold text-muted-foreground hover:border-interactive-300"
                                  >
                                    @{user.fullName}
                                  </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant={editingPinned ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => setEditingPinned((current) => !current)}
                              >
                                <Pin className="h-3.5 w-3.5" />
                                {editingPinned ? "Fixada" : "Fixar"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving || !editingBody.trim()}
                                onClick={() => void saveEdit(note.id)}
                              >
                                Salvar edição
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <NoteBody body={note.body} />
                            {note.mentions.length > 0 ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {note.mentions.map((user) => (
                                  <Badge
                                    key={user.id}
                                    variant="outline"
                                    className="h-7 border-info-border bg-info-bg text-info-text"
                                  >
                                    @{user.fullName}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
        active ? "bg-brand-navy text-white" : "bg-neutral-100 text-muted-foreground hover:bg-neutral-200",
      )}
    >
      {children}
    </button>
  );
}

function UserPickerRow({ user, onPick }: { user: LeadNoteUser; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex items-center gap-2 rounded-(--radius-v2-md) px-2 py-2 text-left transition-colors hover:bg-white"
    >
      <Avatar className="h-7 w-7">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
        <AvatarFallback className="bg-interactive-50 text-[10px] font-black text-interactive-700">
          {initialsFromFullName(user.fullName)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-xs font-extrabold text-foreground">{user.fullName}</span>
        <span className="block truncate text-[11px] font-semibold text-muted-foreground">
          {[user.area, user.role].filter(Boolean).join(" · ") || "Usuário CRM"}
        </span>
      </span>
    </button>
  );
}

function MentionChip({ user, onRemove }: { user: LeadNoteUser; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-info-border bg-info-bg py-1 pl-2.5 pr-1 text-xs font-bold text-info-text">
      @{user.fullName}
      <button
        type="button"
        onClick={onRemove}
        className="rounded-full p-0.5 text-info-text/60 hover:bg-white hover:text-info-text"
        aria-label={`Remover ${user.fullName}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function NoteBody({ body }: { body: string }) {
  const parts = body.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
      {parts.map((part, index) => {
        if (/^https?:\/\/[^\s]+$/.test(part)) {
          return (
            <a
              key={`${part}-${index}`}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-bold text-interactive-700 underline underline-offset-2"
            >
              {part}
              <LinkIcon className="h-3 w-3" />
            </a>
          );
        }
        return part;
      })}
    </p>
  );
}

function sortNotes(notes: LeadNoteItem[]) {
  return [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
