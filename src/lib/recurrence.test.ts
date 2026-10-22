import { describe, expect, it } from 'vitest';
import { toDateInput } from './dates';
import { buildRrule, describeRepeat, nextOccurrence, parseRrule } from './recurrence';

// Donnerstag, 22.10.2026, 10:00
const now = new Date(2026, 9, 22, 10, 0);
const due = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();
const next = (rrule: string, dueAt: string | null, at = now, extra = {}) => {
  const n = nextOccurrence({ rrule, due_at: dueAt, repeat_mode: 'fixed', ...extra }, at);
  return n
    ? `${toDateInput(n)} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
    : null;
};

describe('parseRrule / buildRrule', () => {
  it('liest und schreibt Regeln', () => {
    expect(parseRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byday: ['WE', 'MO'],
    });
    expect(buildRrule({ freq: 'WEEKLY', interval: 2, byday: ['WE', 'MO'] })).toBe(
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
    );
    expect(buildRrule({ freq: 'DAILY', interval: 1, byday: [] })).toBe('FREQ=DAILY');
    expect(parseRrule('RRULE:FREQ=DAILY')?.freq).toBe('DAILY');
    expect(parseRrule('FREQ=HOURLY')).toBeNull();
    expect(parseRrule(null)).toBeNull();
  });
});

describe('describeRepeat', () => {
  it('beschreibt auf Deutsch', () => {
    const d = (rrule: string | null, extra = {}) => describeRepeat({ rrule, ...extra });
    expect(d('FREQ=DAILY')).toBe('Jeden Tag');
    expect(d('FREQ=DAILY;INTERVAL=3')).toBe('Alle 3 Tage');
    expect(d('FREQ=WEEKLY')).toBe('Jede Woche');
    expect(d('FREQ=WEEKLY;BYDAY=MO')).toBe('Jeden Montag');
    expect(d('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('Jeden Montag, Mittwoch und Freitag');
    expect(d('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Werktags');
    expect(d('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toBe('Alle 2 Wochen: Montag');
    expect(d('FREQ=MONTHLY')).toBe('Jeden Monat');
    expect(d('FREQ=YEARLY')).toBe('Jedes Jahr');
    expect(d(null, { repeat_mode: 'after_completion', repeat_after_days: 3 })).toBe(
      '3 Tage nach Erledigung',
    );
    expect(d(null, { repeat_mode: 'after_completion', repeat_after_days: 1 })).toBe(
      '1 Tag nach Erledigung',
    );
  });
});

describe('nextOccurrence', () => {
  it('täglich: heute fällig → morgen, gleiche Uhrzeit', () => {
    expect(next('FREQ=DAILY', due(2026, 10, 22, 14, 30))).toBe('2026-10-23 14:30');
  });
  it('täglich: lange überfällig → ab heute weiter (Termine werden übersprungen)', () => {
    expect(next('FREQ=DAILY', due(2026, 10, 1))).toBe('2026-10-23 00:00');
  });
  it('täglich: in der Zukunft fällig → ab diesem Termin', () => {
    expect(next('FREQ=DAILY', due(2026, 10, 30))).toBe('2026-10-31 00:00');
  });
  it('Intervall: alle 3 Tage bleibt im Raster des Fälligkeitsdatums', () => {
    expect(next('FREQ=DAILY;INTERVAL=3', due(2026, 10, 18))).toBe('2026-10-24 00:00'); // 18, 21, 24
  });
  it('wöchentlich ohne Wochentag: gleicher Wochentag', () => {
    expect(next('FREQ=WEEKLY', due(2026, 10, 22))).toBe('2026-10-29 00:00');
  });
  it('wöchentlich an mehreren Wochentagen', () => {
    // Do 22.10. erledigt, Regel Mo/Mi/Fr → Fr 23.10.
    expect(next('FREQ=WEEKLY;BYDAY=MO,WE,FR', due(2026, 10, 22))).toBe('2026-10-23 00:00');
    // Fr 23.10. erledigt → Mo 26.10.
    expect(next('FREQ=WEEKLY;BYDAY=MO,WE,FR', due(2026, 10, 23), new Date(2026, 9, 23, 9))).toBe(
      '2026-10-26 00:00',
    );
  });
  it('alle 2 Wochen am Montag', () => {
    expect(next('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', due(2026, 10, 19))).toBe('2026-11-02 00:00');
  });
  it('Werktags springt über das Wochenende', () => {
    expect(
      next('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', due(2026, 10, 23), new Date(2026, 9, 23, 9)),
    ).toBe('2026-10-26 00:00');
  });
  it('monatlich mit Monatsende (31.)', () => {
    expect(next('FREQ=MONTHLY', due(2026, 1, 31), new Date(2026, 0, 31, 9))).toBe(
      '2026-02-28 00:00',
    );
    expect(next('FREQ=MONTHLY', due(2026, 10, 22))).toBe('2026-11-22 00:00');
    expect(next('FREQ=MONTHLY;INTERVAL=3', due(2026, 10, 31), new Date(2026, 9, 31, 9))).toBe(
      '2027-01-31 00:00',
    );
  });
  it('jährlich, auch am Schalttag', () => {
    expect(next('FREQ=YEARLY', due(2026, 10, 22))).toBe('2027-10-22 00:00');
    expect(next('FREQ=YEARLY', due(2028, 2, 29), new Date(2028, 1, 29, 9))).toBe(
      '2029-02-28 00:00',
    );
  });
  it('nach Erledigung: heute + N Tage, Uhrzeit bleibt', () => {
    const t = { rrule: null, repeat_mode: 'after_completion' as const, repeat_after_days: 3 };
    expect(toDateInput(nextOccurrence({ ...t, due_at: due(2026, 10, 1, 8, 15) }, now)!)).toBe(
      '2026-10-25',
    );
    expect(nextOccurrence({ ...t, due_at: due(2026, 10, 1, 8, 15) }, now)!.getHours()).toBe(8);
    expect(nextOccurrence({ ...t, repeat_after_days: null, due_at: null }, now)).toBeNull();
  });
  it('ohne gültige Regel kein nächster Termin', () => {
    expect(nextOccurrence({ rrule: null, due_at: null }, now)).toBeNull();
    expect(nextOccurrence({ rrule: 'FREQ=HOURLY', due_at: null }, now)).toBeNull();
  });
});
