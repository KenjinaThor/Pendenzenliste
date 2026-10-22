// Schreibzugriffe, die auch ohne Verbindung funktionieren: Sie landen in einer Warteschlange (in der Reihenfolge
// der Eingabe), werden bei Verbindung automatisch ausgeführt und überstehen ein Neuladen der App (IndexedDB).
// Die Funktionen müssen deshalb mit einfachen, speicherbaren Daten auskommen und dürfen mehrfach laufen.
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export const MK = {
  updateTask: ['mutation', 'task-update'],
  createTask: ['mutation', 'task-create'],
  addSubtasks: ['mutation', 'subtask-add'],
  updateSubtask: ['mutation', 'subtask-update'],
  deleteSubtask: ['mutation', 'subtask-delete'],
  setTags: ['mutation', 'task-tags'],
  addReminders: ['mutation', 'reminder-add'],
  deleteReminder: ['mutation', 'reminder-delete'],
} as const;

export interface UpdateTaskVars {
  id: string;
  patch: Record<string, unknown>;
  /** Zeitpunkt der Bearbeitung (nicht der Synchronisierung) – bestimmt, welche Änderung pro Feld gewinnt */
  ts: string;
}
export interface CreateTaskVars {
  task: Record<string, unknown> & { id: string };
}
export interface AddSubtasksVars {
  taskId: string;
  rows: { id: string; title: string; position: number }[];
}
export interface UpdateSubtaskVars {
  id: string;
  taskId: string;
  patch: { title?: string; done?: boolean; position?: number };
}
export interface DeleteSubtaskVars {
  id: string;
  taskId: string;
}
export interface SetTagsVars {
  taskId: string;
  listId: string;
  names: string[];
}
export interface AddRemindersVars {
  taskId: string;
  rows: { id: string; offset_min?: number; at?: string }[];
}
export interface DeleteReminderVars {
  id: string;
  taskId: string;
}

const DUPLICATE = '23505'; // eindeutiger Schlüssel existiert schon → der Eintrag wurde bereits übertragen

/** Nur Felder, die der Server kennt; abgeleitete Werte (completed_at, updated_at, …) berechnet er selbst. */
const SERVER_FIELDS = new Set([
  'list_id',
  'title',
  'notes_md',
  'due_at',
  'due_all_day',
  'duration_min',
  'priority',
  'status',
  'assignee_id',
  'rrule',
  'repeat_mode',
  'repeat_after_days',
  'focus_date',
  'deleted_at',
  'position',
]);

async function updateTask({ id, patch, ts }: UpdateTaskVars) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => SERVER_FIELDS.has(k)));
  if (Object.keys(clean).length === 0) return;
  const { error } = await supabase.rpc('update_task_fields', {
    p_task: id,
    p_patch: clean,
    p_ts: ts,
  });
  if (!error) return;
  // Ist die Datenbank-Funktion noch nicht eingerichtet (Migration 6 fehlt), direkt speichern – ohne Konfliktregel.
  if (error.code === 'PGRST202' || /update_task_fields/.test(error.message)) {
    const { error: directError } = await supabase.from('tasks').update(clean).eq('id', id);
    if (directError) throw directError;
    return;
  }
  throw error;
}

async function createTask({ task }: CreateTaskVars) {
  const { error } = await supabase.from('tasks').insert(task);
  if (error && error.code !== DUPLICATE) throw error;
}

