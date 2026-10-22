import { diffDays, formatDay } from './dates';
import type { Task } from './types';

export type ViewKey = 'heute' | 'demnaechst' | 'ueberfaellig' | 'alle' | 'zugewiesen' | 'erledigt';

export const VIEWS: { key: ViewKey; label: string; icon: string }[] = [
  { key: 'heute', label: 'Heute', icon: '☀️' },
  { key: 'demnaechst', label: 'Demnächst', icon: '🗓️' },
  { key: 'ueberfaellig', label: 'Überfällig', icon: '⚠️' },
  { key: 'alle', label: 'Alle', icon: '📚' },
  { key: 'zugewiesen', label: 'Mir zugewiesen', icon: '🙋' },
  { key: 'erledigt', label: 'Erledigt', icon: '✅' },
];

export interface Section {
  key: string;
  title: string;
  tone?: 'danger';
  tasks: Task[];
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export const isDone = (t: Task) => t.status === 'done';
export const dueOf = (t: Task) => (t.due_at ? new Date(t.due_at) : null);

/** Überfällig: nicht erledigt und Fälligkeit vorbei (ganztägig: vor heute). */
export function isOverdue(t: Task, now: Date): boolean {
  const due = dueOf(t);
  if (isDone(t) || !due) return false;
  return t.due_all_day ? diffDays(due, now) < 0 : due.getTime() < now.getTime();
}

/** Sortierung: Fälligkeit (ohne Datum zuletzt), Priorität, Position, Erstellzeit. */
export function compareTasks(a: Task, b: Task): number {
  const da = dueOf(a)?.getTime() ?? Infinity;
  const db = dueOf(b)?.getTime() ?? Infinity;
  if (da !== db) return da < db ? -1 : 1;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  if (a.position !== b.position) return a.position - b.position;
  return a.created_at.localeCompare(b.created_at);
}

export function buildSections(
  view: ViewKey,
  tasks: Task[],
  now: Date,
  userId: string | undefined,
): Section[] {
  const open = tasks.filter((t) => !isDone(t));
  switch (view) {
    case 'heute': {
      const overdue = open.filter((t) => isOverdue(t, now)).sort(compareTasks);
      const today = open
        .filter((t) => !isOverdue(t, now) && dueOf(t) && diffDays(dueOf(t)!, now) === 0)
        .sort(compareTasks);
      const sections: Section[] = [
        { key: 'overdue', title: 'Überfällig', tone: 'danger', tasks: overdue },
        { key: 'today', title: 'Heute', tasks: today },
      ];
      return sections.filter((s) => s.tasks.length > 0);
    }
    case 'demnaechst': {
      const upcoming = open
        .filter((t) => {
          const due = dueOf(t);
          if (!due) return false;
          const d = diffDays(due, now);
          return d >= 1 && d <= 7;
        })
        .sort(compareTasks);
      const byDay = new Map<number, Task[]>();
      for (const t of upcoming) {
        const d = diffDays(dueOf(t)!, now);
        byDay.set(d, [...(byDay.get(d) ?? []), t]);
      }
      return [...byDay.entries()].map(([d, list]) => ({
        key: `day-${d}`,
        title: formatDay(dueOf(list[0])!, now),
        tasks: list,
      }));
    }
    case 'ueberfaellig':
      return nonEmpty(
        'overdue',
        'Überfällig',
        open.filter((t) => isOverdue(t, now)),
        'danger',
      );
    case 'alle':
      return nonEmpty('all', 'Alle offenen Pendenzen', open);
    case 'zugewiesen':
      return nonEmpty(
        'assigned',
        'Mir zugewiesen',
        open.filter((t) => t.assignee_id === userId),
      );
    case 'erledigt':
      return nonEmpty(
        'done',
        'Erledigt',
        tasks
          .filter(isDone)
          .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
        undefined,
        false,
      );
  }
}

function nonEmpty(
  key: string,
  title: string,
  tasks: Task[],
  tone?: 'danger',
  sort = true,
): Section[] {
  const list = sort ? [...tasks].sort(compareTasks) : tasks;
  return list.length ? [{ key, title, tone, tasks: list }] : [];
}

/** Anzahl für die Navigations-Badges. */
export function countFor(view: ViewKey, tasks: Task[], now: Date, userId?: string): number {
  if (view === 'erledigt') return 0;
  return buildSections(view, tasks, now, userId).reduce((n, s) => n + s.tasks.length, 0);
}

/** Einfache Suche über Titel, Notizen und Unteraufgaben (Gross-/Kleinschreibung egal). */
export function searchTasks(tasks: Task[], query: string): Task[] {
  const q = query.trim().toLocaleLowerCase('de-CH');
  if (!q) return [];
  return tasks
    .filter(
      (t) =>
        t.title.toLocaleLowerCase('de-CH').includes(q) ||
        t.notes_md.toLocaleLowerCase('de-CH').includes(q) ||
        t.subtasks.some((s) => s.title.toLocaleLowerCase('de-CH').includes(q)),
    )
    .sort(compareTasks);
}
