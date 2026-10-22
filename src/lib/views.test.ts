import { describe, expect, it } from 'vitest';
import { buildSections, countFor, isOverdue, searchTasks } from './views';
import type { Task } from './types';

const now = new Date(2026, 9, 22, 10, 0);

let n = 0;
function task(p: Partial<Task>): Task {
  n += 1;
  return {
    id: `t${n}`,
    list_id: 'l1',
    title: `Aufgabe ${n}`,
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
    tags: [],
    completed_at: null,
    deleted_at: null,
    position: 0,
    created_at: `2026-10-0${(n % 9) + 1}T00:00:00Z`,
    updated_at: '2026-10-01T00:00:00Z',
    subtasks: [],
    ...p,
  };
}
const day = (offset: number, h = 0, m = 0) => new Date(2026, 9, 22 + offset, h, m).toISOString();

describe('views', () => {
  const tasks = [
    task({ title: 'gestern', due_at: day(-1) }),
    task({ title: 'heute ganztägig', due_at: day(0) }),
    task({ title: 'heute 08:00 vorbei', due_at: day(0, 8), due_all_day: false }),
    task({ title: 'heute 15:00', due_at: day(0, 15), due_all_day: false }),
    task({ title: 'morgen', due_at: day(1) }),
    task({ title: 'in 10 Tagen', due_at: day(10) }),
    task({ title: 'ohne Datum' }),
    task({
      title: 'erledigt',
      status: 'done',
      due_at: day(0),
      completed_at: '2026-10-22T08:00:00Z',
    }),
    task({ title: 'Anna', assignee_id: 'anna' }),
  ];

  it('isOverdue: ganztägig erst ab dem Folgetag, mit Uhrzeit ab dem Zeitpunkt', () => {
    expect(isOverdue(tasks[0], now)).toBe(true);
    expect(isOverdue(tasks[1], now)).toBe(false);
    expect(isOverdue(tasks[2], now)).toBe(true);
    expect(isOverdue(tasks[3], now)).toBe(false);
    expect(isOverdue(tasks[7], now)).toBe(false);
  });

  it('Heute: Überfälliges zuerst, dann Heutiges', () => {
    const s = buildSections('heute', tasks, now, 'me');
    expect(s.map((x) => x.title)).toEqual(['Überfällig', 'Heute']);
    expect(s[0].tasks.map((t) => t.title)).toEqual(['gestern', 'heute 08:00 vorbei']);
    expect(s[1].tasks.map((t) => t.title)).toEqual(['heute ganztägig', 'heute 15:00']);
  });

  it('Demnächst: 1 bis 7 Tage, gruppiert nach Tag', () => {
    const s = buildSections('demnaechst', tasks, now, 'me');
    expect(s).toHaveLength(1);
    expect(s[0].title).toBe('Morgen');
  });

  it('Alle, Erledigt, Mir zugewiesen', () => {
    expect(buildSections('alle', tasks, now, 'me')[0].tasks).toHaveLength(8);
    expect(buildSections('erledigt', tasks, now, 'me')[0].tasks[0].title).toBe('erledigt');
    expect(buildSections('zugewiesen', tasks, now, 'anna')[0].tasks[0].title).toBe('Anna');
    expect(buildSections('zugewiesen', tasks, now, 'me')).toEqual([]);
  });

  it('countFor', () => {
    expect(countFor('heute', tasks, now)).toBe(4);
    expect(countFor('ueberfaellig', tasks, now)).toBe(2);
  });

  it('searchTasks findet in Titel, Notizen und Unteraufgaben', () => {
    const list = [
      task({ title: 'Steuererklärung' }),
      task({ title: 'Einkaufen', notes_md: 'Milch und BROT' }),
      task({
        title: 'Ferien',
        subtasks: [{ id: 's', task_id: 'x', title: 'Pass erneuern', done: false, position: 0 }],
      }),
    ];
    expect(searchTasks(list, 'steuer')).toHaveLength(1);
    expect(searchTasks(list, 'brot')).toHaveLength(1);
    expect(searchTasks(list, 'pass')).toHaveLength(1);
    expect(searchTasks(list, '  ')).toEqual([]);
  });

  it('searchTasks findet auch Tags', () => {
    const list = [
      task({ title: 'Pass', tags: [{ id: 't', name: 'Reise', color: '#000' }] }),
      task({ title: 'Brot' }),
    ];
    expect(searchTasks(list, 'reise').map((t) => t.title)).toEqual(['Pass']);
  });
});
