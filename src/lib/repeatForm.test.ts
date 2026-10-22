import { describe, expect, it } from 'vitest';
import { NO_REPEAT, fieldsFromForm, formFromTask } from './repeatForm';

const thursday = new Date(2026, 9, 22);

describe('repeatForm', () => {
  it('Formular ↔ Datenbankfelder', () => {
    expect(fieldsFromForm({ ...NO_REPEAT, kind: 'DAILY' }, thursday).rrule).toBe('FREQ=DAILY');
    expect(
      fieldsFromForm({ ...NO_REPEAT, kind: 'WEEKLY', interval: 2, byday: ['MO', 'WE'] }, thursday)
        .rrule,
    ).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
    expect(fieldsFromForm({ ...NO_REPEAT, kind: 'WEEKLY' }, thursday).rrule).toBe(
      'FREQ=WEEKLY;BYDAY=TH',
    ); // Wochentag des Datums
    expect(fieldsFromForm({ ...NO_REPEAT, kind: 'after', afterDays: 5 }, thursday)).toEqual({
      rrule: null,
      repeat_mode: 'after_completion',
      repeat_after_days: 5,
    });
    expect(fieldsFromForm({ ...NO_REPEAT, kind: 'DAILY' }, null)).toEqual({
      rrule: null,
      repeat_mode: 'fixed',
      repeat_after_days: null,
    });
    expect(fieldsFromForm(NO_REPEAT, thursday).rrule).toBeNull();
  });
  it('Formular aus gespeicherten Feldern', () => {
    expect(formFromTask({ rrule: 'FREQ=MONTHLY;INTERVAL=3' })).toMatchObject({
      kind: 'MONTHLY',
      interval: 3,
    });
    expect(
      formFromTask({ rrule: null, repeat_mode: 'after_completion', repeat_after_days: 4 }),
    ).toMatchObject({ kind: 'after', afterDays: 4 });
    expect(formFromTask({ rrule: null })).toEqual(NO_REPEAT);
    expect(formFromTask(undefined)).toEqual(NO_REPEAT);
  });
});
