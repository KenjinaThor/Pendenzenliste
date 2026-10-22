import { describe, expect, it } from 'vitest';
import { offsetLabel } from './reminders';

describe('offsetLabel', () => {
  it('beschreibt Vorlaufzeiten', () => {
    expect(offsetLabel(0, false)).toBe('Zum Fälligkeitszeitpunkt');
    expect(offsetLabel(0, true)).toBe('Am Fälligkeitstag, 09:00 Uhr');
    expect(offsetLabel(15, false)).toBe('15 Min. vorher');
    expect(offsetLabel(60, false)).toBe('1 Std. vorher');
    expect(offsetLabel(120, false)).toBe('2 Std. vorher');
    expect(offsetLabel(1440, true)).toBe('1 Tag vorher');
    expect(offsetLabel(2880, true)).toBe('2 Tage vorher');
    expect(offsetLabel(90, false)).toBe('90 Min. vorher');
  });
});
