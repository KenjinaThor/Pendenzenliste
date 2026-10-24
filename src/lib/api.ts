import {
  onlineManager,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  MK,
  type AddRemindersVars,
  type AddSubtasksVars,
  type CreateTaskVars,
  type DeleteReminderVars,
  type DeleteSubtaskVars,
  type SetTagsVars,
  type UpdateSubtaskVars,
  type UpdateTaskVars,
} from './mutations';
import { isRecurring, nextOccurrence } from './recurrence';
import {
  MAX_ATTACHMENT_BYTES,
  isAllowedType,
  prepareUpload,
  sanitizeFileName,
} from './attachments';
import { normalizePayload } from './templates';
import { supabase } from './supabase';
import type {
  ActivityEntry,
  Attachment,
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
  Tag,
  Task,
  Template,
  TemplatePayload,
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
// Schreibzugriffe auf Pendenzen laufen über eine Warteschlange (siehe mutations.ts): Sie funktionieren ohne
// Verbindung, die Anzeige ändert sich sofort («optimistisch»), und der Server entscheidet bei Konflikten pro Feld.
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
  in_calendar?: boolean;
}

type TaskPatch = Partial<Omit<Task, 'id' | 'subtasks' | 'tags'>>;

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

function patchTask(qc: QueryClient, id: string, fn: (t: Task) => Task) {
  qc.setQueryData<Task[]>(keys.tasks, (old) => old?.map((t) => (t.id === id ? fn(t) : t)));
}

/** Aufgabe mit den Standardwerten der Datenbank, für die sofortige Anzeige vor dem Speichern. */
function draftTask(id: string, input: TaskInput): Task {
  const now = nowIso();
  return {
    notes_md: '',
    due_at: null,
    due_all_day: false,
    duration_min: null,
    priority: 'medium',
    status: 'open',
    assignee_id: null,
    rrule: null,
    repeat_mode: 'fixed',
    repeat_after_days: null,
    focus_date: null,
    in_calendar: true,
    completed_at: null,
    deleted_at: null,
    position: 0,
    created_at: now,
    updated_at: now,
    subtasks: [],
    tags: [],
    ...input,
    id,
  };
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, UpdateTaskVars, { previous?: Task[] }>({
    mutationKey: MK.updateTask,
    onMutate: (v) => {
      void qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      if (v.patch.deleted_at)
        qc.setQueryData<Task[]>(keys.tasks, (old) => old?.filter((t) => t.id !== v.id));
      else patchTask(qc, v.id, (t) => ({ ...t, ...(v.patch as TaskPatch) }));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.previous),
  });
  return {
    mutate: (v: { id: string; patch: TaskPatch }) =>
      m.mutate({ id: v.id, patch: v.patch, ts: nowIso() }),
  };
}

/** Legt eine Pendenz an (Kennung wird sofort vergeben, damit Unteraufgaben usw. gleich darauf folgen können). */
export function useCreateTask() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, CreateTaskVars, { previous?: Task[] }>({
    mutationKey: MK.createTask,
    onMutate: (v) => {
      void qc.cancelQueries({ queryKey: keys.tasks });
      const previous = qc.getQueryData<Task[]>(keys.tasks);
      qc.setQueryData<Task[]>(keys.tasks, (old) => [
        ...(old ?? []),
        draftTask(v.task.id, v.task as unknown as TaskInput),
      ]);
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(keys.tasks, ctx?.previous),
  });
  return (input: TaskInput): string => {
    const id = newId();
    m.mutate({ task: { ...input, id } });
    return id;
  };
}

export function useSetDone() {
  const update = useUpdateTask();
  return (task: Task, done: boolean) =>
    update.mutate({
      id: task.id,
      patch: { status: done ? 'done' : 'open', completed_at: done ? nowIso() : null },
    });
}

export interface CompletionResult {
  /** Fälligkeit der Folge-Pendenz bei wiederkehrenden Pendenzen */
  nextDue: Date | null;
  undo: () => Promise<void>;
}

/**
 * Pendenz erledigen. Wiederkehrende Pendenzen erzeugen dabei die nächste (atomar in der Datenbank, nur mit
 * Verbindung); «undo» macht beides rückgängig.
 */
