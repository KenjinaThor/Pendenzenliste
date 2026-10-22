// Filtern und Sortieren von Pendenzen; gespeicherte Filter sind die «Intelligenten Listen».
import type { Priority, Status, Task } from './types';
import { compareTasks, dueOf } from './views';

export type SortKey = 'due' | 'priority' | 'title' | 'created';

export interface TaskFilter {
  sort: SortKey;
  priorities: Priority[];
  /** Tag-Namen (die Pendenz braucht mindestens einen davon) */
  tags: string[];
  /** 'any' | 'me' | 'none' (niemand) | Benutzer-ID */
  assignee: string;
  /** leer = alle (erledigte werden von den Ansichten selbst behandelt) */
  statuses: Status[];
  /** leer = alle Listen */
  listIds: string[];
}

export const EMPTY_FILTER: TaskFilter = {
  sort: 'due',
  priorities: [],
  tags: [],
  assignee: 'any',
  statuses: [],
  listIds: [],
};

export const SORT_LABEL: Record<SortKey, string> = {
  due: 'Fälligkeit',
  priority: 'Priorität',
  title: 'Titel',
  created: 'Neueste zuerst',
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const list = [...tasks];
  switch (sort) {
    case 'due':
      return list.sort(compareTasks);
    case 'priority':
      return list.sort(
        (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareTasks(a, b),
      );
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'de-CH', { sensitivity: 'base' }));
    case 'created':
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export function applyFilter(tasks: Task[], f: TaskFilter, userId: string | undefined): Task[] {
  const tagSet = new Set(f.tags.map((t) => t.toLocaleLowerCase('de-CH')));
  const filtered = tasks.filter((t) => {
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.listIds.length && !f.listIds.includes(t.list_id)) return false;
    if (tagSet.size && !t.tags.some((x) => tagSet.has(x.name.toLocaleLowerCase('de-CH'))))
      return false;
    if (f.assignee === 'me' && t.assignee_id !== userId) return false;
    if (f.assignee === 'none' && t.assignee_id !== null) return false;
    if (!['any', 'me', 'none'].includes(f.assignee) && t.assignee_id !== f.assignee) return false;
    return true;
  });
  return sortTasks(filtered, f.sort);
}

/** Anzahl aktiver Einschränkungen (ohne Sortierung) – für das Zähler-Symbol */
export function activeFilterCount(f: TaskFilter): number {
  return (
    (f.priorities.length ? 1 : 0) +
    (f.tags.length ? 1 : 0) +
    (f.assignee !== 'any' ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.listIds.length ? 1 : 0)
  );
}

export const isDefaultFilter = (f: TaskFilter) => activeFilterCount(f) === 0 && f.sort === 'due';

/** Gespeicherte Filter können von älteren Versionen stammen: fehlende Felder ergänzen. */
export function normalizeFilter(raw: Partial<TaskFilter> | null | undefined): TaskFilter {
  return { ...EMPTY_FILTER, ...(raw ?? {}) };
}

// Hilfsfunktion für «Alle Pendenzen mit Datum»-Auswertungen
export const hasDue = (t: Task) => dueOf(t) !== null;
