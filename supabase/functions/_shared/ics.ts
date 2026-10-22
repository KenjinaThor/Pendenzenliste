// ICS-Erzeugung (RFC 5545). Reiner TypeScript-Code ohne Laufzeit-Abhängigkeiten, damit er
// sowohl in der Edge Function (Deno) als auch im Frontend (Einzel-Export) verwendet werden kann.

export interface IcsSubtask {
  title: string;
  done: boolean;
}

export interface IcsTask {
  id: string;
  title: string;
  notes_md: string;
  due_at: string;
  due_all_day: boolean;
  duration_min: number | null;
  priority: 'low' | 'medium' | 'high';
  rrule: string | null;
  updated_at: string;
  list_name?: string;
  subtasks: IcsSubtask[];
}

export interface IcsOptions {
  /** IANA-Zeitzone der Person, bestimmt das Datum ganztägiger Einträge (z. B. Europe/Zurich) */
  timezone: string;
  /** Adresse der App (mit Schrägstrich am Ende), für den Rück-Link */
  appUrl: string;
  calendarName?: string;
  /** Zeitpunkt der Erzeugung (für Tests überschreibbar) */
  now?: Date;
}

const DEFAULT_DURATION_MIN = 30;
const TIMED_ALARM_MIN = 15;
const ALL_DAY_ALARM_HOUR = 9;
const PRIORITY = { high: 1, medium: 5, low: 9 } as const;
const encoder = new TextEncoder();

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Text-Escaping nach RFC 5545 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Zeilen auf 75 Oktette umbrechen (Fortsetzungszeilen beginnen mit einem Leerzeichen). */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // das führende Leerzeichen zählt mit
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** UTC-Zeitstempel im Format 20261022T143000Z */
export function formatUtc(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Kalenderdatum (YYYY, M, D) eines Zeitpunkts in der angegebenen Zeitzone */
function datePartsInZone(date: Date, timeZone: string): [number, number, number] {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return [get('year'), get('month'), get('day')];
}

const formatDateValue = ([y, m, d]: [number, number, number]) => `${pad(y, 4)}${pad(m)}${pad(d)}`;

function nextDay([y, m, d]: [number, number, number]): [number, number, number] {
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
}

export function taskUrl(appUrl: string, id: string): string {
  const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
  return `${base}#/pendenz/${id}`;
}

function buildDescription(task: IcsTask): string {
  const blocks: string[] = [];
  if (task.notes_md.trim()) blocks.push(task.notes_md.trim());
  if (task.subtasks.length) {
    blocks.push(
      ['Unteraufgaben:', ...task.subtasks.map((s) => `${s.done ? '☑' : '☐'} ${s.title}`)].join(
        '\n',
      ),
    );
  }
  return blocks.join('\n\n');
}

function buildEvent(task: IcsTask, opts: IcsOptions, stamp: string): string[] {
  const lines: string[] = ['BEGIN:VEVENT', `UID:${task.id}@pendenzen`, `DTSTAMP:${stamp}`];
  lines.push(`LAST-MODIFIED:${formatUtc(new Date(task.updated_at))}`);

  const due = new Date(task.due_at);
  if (task.due_all_day) {
    const day = datePartsInZone(due, opts.timezone);
    lines.push(`DTSTART;VALUE=DATE:${formatDateValue(day)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateValue(nextDay(day))}`);
    lines.push('TRANSP:TRANSPARENT'); // blockiert den Kalender nicht
  } else {
    const end = new Date(due.getTime() + (task.duration_min ?? DEFAULT_DURATION_MIN) * 60_000);
    lines.push(`DTSTART:${formatUtc(due)}`, `DTEND:${formatUtc(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(task.title)}`);
  const description = buildDescription(task);
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (task.list_name) lines.push(`CATEGORIES:${escapeText(task.list_name)}`);
  lines.push(`PRIORITY:${PRIORITY[task.priority]}`);
  lines.push('STATUS:CONFIRMED');
  lines.push(`URL:${taskUrl(opts.appUrl, task.id)}`);
  if (task.rrule) lines.push(`RRULE:${task.rrule.replace(/^RRULE:/i, '')}`);

  // Erinnerung: bei Terminen mit Uhrzeit 15 Min. vorher, bei ganztägigen um 09:00 Uhr
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(task.title)}`);
  lines.push(
    task.due_all_day
      ? `TRIGGER;RELATED=START:PT${ALL_DAY_ALARM_HOUR}H`
      : `TRIGGER:-PT${TIMED_ALARM_MIN}M`,
  );
  lines.push('END:VALARM', 'END:VEVENT');
  return lines;
}

/** Erzeugt einen vollständigen ICS-Kalender (Zeilenende CRLF). */
export function buildIcs(tasks: IcsTask[], opts: IcsOptions): string {
  const stamp = formatUtc(opts.now ?? new Date());
  const name = opts.calendarName ?? 'Pendenzen';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pendenzen//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${opts.timezone}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
    ...tasks.filter((t) => t.due_at).flatMap((t) => buildEvent(t, opts, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
