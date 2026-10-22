import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isRecurring, nextOccurrence } from './recurrence';
import { supabase } from './supabase';
import type {
  ActivityEntry,
  AppNotification,
  Comment,
  Invite,
  Member,
  MyProfile,
  Reminder,
  Priority,
  Role,
  SavedFilter,
  Status,
  Subtask,
  Tag,
  Task,
  TodoList,
} from './types';

const keys = { lists: ['lists'], tasks: ['tasks'], trash: ['trash'] } as const;

const TASK_SELECT = '*, subtasks(*), task_tags(tags(id, name, color))';

/** Rohdaten der Datenbank in die App-Form bringen (Unteraufgaben sortiert, Tags ausgepackt). */
function sortSubtasks(raw: Task): Task {
  const { task_tags, ...task } = raw as Task & { task_tags?: { tags: Tag | null }[] };
  return {
    ...task,
    subtasks: [...(task.subtasks ?? [])].sort((a, b) => a.position - b.position),
    tags: (task_tags ?? [])
      .map((t) => t.tags)
      .filter((t): t is Tag => t !== null)
      .sort((a, b) => a.name.localeCompare(b.name, 'de-CH')),
  };
}

// ---------------------------------------------------------------- Abfragen
export function useLists() {
  return useQuery({
    queryKey: keys.lists,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lists')
        .select('*')
        .is('archived_at', null)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return data as TodoList[];
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: keys.tasks,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      return (data as Task[]).map(sortSubtasks);
    },
  });
}

/** Papierkorb: in den letzten 30 Tagen gelöschte Pendenzen */
export function useTrash() {
  return useQuery({
    queryKey: keys.trash,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .gte('deleted_at', since)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data as Task[]).map(sortSubtasks);
    },
  });
}

// ---------------------------------------------------------------- Listen
export interface ListInput {
  name: string;
  emoji: string;
  color: string;
}

export function useSaveList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ListInput & { id?: string }) => {
      const query = id
        ? supabase.from('lists').update(input).eq('id', id)
        : supabase.from('lists').insert(input);
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data as TodoList;
    },
    // erst zurückkehren, wenn die Listen neu geladen sind (sonst leitet die neue Seite sofort weiter)
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['members'] }); // die Besitzer-Mitgliedschaft entsteht per Trigger
      await qc.invalidateQueries({ queryKey: keys.lists });
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lists').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.lists });
      void qc.invalidateQueries({ queryKey: keys.tasks });
      void qc.invalidateQueries({ queryKey: keys.trash });
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

// ---------------------------------------------------------------- Pendenzen
export interface TaskInput {
  list_id: string;
  title: string;
  notes_md?: string;
  due_at?: string | null;
  due_all_day?: boolean;
  duration_min?: number | null;
  priority?: Priority;
  status?: Status;
  assignee_id?: string | null;
  rrule?: string | null;
  repeat_mode?: 'fixed' | 'after_completion';
  repeat_after_days?: number | null;
}

type TaskPatch = Partial<Omit<Task, 'id' | 'subtasks' | 'tags'>>;

function patchTask(qc: QueryClient, id: string, fn: (t: Task) => Task) {
  qc.setQueryData<Task[]>(keys.tasks, (old) => old?.map((t) => (t.id === id ? fn(t) : t)));
}

/** Optimistisches Update: Cache sofort ändern, bei Fehler zurückrollen. */
function useOptimisticTaskUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      patchTask(qc, id, (t) => ({ ...t, ...patch }));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

export function useUpdateTask() {
  return useOptimisticTaskUpdate();
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskInput) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert(input)
        .select(TASK_SELECT)
        .single();
      if (error) throw error;
      return sortSubtasks(data as Task);
    },
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(keys.tasks, (old) => [...(old ?? []), task]);
    },
  });
}

export function useSetDone() {
  const update = useOptimisticTaskUpdate();
  return (task: Task, done: boolean) =>
    update.mutateAsync({
      id: task.id,
      patch: {
        status: done ? 'done' : 'open',
        completed_at: done ? new Date().toISOString() : null,
      },
    });
}

export interface CompletionResult {
  /** Fälligkeit der Folge-Pendenz bei wiederkehrenden Pendenzen */
  nextDue: Date | null;
  undo: () => Promise<void>;
}

