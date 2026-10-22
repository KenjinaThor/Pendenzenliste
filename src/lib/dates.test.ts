import { describe, expect, it } from 'vitest';
import { buildDue, diffDays, formatDue, nextMonday, toDateInput } from './dates';

const now = new Date(2026, 9, 22, 10, 0); // Do 22.10.2026

describe('dates', () => {
  it('diffDays zählt Kalendertage', () => {
    expect(diffDays(new Date(2026, 9, 23, 0, 5), new Date(2026, 9, 22, 23, 59))).toBe(1);
    expect(diffDays(new Date(2026, 9, 21), now)).toBe(-1);
  });

  it('nextMonday liefert den folgenden Montag', () => {
    expect(toDateInput(nextMonday(now))).toBe('2026-10-26');
    expect(toDateInput(nextMonday(new Date(2026, 9, 26)))).toBe('2026-11-02'); // Montag → nächster
  });

  it('formatDue', () => {
    expect(formatDue(new Date(2026, 9, 22), true, now)).toBe('Heute');
    expect(formatDue(new Date(2026, 9, 23, 14, 30), false, now)).toBe('Morgen, 14:30');
    expect(formatDue(new Date(2026, 10, 5), true, now)).toBe('Do 05.11.');
    expect(formatDue(new Date(2027, 0, 4), true, now)).toBe('Mo 04.01.2027');
  });

  it('buildDue: ohne Zeit ganztägig', () => {
    expect(buildDue('', '')).toBeNull();
    expect(buildDue('2026-10-22', '')?.due_all_day).toBe(true);
    const timed = buildDue('2026-10-22', '14:30')!;
    expect(timed.due_all_day).toBe(false);
    expect(new Date(timed.due_at).getHours()).toBe(14);
  });
});
