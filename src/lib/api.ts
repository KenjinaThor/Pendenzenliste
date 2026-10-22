import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Priority, Status, Subtask, Task, TodoList } from './types';

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
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.lists }),
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