export function useCompleteTask() {
  const qc = useQueryClient();
  const setDone = useSetDone();
  return async (task: Task): Promise<CompletionResult> => {
    const next = isRecurring(task) ? nextOccurrence(task, new Date()) : null;
    if (!next) {
      setDone(task, true);
      return { nextDue: null, undo: async () => setDone(task, false) };
    }
    if (!onlineManager.isOnline()) {
      throw new Error('Wiederkehrende Pendenzen lassen sich nur mit Internetverbindung abhaken.');
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

/** Tags einer Pendenz setzen (nach Namen). */
export function useSetTaskTags() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, SetTagsVars>({
    mutationKey: MK.setTags,
    onMutate: (v) => {
      const known = new Map(
        (qc.getQueryData<Task[]>(keys.tasks) ?? [])
          .flatMap((t) => t.tags)
          .map((t) => [t.name.toLocaleLowerCase('de-CH'), t]),
      );
      patchTask(qc, v.taskId, (t) => ({
        ...t,
        tags: v.names.map(
          (n) =>
            known.get(n.toLocaleLowerCase('de-CH')) ?? {
              id: `neu-${n}`,
              name: n,
              color: '#94a3b8',
            },
        ),
      }));
    },
  });
  return { mutate: (v: SetTagsVars) => m.mutate(v) };
}

/** In den Papierkorb verschieben bzw. wiederherstellen */
export function useTrashTask() {
  const qc = useQueryClient();
  const update = useUpdateTask();
  return {
    mutate: ({ id, trashed }: { id: string; trashed: boolean }) => {
      if (!trashed) qc.setQueryData<Task[]>(keys.trash, (old) => old?.filter((t) => t.id !== id));
      update.mutate({ id, patch: { deleted_at: trashed ? nowIso() : null } });
    },
  };
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
  const m = useMutation<void, Error, AddSubtasksVars>({
    mutationKey: MK.addSubtasks,
    onMutate: (v) => {
      patchTask(qc, v.taskId, (t) => ({
        ...t,
        subtasks: [...t.subtasks, ...v.rows.map((r) => ({ ...r, task_id: v.taskId, done: false }))],
      }));
    },
  });
  return {
    mutate: ({ taskId, titles, start }: { taskId: string; titles: string[]; start: number }) =>
      m.mutate({
        taskId,
        rows: titles.map((title, i) => ({ id: newId(), title, position: start + i })),
      }),
  };
}

export function useUpdateSubtask() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, UpdateSubtaskVars>({
    mutationKey: MK.updateSubtask,
    onMutate: (v) => {
      patchTask(qc, v.taskId, (t) => ({
        ...t,
        subtasks: t.subtasks.map((s) => (s.id === v.id ? { ...s, ...v.patch } : s)),
      }));
    },
  });
  return { mutate: (v: UpdateSubtaskVars) => m.mutate(v) };
}

export function useDeleteSubtask() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, DeleteSubtaskVars>({
    mutationKey: MK.deleteSubtask,
    onMutate: (v) => {
      patchTask(qc, v.taskId, (t) => ({ ...t, subtasks: t.subtasks.filter((s) => s.id !== v.id) }));
    },
  });
  return { mutate: (v: DeleteSubtaskVars) => m.mutate(v) };
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
  const m = useMutation<void, Error, AddRemindersVars>({
    mutationKey: MK.addReminders,
    onMutate: (v) => {
      qc.setQueryData<Reminder[]>(['reminders', v.taskId], (old) => [
        ...(old ?? []),
        ...v.rows.map((r) => ({
          offset_min: null,
          at: null,
          fire_at: null,
          sent_at: null,
          ...r,
          task_id: v.taskId,
        })),
      ]);
    },
  });
  return {
    mutate: ({ taskId, items }: { taskId: string; items: ReminderInput[] }) =>
      m.mutate({ taskId, rows: items.map((i) => ({ id: newId(), ...i })) }),
  };
}

export function useDeleteReminder() {
  const qc = useQueryClient();
  const m = useMutation<void, Error, DeleteReminderVars>({
    mutationKey: MK.deleteReminder,
    onMutate: (v) => {
      qc.setQueryData<Reminder[]>(['reminders', v.taskId], (old) =>
        old?.filter((r) => r.id !== v.id),
      );
    },
  });
  return { mutate: (v: DeleteReminderVars) => m.mutate(v) };
}

export function useMyProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId ?? ''],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*') // «*»: funktioniert auch, solange neue Spalten in der Datenbank noch fehlen
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
        Pick<
          MyProfile,
          'name' | 'timezone' | 'canton' | 'theme' | 'daily_digest_time' | 'calendar_default'
        >
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

// ---------------------------------------------------------------- Vorlagen
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('templates')
        .select('id, name, payload')
        .order('name');
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        payload: normalizePayload(t.payload),
      })) as Template[];
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      payload,
    }: {
      id?: string;
      name: string;
      payload: TemplatePayload;
    }) => {
      const query = id
        ? supabase.from('templates').update({ name, payload }).eq('id', id)
        : supabase.from('templates').insert({ name, payload });
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });
}

// ---------------------------------------------------------------- Dateianhänge (nur mit Verbindung)
export function useAttachments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', taskId ?? ''],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('id, task_id, storage_path, file_name, mime, size_bytes, created_at')
        .eq('task_id', taskId!)
        .order('created_at');
      if (error) throw error;
      return data as Attachment[];
    },
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ task, file }: { task: Pick<Task, 'id' | 'list_id'>; file: File }) => {
      if (!isAllowedType(file.type))
        throw new Error('Erlaubt sind Fotos (JPG, PNG, WebP, GIF, HEIC) und PDF-Dateien.');
      const prepared = await prepareUpload(file);
      if (prepared.size > MAX_ATTACHMENT_BYTES) throw new Error('Die Datei ist grösser als 5 MB.');
      const path = `${task.list_id}/${task.id}/${crypto.randomUUID()}-${sanitizeFileName(prepared.name)}`;
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(path, prepared, { contentType: prepared.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error } = await supabase.from('attachments').insert({
        task_id: task.id,
        storage_path: path,
        file_name: prepared.name.slice(0, 200),
        mime: prepared.type,
        size_bytes: prepared.size,
      });
      if (error) {
        await supabase.storage.from('attachments').remove([path]); // keine Datei ohne Eintrag zurücklassen
        throw error;
      }
    },
    onSuccess: (_v, { task }) => qc.invalidateQueries({ queryKey: ['attachments', task.id] }),
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Attachment) => {
      const { error } = await supabase.from('attachments').delete().eq('id', a.id);
      if (error) throw error;
      await supabase.storage.from('attachments').remove([a.storage_path]);
    },
    onSuccess: (_v, a) => qc.invalidateQueries({ queryKey: ['attachments', a.task_id] }),
  });
}

/** Kurzlebiger Link (60 Sekunden) zum Öffnen einer Datei. */
export async function attachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
  if (error || !data) throw error ?? new Error('Link konnte nicht erstellt werden');
  return data.signedUrl;
}