/**
 * Pendenz erledigen. Wiederkehrende Pendenzen erzeugen dabei die nächste (atomar in der Datenbank);
 * «undo» macht beides rückgängig.
 */
export function useCompleteTask() {
  const qc = useQueryClient();
  const setDone = useSetDone();
  return async (task: Task): Promise<CompletionResult> => {
    const next = isRecurring(task) ? nextOccurrence(task, new Date()) : null;
    if (!next) {
      await setDone(task, true);
      return { nextDue: null, undo: async () => void (await setDone(task, false)) };
    }
    // sofort ausblenden, bei einem Fehler zurückrollen
    const previous = qc.getQueryData<Task[]>(keys.tasks);
    patchTask(qc, task.id, (t) => ({ ...t, status: 'done' }));
    const { data, error } = await supabase.rpc('complete_recurring_task', {
      p_task: task.id,
      p_next_due: next.toISOString(),
    });
    if (error) {
      qc.setQueryData(keys.tasks, previous);
      throw error;
    }
    await qc.invalidateQueries({ queryKey: keys.tasks });
    const cloneId = data as string;
    return {
      nextDue: next,
      undo: async () => {
        const { error: undoError } = await supabase.rpc('undo_recurring_completion', {
          p_task: task.id,
          p_clone: cloneId,
          p_rrule: task.rrule,
          p_mode: task.repeat_mode,
          p_after: task.repeat_after_days,
        });
        if (undoError) throw undoError;
        await qc.invalidateQueries({ queryKey: keys.tasks });
      },
    };
  };
}

/** Tags einer Pendenz setzen (nach Namen); fehlende Tags werden in der Liste der Pendenz angelegt. */
export function useSetTaskTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      listId,
      names,
    }: {
      taskId: string;
      listId: string;
      names: string[];
    }) => {
      const wanted = [
        ...new Map(names.map((n) => [n.trim().toLocaleLowerCase('de-CH'), n.trim()])).values(),
      ].filter(Boolean);
      const { data: existing, error } = await supabase
        .from('tags')
        .select('id, name')
        .eq('list_id', listId);
      if (error) throw error;
      const byName = new Map(
        (existing ?? []).map((t) => [t.name.toLocaleLowerCase('de-CH'), t.id as string]),
      );

      const missing = wanted.filter((n) => !byName.has(n.toLocaleLowerCase('de-CH')));
      if (missing.length) {
        const { data: created, error: insertError } = await supabase
          .from('tags')
          .insert(missing.map((name) => ({ list_id: listId, name })))
          .select('id, name');
        if (insertError) throw insertError;
        for (const t of created ?? [])
          byName.set(t.name.toLocaleLowerCase('de-CH'), t.id as string);
      }
      const wantedIds = new Set(wanted.map((n) => byName.get(n.toLocaleLowerCase('de-CH'))!));

      const { data: current, error: currentError } = await supabase
        .from('task_tags')
        .select('tag_id')
        .eq('task_id', taskId);
      if (currentError) throw currentError;
      const currentIds = new Set((current ?? []).map((r) => r.tag_id as string));

      const remove = [...currentIds].filter((id) => !wantedIds.has(id));
      const add = [...wantedIds].filter((id) => !currentIds.has(id));
      if (remove.length) {
        const { error: delError } = await supabase
          .from('task_tags')
          .delete()
          .eq('task_id', taskId)
          .in('tag_id', remove);
        if (delError) throw delError;
      }
      if (add.length) {
        const { error: addError } = await supabase
          .from('task_tags')
          .insert(add.map((tag_id) => ({ task_id: taskId, tag_id })));
        if (addError) throw addError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

/** In den Papierkorb verschieben bzw. wiederherstellen */
export function useTrashTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, trashed }: { id: string; trashed: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: trashed ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, trashed }) => {
      if (!trashed) return;
      await qc.cancelQueries({ queryKey: keys.tasks });
      qc.setQueryData<Task[]>(keys.tasks, (old) => old?.filter((t) => t.id !== id));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.tasks });
      void qc.invalidateQueries({ queryKey: keys.trash });
    },
  });
}

export function usePurgeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trash }),
  });
}

// ---------------------------------------------------------------- Unteraufgaben
export function useAddSubtasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      titles,
      start,
    }: {
      taskId: string;
      titles: string[];
      start: number;
    }) => {
      const rows = titles.map((title, i) => ({ task_id: taskId, title, position: start + i }));
      const { data, error } = await supabase.from('subtasks').insert(rows).select();
      if (error) throw error;
      return data as Subtask[];
    },
    onSuccess: (rows, { taskId }) => {
      patchTask(qc, taskId, (t) => ({ ...t, subtasks: [...t.subtasks, ...rows] }));
    },
  });
}

