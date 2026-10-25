import { describe, expect, it } from 'vitest';
import { makePlan, pickTask, shufflePool, wheelAngle, wheelSegments } from './shuffle';
import type { Task } from './types';

const now = new Date(2026, 9, 25, 10, 0);
const make = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  list_id: 'l',
  title: id,
  notes_md: '',
  due_at: null,
  due_all_day: false,
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
  ...over,
});

describe('shufflePool', () => {
  const tasks = [
    make('heute', { due_at: new Date(2026, 9, 25, 15).toISOString() }),
    make('heute-ganztag', { due_at: new Date(2026, 9, 25).toISOString(), due_all_day: true }),
    make('ueberfaellig', { due_at: new Date(2026, 9, 20).toISOString(), due_all_day: true }),
    make('morgen', { due_at: new Date(2026, 9, 26).toISOString(), due_all_day: true }),
    make('ohne-datum'),
    make('erledigt', { status: 'done', due_at: new Date(2026, 9, 25).toISOString() }),
    make('papierkorb', {
      deleted_at: '2026-10-24T00:00:00Z',
      due_at: new Date(2026, 9, 25).toISOString(),
    }),
  ];
  it('«heute» nimmt Fälliges und Überfälliges', () => {
    expect(shufflePool(tasks, 'heute', now).map((t) => t.id)).toEqual([
      'heute',
      'heute-ganztag',
      'ueberfaellig',
    ]);
  });
  it('«alle» nimmt alle offenen, aber nie Erledigtes oder Gelöschtes', () => {
    expect(shufflePool(tasks, 'alle', now).map((t) => t.id)).toEqual([
      'heute',
      'heute-ganztag',
      'ueberfaellig',
      'morgen',
      'ohne-datum',
    ]);
  });
});

describe('pickTask', () => {
  const pool = [make('a', { priority: 'low' }), make('b', { priority: 'high' })];
  it('ohne Gewichtung ist jede gleich wahrscheinlich', () => {
    expect(pickTask(pool, { weighted: false, rand: () => 0.1 })?.id).toBe('a');
    expect(pickTask(pool, { weighted: false, rand: () => 0.9 })?.id).toBe('b');
  });
  it('mit Gewichtung ist «hoch» dreimal so wahrscheinlich wie «tief»', () => {
    // Gewichte a=1, b=3 → a nur bei rand < 0.25
    expect(pickTask(pool, { weighted: true, rand: () => 0.2 })?.id).toBe('a');
    expect(pickTask(pool, { weighted: true, rand: () => 0.3 })?.id).toBe('b');
  });
  it('lässt die zuletzt gezogene aus, wenn es Alternativen gibt', () => {
    expect(pickTask(pool, { weighted: false, rand: () => 0.9, exclude: 'b' })?.id).toBe('a');
    expect(pickTask([pool[0]], { weighted: false, exclude: 'a' })?.id).toBe('a');
  });
  it('liefert null bei leerem Topf', () => {
    expect(pickTask([], { weighted: false })).toBeNull();
  });
});

describe('Glücksrad', () => {
  it('enthält den Gewinner und höchstens «max» Felder', () => {
    const pool = Array.from({ length: 25 }, (_, i) => make(`t${i}`));
    const seg = wheelSegments(pool, pool[7], 10);
    expect(seg).toHaveLength(10);
    expect(seg.some((t) => t.id === 't7')).toBe(true);
    expect(new Set(seg.map((t) => t.id)).size).toBe(10);
  });
  it('der Winkel bringt die Feldmitte nach oben und dreht vorwärts', () => {
    const a = wheelAngle(0, 0, 4); // Feld 0 (0°–90°): Mitte 45° → Rad muss 315° drehen
    expect(a % 360).toBe(315);
    expect(a).toBeGreaterThanOrEqual(5 * 360);
    const b = wheelAngle(a, 2, 4);
    expect(b % 360).toBe((360 - 2.5 * 90) % 360);
    expect(b).toBeGreaterThan(a + 5 * 360 - 1);
  });
});

describe('makePlan', () => {
  it('legt Walzen, Rad und Streuung fest', () => {
    const pool = ['a', 'b', 'c', 'd'].map((id) => make(id));
    const plan = makePlan(pool, pool[2], () => 0.5);
    expect(plan.winner.id).toBe('c');
    expect(plan.reelTitles.sort()).toEqual(['a', 'b', 'd']);
    expect(plan.segments.some((t) => t.id === 'c')).toBe(true);
    expect(plan.jitter).toBe(0);
  });
});
