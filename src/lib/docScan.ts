// Termine in erkanntem Text (z. B. aus einem fotografierten Brief) finden:
// «12.11.2026, 14:30 Uhr», «Dienstag, 3. November um 9 Uhr», «14.00–15.30», «2026-11-12».

export interface FoundAppointment {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM oder null */
  time: string | null;
  /** Vorschlag für den Titel */
  title: string;
  /** Zeile(n) im Originaltext */
  snippet: string;
}

const MONTHS: Record<string, number> = {
  januar: 1,
  jan: 1,
  jänner: 1,
  februar: 2,
  feb: 2,
  märz: 3,
  mär: 3,
  maerz: 3,
  mrz: 3,
  april: 4,
  apr: 4,
  mai: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
};
const MONTH_RE = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');

// Reihenfolge ist wichtig: längere Muster zuerst, Treffer dürfen sich nicht überlappen
const DATE_RES: { re: RegExp; read: (m: RegExpExecArray) => [number, number, number | null] }[] = [
  {
    re: /(?<![\d.])(\d{4})-(\d{2})-(\d{2})(?![\d])/g,
    read: (m) => [+m[3], +m[2], +m[1]],
  },
  {
    re: /(?<![\d.])(\d{1,2})\s?\.\s?(\d{1,2})\s?\.\s?(\d{4}|\d{2})(?![\d])/g,
    read: (m) => [+m[1], +m[2], m[3].length === 2 ? 2000 + +m[3] : +m[3]],
  },
  {
    re: new RegExp(
      `(?<![\\d.])(\\d{1,2})\\s?\\.?\\s?(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?(?![\\p{L}\\d])`,
      'giu',
    ),
    read: (m) => [+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : null],
  },
  {
    // 12.11. ohne Jahr
    re: /(?<![\d.])(\d{1,2})\.(\d{1,2})\.(?![\d])/g,
    read: (m) => [+m[1], +m[2], null],
  },
];

const TIME_RES = [
  // 14:30, 14.30 Uhr, 14:30–15:30, 14h30
  /(?<![\d.,])([01]?\d|2[0-3])\s?[:hH.]\s?([0-5]\d)(?:\s?(?:Uhr|h))?(?![\d])/gu,
  // 14 Uhr
  /(?<![\d.,:])([01]?\d|2[0-3])\s?Uhr(?![\p{L}])/giu,
];

function validDate(d: number, m: number, y: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d;
}

const pad = (n: number) => String(n).padStart(2, '0');

interface Hit<T> {
  index: number;
  end: number;
  value: T;
}

function findDates(line: string, now: Date): Hit<string>[] {
  const hits: Hit<string>[] = [];
  const taken: [number, number][] = [];
  for (const { re, read } of DATE_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      const end = m.index + m[0].length;
      if (taken.some(([a, b]) => m!.index < b && end > a)) continue;
      const [d, mo, yRaw] = read(m);
      let y = yRaw ?? now.getFullYear();
      if (yRaw === null && validDate(d, mo, y)) {
        // ohne Jahr: nächstes Vorkommen (Vergangenheit höchstens 30 Tage)
        const cand = new Date(y, mo - 1, d);
        if (cand.getTime() < now.getTime() - 30 * 864e5) y += 1;
      }
      if (!validDate(d, mo, y)) continue;
      taken.push([m.index, end]);
      hits.push({ index: m.index, end, value: `${y}-${pad(mo)}-${pad(d)}` });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

function findTimes(line: string, skip: [number, number][]): Hit<string>[] {
  const hits: Hit<string>[] = [];
  for (const re of TIME_RES) {
    re.lastIndex = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      const end = m.index + m[0].length;
      if (skip.some(([a, b]) => m!.index < b && end > a)) continue;
      if (hits.some((h) => m!.index < h.end && end > h.index)) continue;
      hits.push({ index: m.index, end, value: `${pad(+m[1])}:${m[2] ?? '00'}` });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const trimPunct = (s: string) => s.replace(/^[\s,;:–—\-•*·|]+|[\s,;:–—\-•*·|]+$/gu, '');
const clean = (s: string) =>
  trimPunct(
    trimPunct(s.replace(/\s{2,}/g, ' ')).replace(
      /(?<![\p{L}])(am|um|ab|bis|von|den|ca\.?|gegen)[:\s]*$/giu,
      '',
    ),
  );

/** Erkennt Termine (Datum mit optionaler Uhrzeit). Reihenfolge wie im Text, ohne Doppelte. */
export function findAppointments(text: string, now: Date = new Date()): FoundAppointment[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[–—]/g, '–').trim())
    .filter(Boolean); // Leerzeilen (auch von der Texterkennung) ignorieren
  const firstLine = clean(lines.find((l) => /\p{L}{3,}/u.test(l)) ?? '');
  const out: FoundAppointment[] = [];
  const seen = new Set<string>();

  lines.forEach((line, i) => {
    const dates = findDates(line, now);
    if (dates.length === 0) return;
    const dateSpans = dates.map((d): [number, number] => [d.index, d.end]);
    let times = findTimes(line, dateSpans);
    let timeLine = line;
    let extra = '';
    // Uhrzeit steht manchmal in der nächsten oder vorherigen Zeile
    if (times.length === 0) {
      for (const j of [i + 1, i - 1]) {
        const other = lines[j];
        if (other === undefined || findDates(other, now).length > 0) continue;
        const t = findTimes(other, []);
        if (t.length > 0) {
          times = t;
          timeLine = other;
          extra = other;
          break;
        }
      }
    }
    dates.forEach((d, k) => {
      // Uhrzeit, die am nächsten hinter dem Datum steht, sonst die erste der Zeile
      const near =
        timeLine === line
          ? (times.find(
              (t) => t.index >= d.end && (k === dates.length - 1 || t.index < dates[k + 1].index),
            ) ?? (dates.length === 1 ? times[0] : undefined))
          : times[0];
      const key = `${d.value}|${near?.value ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);

      let rest = line;
      const cut: [number, number][] = [[d.index, d.end]];
      if (timeLine === line && near) cut.push([near.index, near.end]);
      cut.sort((a, b) => b[0] - a[0]);
      for (const [a, b] of cut) rest = rest.slice(0, a) + ' ' + rest.slice(b);
      rest = rest
        .replace(
          /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so)\b\.?,?/giu,
          ' ',
        )
        .replace(/–\s*(?=\s|$)/g, ' ')
        .replace(/\buhr\b/giu, ' ');
      const cleaned = clean(rest);
      const title =
        (/^(datum|termin|zeit|beginn)$/iu.test(cleaned) ? '' : cleaned) || firstLine || 'Termin';
      out.push({
        date: d.value,
        time: near?.value ?? null,
        title: title.length > 80 ? `${title.slice(0, 77)}…` : title,
        snippet: extra ? `${line}\n${extra}` : line,
      });
    });
  });
  return out;
}
