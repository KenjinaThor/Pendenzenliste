import type { Task } from './types';

/** Felder, die der Editor setzt (andere Felder wie focus_date bleiben unangetastet). */
export type EditableValues = Pick<
  Task,
  | 'list_id'
  | 'title'
  | 'notes_md'
  | 'due_at'
  | 'due_all_day'
  | 'duration_min'
  | 'priority'
  | 'status'
  | 'assignee_id'
  | 'rrule'
  | 'repeat_mode'
  | 'repeat_after_days'
  | 'in_calendar'
>;

const same = (key: keyof EditableValues, a: unknown, b: unknown) =>
  key === 'due_at'
    ? (a ? new Date(a as string).getTime() : null) === (b ? new Date(b as string).getTime() : null)
    : a === b;

/**
 * Nur die tatsächlich geänderten Felder. So überschreibt Speichern nicht unbemerkt, was eine andere Person
 * inzwischen an anderen Feldern geändert hat (zusammen mit dem Zeitstempel pro Feld auf dem Server).
 */
export function changedFields(existing: Task, values: EditableValues): Partial<Task> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(values) as (keyof EditableValues)[]) {
    // fehlende Angabe (ältere Datenbank) gilt als «im Kalender»
    const current = key === 'in_calendar' ? (existing.in_calendar ?? true) : existing[key];
    if (!same(key, current, values[key])) patch[key] = values[key];
  }
  if ('status' in patch) {
    patch.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
  }
  return patch as Partial<Task>;
}
