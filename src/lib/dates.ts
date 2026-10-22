// Datums-Hilfen (Schweizer Format, Woche beginnt am Montag, 24-Stunden-Zeit)
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());

/** Anzahl Kalendertage von b nach a (heute − morgen = −1). */
export const diffDays = (a: Date, b: Date) =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

/** Nächster Montag nach dem angegebenen Datum. */
export function nextMonday(d: Date): Date {
  const delta = (8 - d.getDay()) % 7 || 7;
  return startOfDay(addDays(d, delta));
}

export const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** «Heute», «Morgen», «Gestern» oder «Mo 05.11.» (mit Jahr, falls nicht das aktuelle). */
export function formatDay(d: Date, now: Date): string {
  const diff = diffDays(d, now);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  const base = `${WEEKDAYS[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}${d.getFullYear()}`;
}

export function formatDue(due: Date, allDay: boolean, now: Date): string {
  const day = formatDay(due, now);
  return allDay ? day : `${day}, ${formatTime(due)}`;
}

/** Wert für <input type="date"> */
export const toDateInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Wert für <input type="time"> */
export const toTimeInput = (d: Date) => formatTime(d);

/** Baut aus Datums- und Zeitfeld die Datenbankwerte. Ohne Zeit ist die Pendenz ganztägig. */
export function buildDue(
  date: string,
  time: string,
): { due_at: string; due_all_day: boolean } | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!time) return { due_at: new Date(y, m - 1, d).toISOString(), due_all_day: true };
  const [hh, mm] = time.split(':').map(Number);
  return { due_at: new Date(y, m - 1, d, hh, mm).toISOString(), due_all_day: false };
}