export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; taskId: string; patch: Partial<Subtask> }) => {
      const { error } = await supabase.from('subtasks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, taskId, patch }) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      patchTask(qc, taskId, (t) => ({
        ...t,
        subtasks: t.subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      }));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

export function useDeleteSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; taskId: string }) => {
      const { error } = await supabase.from('subtasks').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, taskId }) => {
      await qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      patchTask(qc, taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== id) }));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  });
}

// ---------------------------------------------------------------- Kalender-Abo
export interface CalendarFeed {
  token: string | null;
  /** null = alle Listen */
  list_ids: string[] | null;
}

export function useCalendarFeed() {
  return useQuery({
    queryKey: ['calendar-feed'],
    queryFn: async (): Promise<CalendarFeed | null> => {
      const { data, error } = await supabase
        .from('calendar_tokens')
        .select('token, list_ids')
        .maybeSingle();
      if (error) throw error;
      return data as CalendarFeed | null;
    },
  });
}

/** Erzeugt den Token (erstmals) bzw. ersetzt ihn; die alte URL wird damit ungültig. */
export function useRotateCalendarToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('rotate_calendar_token');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar-feed'] }),
  });
}

export function useSaveCalendarLists() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, listIds }: { userId: string; listIds: string[] | null }) => {
      const { error } = await supabase
        .from('calendar_tokens')
        .update({ list_ids: listIds })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onMutate: async ({ listIds }) => {
      const previous = qc.getQueryData<CalendarFeed | null>(['calendar-feed']);
      // erst Cache ändern (sofortige Rückmeldung), dann laufende Abfragen mit altem Stand abbrechen
      qc.setQueryData<CalendarFeed | null>(['calendar-feed'], (old) =>
        old ? { ...old, list_ids: listIds } : old,
      );
      await qc.cancelQueries({ queryKey: ['calendar-feed'] });
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(['calendar-feed'], ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: ['calendar-feed'] }),
  });
}

// ---------------------------------------------------------------- Teilen

const sharingKeys = {
  members: ['members'],
  invites: (listId: string) => ['invites', listId],
  comments: (taskId: string) => ['comments', taskId],
  activity: (taskId: string) => ['activity', taskId],
  notifications: ['notifications'],
} as const;

/** Mitglieder aller meiner Listen (mit Profil) */
export function useMembers() {
  return useQuery({
    queryKey: sharingKeys.members,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('list_members')
        .select('list_id, user_id, role, profiles(id, name, avatar_url, email)');
      if (error) throw error;
      return data as unknown as Member[];
    },
  });
}

export function usePendingInvites(listId: string, enabled: boolean) {
  return useQuery({
    queryKey: sharingKeys.invites(listId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('list_invites')
        .select('id, list_id, email, role, expires_at, created_at')
        .eq('list_id', listId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Invite[];
    },
  });
}

export function useCreateInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, role, email }: { listId: string; role: Role; email?: string }) => {
      const { data, error } = await supabase.rpc('create_invite', {
        p_list: listId,
        p_role: role,
        p_email: email?.trim() || null,
      });
      if (error) throw error;
      return data as string; // Klartext-Token, nur jetzt verfügbar
    },
    onSuccess: (_t, { listId }) => qc.invalidateQueries({ queryKey: sharingKeys.invites(listId) }),
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; listId: string }) => {
      const { error } = await supabase.from('list_invites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_v, { listId }) => qc.invalidateQueries({ queryKey: sharingKeys.invites(listId) }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
      if (error) throw error;
      return data as string; // Listen-ID
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.lists });
      void qc.invalidateQueries({ queryKey: keys.tasks });
      void qc.invalidateQueries({ queryKey: sharingKeys.members });
    },
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      listId,
      userId,
      role,
    }: {
      listId: string;
      userId: string;
      role: Role;
    }) => {
      const { error } = await supabase
        .from('list_members')
        .update({ role })
        .eq('list_id', listId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharingKeys.members }),
  });
}

