import { describe, expect, it } from 'vitest';
import { monthGrid, moveDueToDay, tasksByDay, weekDays, weekStart } from './calendarGrid';
import { toDateInput } from './dates';
import { CANTONS, easterSunday, holidaysFor } from './holidays';
import type { Task } from './types';

const ymd = (d: Date) => toDateInput(d);

describe('Kalenderraster', () => {
  it('Woche beginnt am Montag', () => {
    expect(ymd(weekStart(new Date(2026, 9, 22)))).toBe('2026-10-19'); // Donnerstag
    expect(ymd(weekStart(new Date(2026, 9, 25)))).toBe('2026-10-19'); // Sonntag
    expect(weekDays(new Date(2026, 9, 22)).map(ymd)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });
  it('Monatsraster: 42 Tage, erster Tag ein Montag, enthält den ganzen Monat', () => {
    const grid = monthGrid(2026, 9); // Oktober 2026 (1. Oktober = Donnerstag)
    expect(grid).toHaveLength(42);
    expect(ymd(grid[0])).toBe('2026-09-28');
    expect(ymd(grid[3])).toBe('2026-10-01');
    expect(grid.filter((d) => d.getMonth() === 9)).toHaveLength(31);
    expect(monthGrid(2026, 1)[0].getDay()).toBe(1); // Februar 2026
  });
  it('Pendenzen nach Tag gruppieren (ohne erledigte), Ganztägige zuerst', () => {
    const base = { due_all_day: false, status: 'open' } as Task;
    const tasks = [
      { ...base, id: 'b', due_at: new Date(2026, 9, 22, 15).toISOString() },
      { ...base, id: 'a', due_at: new Date(2026, 9, 22, 9).toISOString() },
      { ...base, id: 'c', due_all_day: true, due_at: new Date(2026, 9, 22).toISOString() },
      { ...base, id: 'd', status: 'done', due_at: new Date(2026, 9, 22).toISOString() },
      { ...base, id: 'e', due_at: null },
    ] as Task[];
    const map = tasksByDay(tasks);
    expect(map.get('2026-10-22')!.map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(map.size).toBe(1);
  });
  it('Verschieben behält die Uhrzeit bzw. bleibt ganztägig', () => {
    const timed = moveDueToDay(
      { due_at: new Date(2026, 9, 22, 14, 30).toISOString(), due_all_day: false },
      new Date(2026, 10, 3),
    );
    expect(new Date(timed.due_at).getTime()).toBe(new Date(2026, 10, 3, 14, 30).getTime());
    expect(timed.due_all_day).toBe(false);
    const allDay = moveDueToDay(
      { due_at: new Date(2026, 9, 22).toISOString(), due_all_day: true },
      new Date(2026, 10, 3),
    );
    expect(new Date(allDay.due_at).getTime()).toBe(new Date(2026, 10, 3).getTime());
    expect(
      moveDueToDay({ due_at: null, due_all_day: false }, new Date(2026, 10, 3)).due_all_day,
    ).toBe(true);
  });
});

describe('Feiertage', () => {
  it('Ostersonntag', () => {
    expect(ymd(easterSunday(2024))).toBe('2024-03-31');
    expect(ymd(easterSunday(2025))).toBe('2025-04-20');
    expect(ymd(easterSunday(2026))).toBe('2026-04-05');
    expect(ymd(easterSunday(2027))).toBe('2027-03-28');
    expect(ymd(easterSunday(2028))).toBe('2028-04-16');
  });
  it('nationale Feiertage 2026', () => {
    const h = holidaysFor(2026, 'CH');
    expect(h.get('2026-01-01')).toBe('Neujahr');
    expect(h.get('2026-04-06')).toBe('Ostermontag');
    expect(h.get('2026-08-01')).toBe('Bundesfeier');
    expect(h.get('2026-12-25')).toBe('Weihnachten');
    expect(h.get('2026-04-03')).toBe('Karfreitag');
    expect(h.get('2026-05-14')).toBe('Auffahrt');
    expect(h.get('2026-05-25')).toBe('Pfingstmontag');
    expect(h.size).toBe(7);
  });
  it('kantonale Feiertage', () => {
    const sg = holidaysFor(2026, 'SG');
    expect(sg.get('2026-11-01')).toBe('Allerheiligen');
    expect(sg.get('2026-12-26')).toBe('Stephanstag');
    expect(holidaysFor(2026, 'CH').has('2026-12-26')).toBe(false);
    expect(holidaysFor(2026, 'LU').get('2026-06-04')).toBe('Fronleichnam'); // Ostern + 60 Tage
    expect(holidaysFor(2026, 'ZH').get('2026-01-02')).toBe('Berchtoldstag');
    expect(Object.keys(CANTONS)).toContain('SG');
  });
});
