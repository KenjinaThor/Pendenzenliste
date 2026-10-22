// Schweizer Feiertage (national und je Kanton, Hauptfeiertage). Angaben ohne Gewähr: Halbtags-Feiertage
// und Feiertage einzelner Gemeinden sind nicht enthalten.
import { addDays, toDateInput } from './dates';

export const CANTONS: Record<string, string> = {
  CH: 'Nur nationale Feiertage',
  ZH: 'Zürich',
  BE: 'Bern',
  LU: 'Luzern',
  SG: 'St. Gallen',
  AG: 'Aargau',
  TG: 'Thurgau',
  BS: 'Basel-Stadt',
  BL: 'Basel-Landschaft',
};

/** Ostersonntag (Gauss'sche Osterformel, gregorianischer Kalender) */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const EXTRA: Record<string, { fixed?: [number, number, string][]; easter?: [number, string][] }> = {
  ZH: {
    fixed: [
      [1, 2, 'Berchtoldstag'],
      [5, 1, 'Tag der Arbeit'],
      [12, 26, 'Stephanstag'],
    ],
  },
  BE: {
    fixed: [
      [1, 2, 'Berchtoldstag'],
      [12, 26, 'Stephanstag'],
    ],
  },
  LU: {
    fixed: [
      [1, 2, 'Berchtoldstag'],
      [8, 15, 'Mariä Himmelfahrt'],
      [11, 1, 'Allerheiligen'],
      [12, 8, 'Mariä Empfängnis'],
    ],
    easter: [[60, 'Fronleichnam']],
  },
  SG: {
    fixed: [
      [11, 1, 'Allerheiligen'],
      [12, 26, 'Stephanstag'],
    ],
  },
  AG: { fixed: [[12, 26, 'Stephanstag']] },
  TG: {
    fixed: [
      [1, 2, 'Berchtoldstag'],
      [12, 26, 'Stephanstag'],
    ],
  },
  BS: {
    fixed: [
      [5, 1, 'Tag der Arbeit'],
      [12, 26, 'Stephanstag'],
    ],
  },
  BL: {
    fixed: [
      [5, 1, 'Tag der Arbeit'],
      [12, 26, 'Stephanstag'],
    ],
  },
};

/** Feiertage eines Jahres: Datum (YYYY-MM-DD) → Name */
export function holidaysFor(year: number, canton: string): Map<string, string> {
  const out = new Map<string, string>();
  const put = (d: Date, name: string) => out.set(toDateInput(d), name);
  const easter = easterSunday(year);

  put(new Date(year, 0, 1), 'Neujahr');
  put(addDays(easter, -2), 'Karfreitag');
  put(addDays(easter, 1), 'Ostermontag');
  put(addDays(easter, 39), 'Auffahrt');
  put(addDays(easter, 50), 'Pfingstmontag');
  put(new Date(year, 7, 1), 'Bundesfeier');
  put(new Date(year, 11, 25), 'Weihnachten');

  const extra = EXTRA[canton];
  for (const [month, day, name] of extra?.fixed ?? []) put(new Date(year, month - 1, day), name);
  for (const [offset, name] of extra?.easter ?? []) put(addDays(easter, offset), name);
  return out;
}
