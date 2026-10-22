// Wiederkehrende Pendenzen: Regeln im RRULE-Format (Teilmenge von RFC 5545), Berechnung des nächsten
// Termins und verständliche Beschreibung auf Deutsch.
import { addDays, diffDays, startOfDay } from './dates';

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RepeatRule {
  freq: Freq;
  interval: number;
  /** nur bei WEEKLY: Wochentage, an denen die Pendenz fällig wird */
  byday: Weekday[];
}

/** Reihenfolge der Wochentage in der Woche (Montag zuerst) */
export const WEEKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MO: 'Montag',
  TU: 'Dienstag',
  WE: 'Mittwoch',
  TH: 'Donnerstag',
  FR: 'Freitag',
  SA: 'Samstag',
  SU: 'Sonntag',
};
const WEEKDAY_SHORT: Record<Weekday, string> = {
  MO: 'Mo',
  TU: 'Di',
  WE: 'Mi',
  TH: 'Do',
  FR: 'Fr',
  SA: 'Sa',
  SU: 'So',
};

/** Wochentag eines Datums als Kürzel (Date.getDay(): So = 0) */
export const weekdayOf = (d: Date): Weekday => WEEKDAYS[(d.getDay() + 6) % 7];

export interface RepeatFields {
  rrule: string | null;
  repeat_mode?: 'fixed' | 'after_completion';
  repeat_after_days?: number | null;
}

export function parseRrule(text: string | null | undefined): RepeatRule | null {
  if (!text) return null;
  const parts = Object.fromEntries(
    text
      .replace(/^RRULE:/i, '')
      .split(';')
      .map((p) => p.split('=') as [string, string]),
  );
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(parts.FREQ)) return null;
  const interval = Math.max(1, Number(parts.INTERVAL ?? 1) || 1);
  const byday = (parts.BYDAY ?? '')
    .split(',')
    .filter((d): d is Weekday => (WEEKDAYS as string[]).includes(d));
  return { freq: parts.FREQ as Freq, interval, byday };
}

export function buildRrule(rule: RepeatRule): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.freq === 'WEEKLY' && rule.byday.length) {
    const sorted = WEEKDAYS.filter((d) => rule.byday.includes(d));
    parts.push(`BYDAY=${sorted.join(',')}`);
  }
  return parts.join(';');
}

export const isRecurring = (t: RepeatFields) =>
  Boolean(t.rrule) || (t.repeat_mode === 'after_completion' && Boolean(t.repeat_after_days));

const UNIT = {
  DAILY: ['Tag', 'Tage'],
  WEEKLY: ['Woche', 'Wochen'],
  MONTHLY: ['Monat', 'Monate'],
  YEARLY: ['Jahr', 'Jahre'],
} as const;

/** «Jeden Tag», «Alle 2 Wochen», «Jeden Montag und Mittwoch», «3 Tage nach Erledigung» */
export function describeRepeat(t: RepeatFields): string {
  if (t.repeat_mode === 'after_completion' && t.repeat_after_days) {
    const n = t.repeat_after_days;
    return `${n} ${n === 1 ? 'Tag' : 'Tage'} nach Erledigung`;
  }
  const rule = parseRrule(t.rrule);
  if (!rule) return '';
  if (rule.freq === 'WEEKLY' && rule.byday.length) {
    const names = WEEKDAYS.filter((d) => rule.byday.includes(d)).map((d) => WEEKDAY_NAMES[d]);
    if (
      rule.interval === 1 &&
      names.length === 5 &&
      !rule.byday.includes('SA') &&
      !rule.byday.includes('SU')
    )
      return 'Werktags';
    const list =
      names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names.at(-1)}` : names[0];
    return rule.interval === 1 ? `Jeden ${list}` : `Alle ${rule.interval} Wochen: ${list}`;
  }
  if (rule.interval === 1) {
    return {
      DAILY: 'Jeden Tag',
      WEEKLY: 'Jede Woche',
      MONTHLY: 'Jeden Monat',
      YEARLY: 'Jedes Jahr',
    }[rule.freq];
  }
  return `Alle ${rule.interval} ${UNIT[rule.freq][1]}`;
}

// ---------------------------------------------------------------- nächster Termin
function atTimeOf(day: Date, time: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    time.getHours(),
    time.getMinutes(),
  );
}

/** Monatstag, bei zu kurzen Monaten auf den letzten Tag begrenzt (31. → 30./28.). */
function addMonthsClamped(base: Date, months: number): Date {
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(base.getDate(), last));
}

const weekStart = (d: Date) => startOfDay(addDays(d, -((d.getDay() + 6) % 7)));

/**
 * Nächster Fälligkeitszeitpunkt nach dem Erledigen.
 * - fester Rhythmus: erster passender Termin nach dem Fälligkeitsdatum UND nach heute
 *   (verpasste Termine werden übersprungen)
 * - «nach Erledigung»: heute + N Tage
 */
export function nextOccurrence(
  task: RepeatFields & { due_at: string | null },
  now: Date,
): Date | null {
  const due = task.due_at ? new Date(task.due_at) : null;
  const timeSource = due ?? startOfDay(now);

  if (task.repeat_mode === 'after_completion') {
    if (!task.repeat_after_days) return null;
    return atTimeOf(addDays(startOfDay(now), task.repeat_after_days), timeSource);
  }

  const rule = parseRrule(task.rrule);
  if (!rule) return null;
  const dueDay = startOfDay(due ?? now);
  const after = new Date(Math.max(dueDay.getTime(), startOfDay(now).getTime()));

  switch (rule.freq) {
    case 'DAILY': {
      const k = Math.floor(diffDays(after, dueDay) / rule.interval) + 1;
      return atTimeOf(addDays(dueDay, k * rule.interval), timeSource);
    }
    case 'WEEKLY': {
      const days = rule.byday.length ? rule.byday : [weekdayOf(dueDay)];
      for (let i = 1; i <= 7 * rule.interval + 7; i++) {
        const d = addDays(after, i);
        if (!days.includes(weekdayOf(d))) continue;
        const weeks = Math.round(diffDays(weekStart(d), weekStart(dueDay)) / 7);
        if (weeks % rule.interval === 0) return atTimeOf(d, timeSource);
      }
      return null;
    }
    case 'MONTHLY':
    case 'YEARLY': {
      const step = rule.freq === 'MONTHLY' ? rule.interval : rule.interval * 12;
      for (let k = 1; k < 2000; k++) {
        const d = addMonthsClamped(dueDay, k * step);
        if (d.getTime() > after.getTime()) return atTimeOf(d, timeSource);
      }
      return null;
    }
  }
}

export const weekdayShort = (d: Weekday) => WEEKDAY_SHORT[d];
