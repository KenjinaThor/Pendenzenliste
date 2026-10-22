import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  escapeText,
  foldLine,
  taskUrl,
  type IcsTask,
} from '../../supabase/functions/_shared/ics.ts';

const base: IcsTask = {
  id: 'abc-123',
  title: 'Steuererklärung, bitte; dringend',
  notes_md: 'Zeile 1\nZeile 2',
  due_at: new Date(2026, 9, 23, 14, 30).toISOString(),
  due_all_day: false,
  duration_min: 80,
  priority: 'high',
  rrule: null,
  updated_at: '2026-10-22T08:00:00Z',
  list_name: 'Persönlich',
  subtasks: [
    { title: 'Belege sammeln', done: true },
    { title: 'Formular ausfüllen', done: false },
  ],
};
const opts = {
  timezone: 'Europe/Zurich',
  appUrl: 'https://kenjinathor.github.io/Pendenzenliste',
  now: new Date('2026-10-22T10:00:00Z'),
};

function parse(ics: string) {
  const vcal = new ICAL.Component(ICAL.parse(ics));
  return vcal.getAllSubcomponents('vevent');
}

describe('escapeText / foldLine', () => {
  it('escaped Sonderzeichen', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });
  it('bricht lange Zeilen bei 75 Oktetten, ohne Zeichen zu zerteilen', () => {
    const line = 'SUMMARY:' + 'ä'.repeat(100);
    const folded = foldLine(line).split('\r\n');
    expect(folded.length).toBeGreaterThan(1);
    for (const part of folded)
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });
});

describe('buildIcs', () => {
  it('erzeugt einen gültigen Termin mit Uhrzeit, Dauer, Alarm und Link', () => {
    const ics = buildIcs([base], opts);
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/); // nur CRLF

    const [vevent] = parse(ics);
    const event = new ICAL.Event(vevent);
    expect(event.uid).toBe('abc-123@pendenzen');
    expect(event.summary).toBe('Steuererklärung, bitte; dringend');
    expect(event.description).toContain('Zeile 2');
    expect(event.description).toContain('☑ Belege sammeln');
    expect(event.description).toContain('☐ Formular ausfüllen');
    expect(event.startDate.isDate).toBe(false);
    expect(event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime()).toBe(
      80 * 60_000,
    );
    expect(vevent.getFirstPropertyValue('url')).toBe(taskUrl(opts.appUrl, 'abc-123'));
    expect(vevent.getFirstPropertyValue('priority')).toBe(1);

    const alarm = vevent.getFirstSubcomponent('valarm')!;
    expect(alarm.getFirstPropertyValue('trigger')?.toString()).toBe('-PT15M');
  });

  it('ganztägig: DATE-Werte in der Zeitzone der Person, Ende am Folgetag, Alarm um 09:00', () => {
    // lokaler Mitternacht in Zürich = 31.10. 00:00 (Sommerzeit endet erst am 25.10.)
    const allDay = { ...base, due_all_day: true, due_at: new Date(2026, 9, 31).toISOString() };
    const ics = buildIcs([allDay], { ...opts, timezone: 'Europe/Zurich' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031');
    expect(ics).toContain('DTEND;VALUE=DATE:20261101');
    expect(ics).toContain('TRANSP:TRANSPARENT');
    expect(ics).toContain('TRIGGER;RELATED=START:PT9H');
    expect(parse(ics)).toHaveLength(1);
  });

  it('Monatswechsel bei ganztägigen Terminen', () => {
    const allDay = { ...base, due_all_day: true, due_at: '2026-12-30T23:00:00Z' }; // 31.12. in Zürich
    const ics = buildIcs([allDay], opts);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('Standarddauer 30 Minuten, RRULE und leere Notizen', () => {
    const t = {
      ...base,
      duration_min: null,
      notes_md: '',
      subtasks: [],
      rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
    };
    const ics = buildIcs([t], opts);
    const event = new ICAL.Event(parse(ics)[0]);
    expect(event.endDate.toJSDate().getTime() - event.startDate.toJSDate().getTime()).toBe(
      30 * 60_000,
    );
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(ics).not.toContain('DESCRIPTION:Unteraufgaben');
  });

  it('ohne Pendenzen: leerer, gültiger Kalender', () => {
    const ics = buildIcs([], opts);
    expect(parse(ics)).toHaveLength(0);
    expect(ics).toContain('X-WR-CALNAME:Pendenzen');
  });
});