async function addSubtasks({ taskId, rows }: AddSubtasksVars) {
  const { error } = await supabase.from('subtasks').upsert(
    rows.map((r) => ({ ...r, task_id: taskId })),
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function updateSubtask({ id, patch }: UpdateSubtaskVars) {
  const { error } = await supabase.from('subtasks').update(patch).eq('id', id);
  if (error) throw error;
}

async function deleteSubtask({ id }: DeleteSubtaskVars) {
  const { error } = await supabase.from('subtasks').delete().eq('id', id);
  if (error) throw error;
}

/** Tags einer Pendenz setzen (nach Namen); fehlende Tags werden in der Liste der Pendenz angelegt. */
async function setTags({ taskId, listId, names }: SetTagsVars) {
  const lower = (s: string) => s.toLocaleLowerCase('de-CH');
  const wanted = [...new Map(names.map((n) => [lower(n.trim()), n.trim()])).values()].filter(
    Boolean,
  );
  const { data: existing, error } = await supabase
    .from('tags')
    .select('id, name')
    .eq('list_id', listId);
  if (error) throw error;
  const byName = new Map((existing ?? []).map((t) => [lower(t.name), t.id as string]));

  const missing = wanted.filter((n) => !byName.has(lower(n)));
  if (missing.length) {
    const { data: created, error: insertError } = await supabase
      .from('tags')
      .insert(missing.map((name) => ({ list_id: listId, name })))
      .select('id, name');
    if (insertError) throw insertError;
    for (const t of created ?? []) byName.set(lower(t.name), t.id as string);
  }
  const wantedIds = new Set(wanted.map((n) => byName.get(lower(n))!));

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
}

async function addReminders({ taskId, rows }: AddRemindersVars) {
  const { error } = await supabase.from('reminders').upsert(
    rows.map((r) => ({ ...r, task_id: taskId })),
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

async function deleteReminder({ id }: DeleteReminderVars) {
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) throw error;
}

/** Verbindungsfehler (im Gegensatz zu Fehlern des Servers wie «keine Berechtigung») lohnen einen neuen Versuch. */
export function isNetworkError(error: unknown): boolean {
  const e = error as { message?: string; code?: string; status?: number } | null;
  if (!e) return false;
  if (typeof e.status === 'number' && e.status >= 500) return true;
  return !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? '');
}

/**
 * Hinterlegt Ausführung und Einstellungen aller Warteschlangen-Schreibzugriffe. Nur so können sie nach einem
 * Neuladen der App fortgesetzt werden (die Funktionen selbst lassen sich nicht speichern).
 */
export function registerMutationDefaults(qc: QueryClient) {
  // Erst wenn die ganze Warteschlange abgearbeitet ist, die Daten neu laden. Sonst würden Zwischenstände
  // (z. B. die Pendenz ist gespeichert, ihre Tags noch nicht) kurz angezeigt und die lokale Ansicht überschreiben.
  const refresh = () => () => {
    const waiting = qc.getMutationCache().findAll({
      predicate: (m) => m.state.status === 'pending' && m.options.scope?.id === 'sync',
    }).length;
    if (waiting > 1) return undefined; // die laufende Änderung zählt mit; die letzte lädt neu
    return Promise.all(
      ['tasks', 'trash', 'reminders'].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    ).then(() => undefined);
  };
  const queued = {
    scope: { id: 'sync' }, // gemeinsame Warteschlange: eine nach der anderen, in der Reihenfolge der Eingabe
    networkMode: 'online' as const, // ohne Verbindung warten
    retry: (count: number, error: unknown) => count < 4 && isNetworkError(error),
    retryDelay: (count: number) => Math.min(1000 * 2 ** count, 15_000),
  };
  qc.setMutationDefaults(MK.updateTask, {
    ...queued,
    mutationFn: updateTask,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.createTask, {
    ...queued,
    mutationFn: createTask,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.addSubtasks, {
    ...queued,
    mutationFn: addSubtasks,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.updateSubtask, {
    ...queued,
    mutationFn: updateSubtask,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.deleteSubtask, {
    ...queued,
    mutationFn: deleteSubtask,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.setTags, {
    ...queued,
    mutationFn: setTags,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.addReminders, {
    ...queued,
    mutationFn: addReminders,
    onSettled: refresh(),
  });
  qc.setMutationDefaults(MK.deleteReminder, {
    ...queued,
    mutationFn: deleteReminder,
    onSettled: refresh(),
  });
}
