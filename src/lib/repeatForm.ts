import {
  buildRrule,
  parseRrule,
  weekdayOf,
  type RepeatFields,
  type RepeatRule,
  type Weekday,
} from './recurrence';

/** Zustand des Formulars «Wiederholung» im Pendenz-Editor */
export interface RepeatForm {
  kind: 'none' | RepeatRule['freq'] | 'after';
  interval: number;
  byday: Weekday[];
  afterDays: number;
}

export const NO_REPEAT: RepeatForm = { kind: 'none', interval: 1, byday: [], afterDays: 3 };

export function formFromTask(t: RepeatFields | undefined): RepeatForm {
  if (!t) return NO_REPEAT;
  if (t.repeat_mode === 'after_completion' && t.repeat_after_days) {
    return { ...NO_REPEAT, kind: 'after', afterDays: t.repeat_after_days };
  }
  const rule = parseRrule(t.rrule);
  return rule
    ? { kind: rule.freq, interval: rule.interval, byday: rule.byday, afterDays: 3 }
    : NO_REPEAT;
}

/** Datenbankfelder aus dem Formular; ohne Fälligkeitsdatum gibt es keine Wiederholung. */
export function fieldsFromForm(f: RepeatForm, dueDate: Date | null): Required<RepeatFields> {
  const none = { rrule: null, repeat_mode: 'fixed' as const, repeat_after_days: null };
  if (!dueDate || f.kind === 'none') return none;
  if (f.kind === 'after') {
    return {
      rrule: null,
      repeat_mode: 'after_completion',
      repeat_after_days: Math.max(1, f.afterDays || 1),
    };
  }
  const byday = f.kind === 'WEEKLY' ? (f.byday.length ? f.byday : [weekdayOf(dueDate)]) : [];
  return {
    rrule: buildRrule({ freq: f.kind, interval: Math.max(1, f.interval || 1), byday }),
    repeat_mode: 'fixed',
    repeat_after_days: null,
  };
}
