import type { Priority, Task, TemplatePayload } from './types';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

/** Vorlage aus einer vorhandenen Pendenz (ohne Datum, Person und Status). */
export function taskToTemplate(task: Task): TemplatePayload {
  return {
    title: task.title,
    notes_md: task.notes_md,
    priority: task.priority,
    duration_min: task.duration_min,
    tags: task.tags.map((t) => t.name),
    subtasks: task.subtasks.map((s) => s.title),
  };
}

/** Gespeicherte Vorlagen können unvollständig sein (ältere Versionen, Import): fehlende Felder ergänzen. */
export function normalizePayload(raw: unknown): TemplatePayload {
  const r = (raw ?? {}) as Partial<TemplatePayload>;
  const strings = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim())
      : [];
  return {
    title: typeof r.title === 'string' ? r.title : '',
    notes_md: typeof r.notes_md === 'string' ? r.notes_md : '',
    priority: PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : 'medium',
    duration_min: typeof r.duration_min === 'number' && r.duration_min > 0 ? r.duration_min : null,
    tags: strings(r.tags),
    subtasks: strings(r.subtasks),
  };
}

/** Eine Unteraufgabe pro Zeile; Aufzählungszeichen und Leerzeilen werden entfernt. */
export function parseSubtaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•☐☑]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}
