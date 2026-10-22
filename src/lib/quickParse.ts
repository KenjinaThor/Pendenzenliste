// Schnelleingabe in natürlicher Sprache (Deutsch):
//   «Steuererklärung einreichen morgen 14 Uhr #Privat !hoch @Anna +wichtig jeden Montag»
// erkennt Datum, Uhrzeit, Liste, Priorität, Person, Tags und Wiederholung. Was erkannt wurde, wird aus dem
// Titel entfernt; unbekannte #Listen oder @Personen bleiben im Titel stehen.
import { addDays, diffDays, startOfDay, toDateInput } from './dates';
import {
  WEEKDAY_NAMES,
  WEEKDAYS,
  buildRrule,
  describeRepeat,
  type RepeatRule,
  type Weekday,
} from './recurrence';
import type { Priority } from './types';

export interface QuickParseContext {
  now: Date;
  lists: { id: string; name: string; emoji?: string }[];
  members: { user_id: string; name: string }[];
  userId?: string;
}

export interface ParsedRepeat {
  rrule: string | null;
  repeat_mode: 'fixed' | 'after_completion';
  repeat_after_days: number | null;
}

export interface ParsedChip {
  kind: 'date' | 'time' | 'list' | 'priority' | 'assignee' | 'tag' | 'repeat';
  label: string;
}

export interface ParsedInput {
  title: string;
  /** YYYY-MM-DD */
  date: string | null;
  /** HH:MM */
  time: string | null;
  listId: string | null;
  priority: Priority | null;
  assigneeId: string | null;
  tags: string[];
  repeat: ParsedRepeat | null;
  chips: ParsedChip[];
}

// Wörter dürfen auch Umlaute enthalten – \b funktioniert in JavaScript nur für ASCII
const re = (source: string, flags = 'iu') =>
  new RegExp(`(?<![\\p{L}\\d])(?:${source})(?![\\p{L}\\d])`, flags);

const WEEKDAY_WORDS: Record<string, Weekday> = {
  montag: 'MO',
  dienstag: 'TU',
  mittwoch: 'WE',
  donnerstag: 'TH',
  freitag: 'FR',
  samstag: 'SA',
  sonnabend: 'SA',
  sonntag: 'SU',
};
const WD = Object.keys(WEEKDAY_WORDS).join('|');
const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  einem: 1,
  einer: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
};
const NUM = `\\d+|${Object.keys(NUMBER_WORDS).join('|')}`;
const toNumber = (s: string) =>
  /^\d+$/.test(s) ? Number(s) : (NUMBER_WORDS[s.toLowerCase()] ?? 1);
const norm = (s: string) => s.toLocaleLowerCase('de-CH').replace(/[\s_-]+/g, '');

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : null;
}

/** Nächster Wochentag, frühestens morgen (dazu `extraWeeks` Wochen später) */
function upcomingWeekday(now: Date, wd: Weekday, extraWeeks = 0): Date {
  const target = (WEEKDAYS.indexOf(wd) + 1) % 7; // getDay(): So = 0
  const delta = (target - now.getDay() + 7) % 7 || 7;
  return addDays(startOfDay(now), delta + extraWeeks * 7);
}

class Scanner {
  constructor(public text: string) {}
  /** Sucht das Muster, entfernt den Treffer und liefert die Gruppen (oder null). */
  take(pattern: RegExp): RegExpExecArray | null {
    const m = pattern.exec(this.text);
    if (!m) return null;
    this.text = `${this.text.slice(0, m.index)} ${this.text.slice(m.index + m[0].length)}`;
    return m;
  }
}

