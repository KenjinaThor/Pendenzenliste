import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  activeFilterCount,
  applyFilter,
  normalizeFilter,
  sortTasks,
} from './filters';
import type { Task } from './types';

let n = 0;
const task = (p: Partial<Task>): Task => {
  n += 1;
  return {
    id: `t${n}`,
    list_id: 'l1',
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
    created_at: `2026-10-0${n}T00:00:00Z`,
    updated_at: '2026-10-01T00:00:00Z',
    subtasks: [],
    tags: [],
    ...p,
  };
};
const tag = (name: string) => ({ id: name, name, color: '#000' });

const tasks = [
  task({
    title: 'Zahnarzt',
    priority: 'high',
    tags: [tag('Gesundheit')],
    assignee_id: 'me',
    due_at: '2026-10-25T00:00:00Z',
  }),
  task({ title: 'Einkaufen', priority: 'low', tags: [tag('Haushalt')], list_id: 'l2' }),
  task({
    title: 'Ärger melden',
    priority: 'medium',
    status: 'waiting',
    assignee_id: 'ben',
    due_at: '2026-10-23T00:00:00Z',
  }),
  task({ title: 'Büro', priority: 'high', tags: [tag('Haushalt'), tag('Gesundheit')] }),
];
const f = (p: Partial<typeof EMPTY_FILTER>) => ({ ...EMPTY_FILTER, ...p });
const titles = (list: Task[]) => list.map((t) => t.title);

describe('applyFilter', () => {
  it('ohne Einschränkung alles, nach Fälligkeit sortiert (ohne Datum zuletzt)', () => {
    expect(titles(applyFilter(tasks, EMPTY_FILTER, 'me'))).toEqual([
      'Ärger melden',
      'Zahnarzt',
      'Büro',
      'Einkaufen',
    ]);
  });
  it('Priorität, Status, Liste', () => {
    expect(titles(applyFilter(tasks, f({ priorities: ['high'] }), 'me'))).toEqual([
      'Zahnarzt',
      'Büro',
    ]);
    expect(titles(applyFilter(tasks, f({ statuses: ['waiting'] }), 'me'))).toEqual([
      'Ärger melden',
    ]);
    expect(titles(applyFilter(tasks, f({ listIds: ['l2'] }), 'me'))).toEqual(['Einkaufen']);
  });
  it('Tags: mindestens einer, Gross-/Kleinschreibung egal', () => {
    expect(titles(applyFilter(tasks, f({ tags: ['haushalt'] }), 'me')).sort()).toEqual([
      'Büro',
      'Einkaufen',
    ]);
    expect(titles(applyFilter(tasks, f({ tags: ['Haushalt', 'Gesundheit'] }), 'me'))).toHaveLength(
      3,
    );
  });
  it('Person: ich, niemand, bestimmte Person', () => {
    expect(titles(applyFilter(tasks, f({ assignee: 'me' }), 'me'))).toEqual(['Zahnarzt']);
    expect(titles(applyFilter(tasks, f({ assignee: 'none' }), 'me')).sort()).toEqual([
      'Büro',
      'Einkaufen',
    ]);
    expect(titles(applyFilter(tasks, f({ assignee: 'ben' }), 'me'))).toEqual(['Ärger melden']);
  });
  it('Kombination', () => {
    expect(
      titles(
        applyFilter(
          tasks,
          f({ priorities: ['high'], tags: ['Gesundheit'], assignee: 'none' }),
          'me',
        ),
      ),
    ).toEqual(['Büro']);
  });
});

describe('sortTasks', () => {
  it('nach Priorität, Titel und Erstelldatum', () => {
    expect(titles(sortTasks(tasks, 'priority'))).toEqual([
      'Zahnarzt',
      'Büro',
      'Ärger melden',
      'Einkaufen',
    ]);
    expect(titles(sortTasks(tasks, 'title'))).toEqual([
      'Ärger melden',
      'Büro',
      'Einkaufen',
      'Zahnarzt',
    ]);
    expect(titles(sortTasks(tasks, 'created'))[0]).toBe('Büro');
  });
});

describe('Hilfen', () => {
  it('zählt aktive Einschränkungen und ergänzt alte Filter', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount(f({ priorities: ['low'], tags: ['x'], assignee: 'me' }))).toBe(3);
    expect(normalizeFilter({ priorities: ['high'] })).toEqual(f({ priorities: ['high'] }));
    expect(normalizeFilter(null)).toEqual(EMPTY_FILTER);
  });
});
