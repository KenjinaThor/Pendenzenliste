import { describe, expect, it } from 'vitest';
import { BOM } from './csv';
import { buildBackup, parseBackup, parseImportFile, parseTasksCsv, tasksToCsv } from './exchange';
import type { Task, TodoList } from './types';

const list: TodoList = {
  id: 'l1',
  owner_id: 'u',
  name: 'Privat',
  color: '#6366f1',
  emoji: '🏠',
  position: 0,
  archived_at: null,
};
const task = (p: Partial<Task>): Task => ({
  id: 't',
  list_id: 'l1',
  title: 'Test',
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
});

describe('CSV-Import', () => {
  it('liest die Spalten (auch mit anderen Namen) und erkennt Werte', () => {
    const csv = [
      'Aufgabe;Datum;Zeit;Prio;Status;Labels;Beschreibung;Liste',
      'Steuern;15.11.2026;14:30;hoch;in arbeit;Privat, Wichtig;"Belege sammeln\nBank anrufen";Büro',
      'Milch;2026-11-01;;niedrig;;;;',
    ].join('\n');
    const r = parseTasksCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks[0]).toMatchObject({
      title: 'Steuern',
      priority: 'high',
      status: 'in_progress',
      tags: ['Privat', 'Wichtig'],
      list: 'Büro',
      due_all_day: false,
      notes_md: 'Belege sammeln\nBank anrufen',
    });
    expect(new Date(r.tasks[0].due_at!).getTime()).toBe(new Date(2026, 10, 15, 14, 30).getTime());
    expect(r.tasks[1]).toMatchObject({
      title: 'Milch',
      priority: 'low',
      due_all_day: true,
      list: null,
    });
    expect(new Date(r.tasks[1].due_at!).getTime()).toBe(new Date(2026, 10, 1).getTime());
  });

  it('meldet Probleme mit Zeilennummer, importiert den Rest', () => {
    const r = parseTasksCsv(
      'Titel;Fällig;Priorität\nOK;01.02.2027;mittel\n;01.01.2027;hoch\nKaputt;31.02.2027;extrem',
    );
    expect(r.tasks.map((t) => t.title)).toEqual(['OK', 'Kaputt']);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 4]);
    expect(r.errors[0].message).toMatch(/Titel fehlt/);
    expect(r.tasks[1].due_at).toBeNull();
    expect(r.tasks[1].priority).toBe('medium');
  });

  it('ohne Titel-Spalte oder leer', () => {
    expect(parseTasksCsv('Foo;Bar\n1;2').errors[0].message).toMatch(/Spalte «Titel»/);
    expect(parseTasksCsv('').errors[0].message).toMatch(/leer/);
  });

  it('Unteraufgaben, erledigt und Wiederholung', () => {
    const r = parseTasksCsv(
      'Titel;Unteraufgaben;Status;Fällig;Wiederholung\nPacken;[x] Pass | [ ] Koffer | Tickets;Erledigt;01.12.2026;jeden Montag',
    );
    expect(r.errors).toEqual([]);
    expect(r.tasks[0].subtasks).toEqual([
      { title: 'Pass', done: true },
      { title: 'Koffer', done: false },
      { title: 'Tickets', done: false },
    ]);
    expect(r.tasks[0].status).toBe('done');
    expect(r.tasks[0].rrule).toBe('FREQ=WEEKLY;BYDAY=MO');
    const after = parseTasksCsv('Titel;Fällig;Regel\nX;01.12.2026;after:3');
    expect(after.tasks[0]).toMatchObject({ repeat_mode: 'after_completion', repeat_after_days: 3 });
    const noDue = parseTasksCsv('Titel;Regel\nX;FREQ=DAILY'); // ohne Datum keine Wiederholung
    expect(noDue.tasks[0].rrule).toBeNull();
  });
});

describe('CSV-Export und Rundlauf', () => {
  it('exportiert mit Kopfzeile, BOM und Umlauten und lässt sich wieder importieren', () => {
    const tasks = [
      task({
        title: 'Einkaufen; Brot',
        notes_md: 'a\nb',
        due_at: new Date(2026, 10, 15, 9, 30).toISOString(),
        due_all_day: false,
        priority: 'high',
        duration_min: 45,
        tags: [{ id: '1', name: 'Haushalt', color: '#000' }],
        subtasks: [{ id: 's', task_id: 't', title: 'Milch', done: true, position: 0 }],
        rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
      }),
      task({
        title: 'Erledigt',
        status: 'done',
        completed_at: new Date(2026, 9, 1, 12).toISOString(),
      }),
    ];
    const csv = tasksToCsv(tasks, () => 'Privat');
    expect(csv.startsWith(BOM + 'Liste;Titel;')).toBe(true);
    const back = parseTasksCsv(csv);
    expect(back.errors).toEqual([]);
    expect(back.tasks[0]).toMatchObject({
      list: 'Privat',
      title: 'Einkaufen; Brot',
      notes_md: 'a\nb',
      priority: 'high',
      duration_min: 45,
      tags: ['Haushalt'],
      rrule: 'FREQ=WEEKLY;BYDAY=MO,WE',
      due_all_day: false,
      subtasks: [{ title: 'Milch', done: true }],
    });
    expect(new Date(back.tasks[0].due_at!).getTime()).toBe(new Date(2026, 10, 15, 9, 30).getTime());
    expect(back.tasks[1]).toMatchObject({ title: 'Erledigt', status: 'done' });
  });
});

describe('JSON-Backup', () => {
  it('Rundlauf', () => {
    const json = buildBackup({
      lists: [list],
      tasks: [
        task({ title: 'A', priority: 'low', tags: [{ id: '1', name: 'x', color: '#000' }] }),
        task({ title: 'B', status: 'done' }),
      ],
      templates: [
        {
          id: 't',
          name: 'Ferien',
          payload: {
            title: 'Ferien',
            notes_md: '',
            priority: 'medium',
            duration_min: null,
            tags: [],
            subtasks: ['Pass'],
          },
        },
      ],
      savedFilters: [{ id: 'f', name: 'Wichtig', filter: { priorities: ['high'] } }],
    });
    const r = parseBackup(json);
    expect(r.errors).toEqual([]);
    expect(r.tasks.map((t) => [t.title, t.list, t.priority, t.status])).toEqual([
      ['A', 'Privat', 'low', 'open'],
      ['B', 'Privat', 'medium', 'done'],
    ]);
    expect(r.tasks[0].tags).toEqual(['x']);
    expect(r.lists).toEqual([{ name: 'Privat', emoji: '🏠', color: '#6366f1' }]);
    expect(r.templates[0].name).toBe('Ferien');
    expect(r.savedFilters[0]).toEqual({ name: 'Wichtig', filter: { priorities: ['high'] } });
  });
  it('ungültige Dateien', () => {
    expect(parseBackup('kein json').errors[0].message).toMatch(/kein gültiges JSON/);
    expect(parseBackup('{"foo":1}').errors[0].message).toMatch(/kein Pendenzen-Backup/);
    const partial = parseBackup(
      '{"app":"pendenzen","tasks":[{"title":"ok","priority":"kaputt"},{"title":""},42]}',
    );
    expect(partial.tasks).toHaveLength(1);
    expect(partial.tasks[0].priority).toBe('medium');
    expect(partial.errors).toHaveLength(2);
  });
  it('erkennt das Format am Inhalt', () => {
    expect(parseImportFile('daten.txt', '{"app":"pendenzen","tasks":[]}').errors).toEqual([]);
    expect(parseImportFile('x.csv', 'Titel\nA').tasks).toHaveLength(1);
  });
});