export function parseQuickInput(input: string, ctx: QuickParseContext): ParsedInput {
  const sc = new Scanner(input);
  const now = ctx.now;
  const today = startOfDay(now);
  const chips: ParsedChip[] = [];
  const out: ParsedInput = {
    title: '',
    date: null,
    time: null,
    listId: null,
    priority: null,
    assigneeId: null,
    tags: [],
    repeat: null,
    chips,
  };

  // ---- Liste: #Privat, #"Mein Haushalt"
  const listMatch = /(?<![\p{L}\d])#(?:"([^"]+)"|([\p{L}\d_-]+))/u.exec(sc.text);
  if (listMatch) {
    const wanted = norm(listMatch[1] ?? listMatch[2]);
    const exact = ctx.lists.filter((l) => norm(l.name) === wanted);
    const prefix = ctx.lists.filter((l) => norm(l.name).startsWith(wanted));
    const found =
      exact.length === 1 ? exact[0] : exact.length === 0 && prefix.length === 1 ? prefix[0] : null;
    if (found) {
      out.listId = found.id;
      chips.push({ kind: 'list', label: `${found.emoji ?? '📋'} ${found.name}` });
      sc.take(/(?<![\p{L}\d])#(?:"[^"]+"|[\p{L}\d_-]+)/u);
    }
  }

  // ---- Priorität: !hoch, !mittel, !tief, !1 !2 !3
  const prio = sc.take(
    /(?<![\p{L}\d])!(hoch|mittel|tief|niedrig|high|medium|low|1|2|3)(?![\p{L}\d])/iu,
  );
  if (prio) {
    const word = prio[1].toLowerCase();
    out.priority = ['hoch', 'high', '1'].includes(word)
      ? 'high'
      : ['mittel', 'medium', '2'].includes(word)
        ? 'medium'
        : 'low';
    chips.push({
      kind: 'priority',
      label: `Priorität ${{ high: 'hoch', medium: 'mittel', low: 'tief' }[out.priority]}`,
    });
  }

  // ---- Person: @Anna (Vorname oder ganzer Name), @ich
  const person = /(?<![\p{L}\d])@(?:"([^"]+)"|([\p{L}\d_-]+))/u.exec(sc.text);
  if (person) {
    const wanted = (person[1] ?? person[2]).toLocaleLowerCase('de-CH');
    let target: { user_id: string; name: string } | undefined;
    if (['ich', 'me'].includes(wanted)) target = ctx.members.find((m) => m.user_id === ctx.userId);
    else {
      const hits = ctx.members.filter((m) => {
        const full = m.name.toLocaleLowerCase('de-CH');
        return (
          full === wanted ||
          full.split(/\s+/).some((p) => p.startsWith(wanted)) ||
          full.startsWith(wanted)
        );
      });
      if (hits.length === 1) target = hits[0];
    }
    if (target) {
      out.assigneeId = target.user_id;
      chips.push({ kind: 'assignee', label: `👤 ${target.name}` });
      sc.take(/(?<![\p{L}\d])@(?:"[^"]+"|[\p{L}\d_-]+)/u);
    }
  }

  // ---- Tags: +wichtig
  for (
    let m = sc.take(/(?<![\p{L}\d+])\+([\p{L}\d_-]+)/u);
    m;
    m = sc.take(/(?<![\p{L}\d+])\+([\p{L}\d_-]+)/u)
  ) {
    const tag = m[1];
    if (!out.tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      out.tags.push(tag);
      chips.push({ kind: 'tag', label: `#${tag}` });
    }
  }

  // ---- Wiederholung
  let repeat: ParsedRepeat | null = null;
  let repeatStart: Date | null = null; // frühester sinnvoller erster Termin
  const rule = (freq: RepeatRule['freq'], interval = 1, byday: Weekday[] = []): ParsedRepeat => ({
    rrule: buildRrule({ freq, interval, byday }),
    repeat_mode: 'fixed',
    repeat_after_days: null,
  });

  let m: RegExpExecArray | null;
  if (
    (m = sc.take(re(`(${NUM})\\s*(tage|tagen|tag|wochen|woche)\\s+nach\\s+(?:der\\s+)?erledigung`)))
  ) {
    const n = toNumber(m[1]) * (/^woche/i.test(m[2]) ? 7 : 1);
    repeat = { rrule: null, repeat_mode: 'after_completion', repeat_after_days: n };
    repeatStart = addDays(today, n);
  } else if (
    (m = sc.take(re(`(?:jeden|jede|jeder)\\s+((?:${WD})(?:\\s*(?:,|und|&)\\s*(?:${WD}))*)`)))
  ) {
    const days = [...m[1].toLowerCase().matchAll(new RegExp(WD, 'g'))].map(
      (x) => WEEKDAY_WORDS[x[0]],
    );
    repeat = rule('WEEKLY', 1, days);
    repeatStart = days
      .map((d) => (d === weekdayName(today) ? today : upcomingWeekday(now, d)))
      .sort((a, b) => +a - +b)[0];
  } else if (sc.take(re('werktags|jeden\\s+werktag'))) {
    repeat = rule('WEEKLY', 1, ['MO', 'TU', 'WE', 'TH', 'FR']);
    repeatStart = nextWeekdayOnOrAfter(today, ['MO', 'TU', 'WE', 'TH', 'FR']);
  } else if (
    (m = sc.take(
      re(
        `(?:alle|jeden|jede|jedes)\\s+(?:(${NUM})\\s+)?(tage|tag|wochen|woche|monate|monat|jahre|jahr)`,
      ),
    ))
  ) {
    const n = m[1] ? toNumber(m[1]) : 1;
    const unit = m[2].toLowerCase();
    const freq = unit.startsWith('tag')
      ? 'DAILY'
      : unit.startsWith('woche')
        ? 'WEEKLY'
        : unit.startsWith('monat')
          ? 'MONTHLY'
          : 'YEARLY';
    repeat = rule(freq, n);
    repeatStart = today;
  } else if (
    (m = sc.take(re('täglich|taeglich|wöchentlich|woechentlich|monatlich|jährlich|jaehrlich')))
  ) {
    const w = m[0].toLowerCase();
    repeat = rule(
      w.startsWith('t')
        ? 'DAILY'
        : w.startsWith('w')
          ? 'WEEKLY'
          : w.startsWith('m')
            ? 'MONTHLY'
            : 'YEARLY',
    );
    repeatStart = today;
  }

  // ---- Datum
  let date: Date | null = null;
  const setDate = (d: Date | null) => {
    if (d && !date) date = d;
  };

  if (sc.take(re('übermorgen|uebermorgen'))) setDate(addDays(today, 2));
  else if (sc.take(re('morgen'))) setDate(addDays(today, 1));
  else if (sc.take(re('heute'))) setDate(today);

  if (
    !date &&
    (m = sc.take(re(`(?:am\\s+|bis\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}|\\d{2})?`, 'u')))
  ) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const explicit = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    let d = validDate(explicit ?? now.getFullYear(), month, day);
    if (d && explicit === null && diffDays(d, today) < 0)
      d = validDate(now.getFullYear() + 1, month, day);
    setDate(d);
  }
  if (!date && (m = sc.take(re('(\\d{4})-(\\d{2})-(\\d{2})'))))
    setDate(validDate(Number(m[1]), Number(m[2]), Number(m[3])));

  if (
    !date &&
    (m = sc.take(re(`in\\s+(${NUM})\\s+(tagen|tag|wochen|woche|monaten|monat|jahren|jahr)`)))
  ) {
    const n = toNumber(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith('tag')) setDate(addDays(today, n));
    else if (unit.startsWith('woche')) setDate(addDays(today, n * 7));
    else if (unit.startsWith('monat'))
      setDate(
        new Date(
          now.getFullYear(),
          now.getMonth() + n,
          Math.min(now.getDate(), daysInMonth(now.getFullYear(), now.getMonth() + n)),
        ),
      );
    else setDate(new Date(now.getFullYear() + n, now.getMonth(), now.getDate()));
  }
  if (!date && sc.take(re('(?:nächste|naechste)[nr]?\\s+woche')))
    setDate(upcomingWeekday(now, 'MO'));
  if (!date && sc.take(re('(?:nächste|naechste)[nr]?\\s+monat')))
    setDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  if (!date && sc.take(re('ende\\s+(?:des\\s+|dieses\\s+)?monat[s]?')))
    setDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (!date && sc.take(re('ende\\s+(?:der\\s+|dieser\\s+)?woche'))) {
    setDate(
      weekdayName(today) === 'SA' || weekdayName(today) === 'SU'
        ? upcomingWeekday(now, 'FR')
        : nextWeekdayOnOrAfter(today, ['FR']),
    );
  }
  if (
    !date &&
    (m = sc.take(
      re(`(?:(übernächste|uebernaechste|nächste|naechste|kommende|diese|am)[nrm]?\\s+)?(${WD})`),
    ))
  ) {
    const extra = /^(übernächste|uebernaechste)/i.test(m[1] ?? '') ? 1 : 0;
    setDate(upcomingWeekday(now, WEEKDAY_WORDS[m[2].toLowerCase()], extra));
  }

  // ---- Uhrzeit: 14:30, 14.30 Uhr, 14 Uhr, um 14
  let time: string | null = null;
  const timeMatch =
    sc.take(re('(?:um\\s+)?(\\d{1,2})[:.](\\d{2})(?:\\s*uhr)?')) ??
    sc.take(re('(?:um\\s+)?(\\d{1,2})\\s*uhr')) ??
    sc.take(re('um\\s+(\\d{1,2})'));
  if (timeMatch) {
    const hh = Number(timeMatch[1]);
    const mm = timeMatch[2] ? Number(timeMatch[2]) : 0;
    if (hh < 24 && mm < 60) time = `${pad(hh)}:${pad(mm)}`;
    else sc.text = `${sc.text} ${timeMatch[0]}`; // unplausibel (z. B. 25 Uhr) → im Titel belassen
  }

  // ---- Zusammensetzen
  const firstDue = date ?? repeatStart;
  let finalDate: Date | null = firstDue;
  if (!finalDate && time) {
    const [hh, mi] = time.split(':').map(Number);
    finalDate =
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mi) > now
        ? today
        : addDays(today, 1);
  }
  if (finalDate) out.date = toDateInput(finalDate);
  out.time = time;
  out.repeat = repeat;

  if (out.date) {
    chips.unshift({
      kind: 'date',
      label: dateLabel(finalDate!, today),
    });
  }
  if (time) chips.splice(out.date ? 1 : 0, 0, { kind: 'time', label: `${time} Uhr` });
  if (repeat) chips.push({ kind: 'repeat', label: `🔁 ${describeRepeat(repeat)}` });

  out.title = sc.text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,([!?.])/g, '$1') // «Arzt anrufen, morgen!» → «Arzt anrufen!»
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '')
    .trim();
  return out;
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const weekdayName = (d: Date): Weekday => WEEKDAYS[(d.getDay() + 6) % 7];

function nextWeekdayOnOrAfter(from: Date, days: Weekday[]): Date {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (days.includes(weekdayName(d))) return d;
  }
  return from;
}

function dateLabel(d: Date, today: Date): string {
  const diff = diffDays(d, today);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  const wd = WEEKDAY_NAMES[weekdayName(d)].slice(0, 2);
  const base = `${wd} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  return d.getFullYear() === today.getFullYear() ? base : `${base}${d.getFullYear()}`;
}
