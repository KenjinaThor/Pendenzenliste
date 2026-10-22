import { addDays, startOfDay, toDateInput } from './dates';
import type { Task } from './types';

/** Montag der Woche, in der das Datum liegt */
export const weekStart = (d: Date) => startOfDay(addDays(d, -((d.getDay() + 6) % 7)));

/** 6 Wochen × 7 Tage, beginnend mit dem Montag der Woche des Monatsersten */
export function monthGrid(year: number, month: number): Date[] {
  const first = weekStart(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export const weekDays = (anchor: Date): Date[] => {
  const start = weekStart(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** Offene Pendenzen mit Fälligkeit nach Kalendertag (YYYY-MM-DD) gruppiert */
export function tasksByDay(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!t.due_at || t.status === 'done') continue;
    const key = toDateInput(new Date(t.due_at));
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        Number(a.due_all_day ? 0 : 1) - Number(b.due_all_day ? 0 : 1) ||
        a.due_at!.localeCompare(b.due_at!),
    );
  }
  return map;
}

/** Neue Fälligkeit beim Verschieben auf einen anderen Tag (Uhrzeit bleibt erhalten). */
export function moveDueToDay(
  task: Pick<Task, 'due_at' | 'due_all_day'>,
  day: Date,
): { due_at: string; due_all_day: boolean } {
  const due = task.due_at ? new Date(task.due_at) : null;
  const allDay = task.due_all_day || !due;
  const next = allDay
    ? new Date(day.getFullYear(), day.getMonth(), day.getDate())
    : new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        due!.getHours(),
        due!.getMinutes(),
      );
  return { due_at: next.toISOString(), due_all_day: allDay };
}