/** Mitglied entfernen oder selbst die Liste verlassen */
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, userId }: { listId: string; userId: string }) => {
      const { error } = await supabase
        .from('list_members')
        .delete()
        .eq('list_id', listId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sharingKeys.members });
      void qc.invalidateQueries({ queryKey: keys.lists });
      void qc.invalidateQueries({ queryKey: keys.tasks });
    },
  });
}

// ---------------------------------------------------------------- Kommentare, Verlauf
export function useComments(taskId: string | undefined) {
  return useQuery({
    queryKey: sharingKeys.comments(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('id, task_id, author_id, body, mentions, created_at, profiles(name, avatar_url)')
        .eq('task_id', taskId!)
        .order('created_at');
      if (error) throw error;
      return data as unknown as Comment[];
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      body,
      mentions,
    }: {
      taskId: string;
      body: string;
      mentions: string[];
    }) => {
      const { error } = await supabase.from('comments').insert({ task_id: taskId, body, mentions });
      if (error) throw error;
    },
    onSuccess: (_v, { taskId }) => {
      void qc.invalidateQueries({ queryKey: sharingKeys.comments(taskId) });
      void qc.invalidateQueries({ queryKey: sharingKeys.activity(taskId) });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; taskId: string }) => {
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_v, { taskId }) => qc.invalidateQueries({ queryKey: sharingKeys.comments(taskId) }),
  });
}

export function useActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: sharingKeys.activity(taskId ?? ''),
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('id, task_id, actor_id, action, diff, created_at, profiles(name)')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as ActivityEntry[];
    },
  });
}

// ---------------------------------------------------------------- Mitteilungen
export function useNotifications() {
  return useQuery({
    queryKey: sharingKeys.notifications,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, task_id, payload, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AppNotification[];
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: sharingKeys.notifications }),
  });
}

export const queryKeys = { ...keys, ...sharingKeys };

// ---------------------------------------------------------------- Erinnerungen und Profil
export function useReminders(taskId: string | undefined) {
  return useQuery({
    queryKey: ['reminders', taskId ?? ''],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('id, task_id, offset_min, at, fire_at, sent_at')
        .eq('task_id', taskId!)
        .order('fire_at');
      if (error) throw error;
      return data as Reminder[];
    },
  });
}

export interface ReminderInput {
  offset_min?: number;
  at?: string;
}

export function useAddReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, items }: { taskId: string; items: ReminderInput[] }) => {
      const rows = items.map((i) => ({ task_id: taskId, ...i }));
      const { error } = await supabase.from('reminders').insert(rows);
      if (error) throw error;
    },
    onSuccess: (_v, { taskId }) => qc.invalidateQueries({ queryKey: ['reminders', taskId] }),
  });
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; taskId: string }) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_v, { taskId }) => qc.invalidateQueries({ queryKey: ['reminders', taskId] }),
  });
}

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId ?? ''],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, timezone, canton, theme, daily_digest_time')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as MyProfile | null;
    },
  });
}

export function useUpdateProfile(userId: string | undefined) {
  const qc = useQueryClient();
  const key = ['profile', userId ?? ''];
  return useMutation({
    mutationFn: async (
      patch: Partial<
        Pick<MyProfile, 'name' | 'timezone' | 'canton' | 'theme' | 'daily_digest_time'>
      >,
    ) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId!);
      if (error) throw error;
    },
    // Anzeige sofort ändern, bei einem Fehler zurücksetzen
    onMutate: async (patch) => {
      const previous = qc.getQueryData<MyProfile | null>(key);
      qc.setQueryData<MyProfile | null>(key, (old) => (old ? { ...old, ...patch } : old));
      await qc.cancelQueries({ queryKey: key }); // laufende Abfragen mit altem Stand verwerfen
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(key, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---------------------------------------------------------------- Intelligente Listen
export function useSavedFilters() {
  return useQuery({
    queryKey: ['saved-filters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_filters')
        .select('id, name, filter')
        .order('created_at');
      if (error) throw error;
      return data as SavedFilter[];
    },
  });
}

export function useSaveFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, filter }: { id?: string; name: string; filter: unknown }) => {
      const query = id
        ? supabase.from('saved_filters').update({ name, filter }).eq('id', id)
        : supabase.from('saved_filters').insert({ name, filter });
      const { data, error } = await query.select('id, name, filter').single();
      if (error) throw error;
      return data as SavedFilter;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters'] }),
  });
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_filters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-filters'] }),
  });
}
