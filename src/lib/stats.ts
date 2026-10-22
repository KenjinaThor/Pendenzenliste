import { addDays, diffDays, toDateInput } from './dates';
import { weekStart } from './calendarGrid';
import type { Task } from './types';
import { dueOf, isDone, isOverdue } from './views';

export interface WeekBar {
  /** Montag der Woche */
  start: Date;
  /** Kalenderwoche-ähnliche Beschriftung «dd.mm.» */
  label: string;
  done: number;
}

export interface Stats {
  doneThisWeek: number;
  doneThisMonth: number;
  doneTotal: number;
  open: number;
  overdue: number;
  /** Anteil überfälliger an den offenen Pendenzen mit Fälligkeit (0–1) */
  overdueRate: number;
  /** aufeinanderfolgende Tage (bis heute oder gestern) mit mindestens einer erledigten Pendenz */
  streak: number;
  bestStreak: number;
  weeks: WeekBar[];
}

const dayKey = (iso: string) => toDateInput(new Date(iso));

export function computeStats(tasks: Task[], now: Date, weekCount = 8): Stats {
  const done = tasks.filter((t) => isDone(t) && t.completed_at);
  const open = tasks.filter((t) => !isDone(t));
  const withDue = open.filter((t) => dueOf(t));
  const overdue = open.filter((t) => isOverdue(t, now));

  const days = new Set(done.map((t) => dayKey(t.completed_at!)));
  const todayKey = toDateInput(now);
  const yesterdayKey = toDateInput(addDays(now, -1));

  // aktuelle Serie: ab heute rückwärts; ist heute noch nichts erledigt, zählt sie ab gestern weiter
  let streak = 0;
  if (days.has(todayKey) || days.has(yesterdayKey)) {
    for (
      let d = days.has(todayKey) ? now : addDays(now, -1);
      days.has(toDateInput(d));
      d = addDays(d, -1)
    )
      streak++;
  }

  // beste Serie über alle Tage
  let bestStreak = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of [...days].sort()) {
    const [y, m, dd] = key.split('-').map(Number);
    const d = new Date(y, m - 1, dd);
    run = previous && diffDays(d, previous) === 1 ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = d;
  }

  const thisWeek = weekStart(now);
  const weeks: WeekBar[] = Array.from({ length: weekCount }, (_, i) => {
    const start = addDays(thisWeek, -7 * (weekCount - 1 - i));
    const end = addDays(start, 7);
    const count = done.filter((t) => {
      const c = new Date(t.completed_at!);
      return c >= start && c < end;
    }).length;
    return {
      start,
      label: `${String(start.getDate()).padStart(2, '0')}.${String(start.getMonth() + 1).padStart(2, '0')}.`,
      done: count,
    };
  });

  return {
    doneThisWeek: weeks.at(-1)!.done,
    doneThisMonth: done.filter((t) => {
      const c = new Date(t.completed_at!);
      return c.getFullYear() === now.getFullYear() && c.getMonth() === now.getMonth();
    }).length,
    doneTotal: done.length,
    open: open.length,
    overdue: overdue.length,
    overdueRate: withDue.length ? overdue.length / withDue.length : 0,
    streak,
    bestStreak,
    weeks,
  };
}
