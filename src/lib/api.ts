import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  ActivityEntry,
  AppNotification,
  Comment,
  Invite,
  Member,
  Priority,
  Role,
  Status,
  Subtask,
  Task,
  TodoList,
} from './types';

const keys = { lists: ['lists'], tasks: ['tasks'], trash: ['trash'] } as const;

const TASK_SELECT = '*, subtasks(*)';

function sortSubtasks(task: Task): Task {
  return { ...task, subtasks: [...(task.subtasks ?? [])].sort((a, b) => a.position - b.position) };
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
}

type TaskPatch = Partial<Omit<Task, 'id' | 'subtasks'>>;

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
