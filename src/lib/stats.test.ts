import { describe, expect, it } from 'vitest';
import { computeStats } from './stats';
import { focusTasks } from './views';
import type { Task } from './types';

// Donnerstag, 22.10.2026
const now = new Date(2026, 9, 22, 18, 0);
let n = 0;
const task = (p: Partial<Task>): Task => {
  n += 1;
  return {
    id: `t${n}`,
    list_id: 'l',
    title: `T${n}`,
    notes_md: '',
    due_at: null,
    due_all_day: true,
    duration_min: null,
    priority: 'medium',
    status: 'open',
    assignee_id: null,
    rrule: null,
    repeat_mode: 'fixed',
    repeat_after_days: null,
    focus_date: null,
    completed_at: null,
    deleted_at: null,
    position: 0,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    subtasks: [],
    tags: [],
    ...p,
  };
};
const doneOn = (y: number, m: number, d: number, h = 12) =>
  task({ status: 'done', completed_at: new Date(y, m - 1, d, h).toISOString() });

describe('computeStats', () => {
  it('zählt erledigte Pendenzen pro Woche und Monat', () => {
    const tasks = [
      doneOn(2026, 10, 22),
      doneOn(2026, 10, 20), // diese Woche (Mo 19.10.)
      doneOn(2026, 10, 15), // Vorwoche
      doneOn(2026, 9, 30), // letzter Monat
    ];
    const s = computeStats(tasks, now);
    expect(s.doneThisWeek).toBe(2);
    expect(s.doneThisMonth).toBe(3);
    expect(s.doneTotal).toBe(4);
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks.at(-1)).toMatchObject({ label: '19.10.', done: 2 });
    expect(s.weeks.at(-2)).toMatchObject({ label: '12.10.', done: 1 });
    expect(s.weeks.reduce((a, w) => a + w.done, 0)).toBe(4);
  });

  it('Überfälligkeitsquote', () => {
    const s = computeStats(
      [
        task({ due_at: new Date(2026, 9, 20).toISOString() }), // überfällig
        task({ due_at: new Date(2026, 9, 25).toISOString() }),
        task({ due_at: new Date(2026, 9, 22).toISOString() }), // heute, noch nicht überfällig
        task({ due_at: new Date(2026, 9, 28).toISOString() }),
        task({}), // ohne Datum zählt nicht
      ],
      now,
    );
    expect(s.open).toBe(5);
    expect(s.overdue).toBe(1);
    expect(s.overdueRate).toBeCloseTo(0.25);
    expect(computeStats([], now).overdueRate).toBe(0);
  });

  it('Serie: bis heute, oder bis gestern wenn heute noch nichts erledigt ist', () => {
    const run = [
      doneOn(2026, 10, 22),
      doneOn(2026, 10, 21),
      doneOn(2026, 10, 21, 8),
      doneOn(2026, 10, 20),
      doneOn(2026, 10, 18),
    ];
    expect(computeStats(run, now).streak).toBe(3);
    expect(computeStats(run.slice(1), now).streak).toBe(2); // heute nichts → ab gestern
    expect(computeStats([doneOn(2026, 10, 19)], now).streak).toBe(0); // Lücke
    expect(computeStats([], now).streak).toBe(0);
  });

  it('beste Serie über alle Tage', () => {
    const tasks = [
      doneOn(2026, 8, 1),
      doneOn(2026, 8, 2),
      doneOn(2026, 8, 3),
      doneOn(2026, 8, 4),
      doneOn(2026, 10, 22),
    ];
    const s = computeStats(tasks, now);
    expect(s.bestStreak).toBe(4);
    expect(s.streak).toBe(1);
  });
});

describe('focusTasks', () => {
  it('nur offene Pendenzen mit dem heutigen Datum', () => {
    const tasks = [
      task({ title: 'A', focus_date: '2026-10-22' }),
      task({ title: 'B', focus_date: '2026-10-21' }), // gestern → nicht mehr im Fokus
      task({ title: 'C', focus_date: '2026-10-22', status: 'done' }),
      task({ title: 'D' }),
    ];
    expect(focusTasks(tasks, '2026-10-22').map((t) => t.title)).toEqual(['A']);
  });
});
