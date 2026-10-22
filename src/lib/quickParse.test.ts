import { describe, expect, it } from 'vitest';
import { parseQuickInput, type QuickParseContext } from './quickParse';

// Donnerstag, 22.10.2026, 10:00
const now = new Date(2026, 9, 22, 10, 0);
const ctx: QuickParseContext = {
  now,
  userId: 'u-me',
  lists: [
    { id: 'l-priv', name: 'Privat', emoji: '🏠' },
    { id: 'l-arb', name: 'Arbeit', emoji: '💼' },
    { id: 'l-haus', name: 'Mein Haushalt' },
  ],
  members: [
    { user_id: 'u-me', name: 'Nicolas Britt' },
    { user_id: 'u-anna', name: 'Anna Muster' },
    { user_id: 'u-ben', name: 'Ben' },
  ],
};
const p = (text: string, c = ctx) => parseQuickInput(text, c);

describe('Beispiel aus der Aufgabenstellung', () => {
  it('Steuererklärung einreichen morgen 14 Uhr #Privat !hoch @Anna', () => {
    const r = p('Steuererklärung einreichen morgen 14 Uhr #Privat !hoch @Anna');
    expect(r).toMatchObject({
      title: 'Steuererklärung einreichen',
      date: '2026-10-23',
      time: '14:00',
      listId: 'l-priv',
      priority: 'high',
      assigneeId: 'u-anna',
    });
    expect(r.chips.map((c) => c.label)).toEqual([
      'Morgen',
      '14:00 Uhr',
      '🏠 Privat',
      'Priorität hoch',
      '👤 Anna Muster',
    ]);
  });
});

describe('Datum', () => {
  const date = (t: string) => p(t).date;
  it('heute, morgen, übermorgen', () => {
    expect(date('Milch heute')).toBe('2026-10-22');
    expect(date('Milch morgen')).toBe('2026-10-23');
    expect(date('Milch übermorgen')).toBe('2026-10-24');
  });
  it('Wochentage (immer in der Zukunft)', () => {
    expect(date('Sport Freitag')).toBe('2026-10-23');
    expect(date('Sport am Montag')).toBe('2026-10-26');
    expect(date('Sport nächsten Montag')).toBe('2026-10-26');
    expect(date('Sport übernächsten Montag')).toBe('2026-11-02');
    expect(date('Sport Donnerstag')).toBe('2026-10-29'); // heute ist Donnerstag → nächste Woche
  });
  it('relative Angaben', () => {
    expect(date('Anruf in 3 Tagen')).toBe('2026-10-25');
    expect(date('Anruf in zwei Wochen')).toBe('2026-11-05');
    expect(date('Anruf in einem Monat')).toBe('2026-11-22');
    expect(date('Anruf in 1 Jahr')).toBe('2027-10-22');
    expect(date('Plan nächste Woche')).toBe('2026-10-26');
    expect(date('Plan nächsten Monat')).toBe('2026-11-01');
  });
  it('Ende Monat / Ende Woche', () => {
    expect(date('Abrechnung Ende Monat')).toBe('2026-10-31');
    expect(date('Bericht Ende Woche')).toBe('2026-10-23');
  });
  it('absolute Daten', () => {
    expect(date('Geburtstag 15.11.')).toBe('2026-11-15');
    expect(date('Geburtstag am 15.11.2027')).toBe('2027-11-15');
    expect(date('Geburtstag 5.3.27')).toBe('2027-03-05');
    expect(date('Frist 1.10.')).toBe('2027-10-01'); // dieses Jahr schon vorbei → nächstes Jahr
    expect(date('Frist 2026-12-24')).toBe('2026-12-24');
    expect(date('Unsinn 31.2.')).toBeNull();
  });
});

describe('Uhrzeit', () => {
  it('Formate', () => {
    expect(p('Termin 14:30').time).toBe('14:30');
    expect(p('Termin um 9:05').time).toBe('09:05');
    expect(p('Termin 14.30 Uhr').time).toBe('14:30');
    expect(p('Termin 8 Uhr').time).toBe('08:00');
    expect(p('Termin um 17').time).toBe('17:00');
  });
  it('unplausible Zeiten bleiben im Titel', () => {
    const r = p('Raum 25 Uhr');
    expect(r.time).toBeNull();
    expect(r.title).toContain('25 Uhr');
  });
  it('nur Uhrzeit: heute, wenn noch nicht vorbei, sonst morgen', () => {
    expect(p('Anruf 14 Uhr').date).toBe('2026-10-22');
    expect(p('Anruf 8 Uhr').date).toBe('2026-10-23');
  });
  it('Datum und Uhrzeit zusammen', () => {
    expect(p('Meeting Freitag 9:30')).toMatchObject({
      title: 'Meeting',
      date: '2026-10-23',
      time: '09:30',
    });
  });
});

describe('Liste, Priorität, Person, Tags', () => {
  it('Listen auch mit Leerzeichen, Präfix und ohne Gross-/Kleinschreibung', () => {
    expect(p('x #arbeit').listId).toBe('l-arb');
    expect(p('x #Arb').listId).toBe('l-arb');
    expect(p('x #"Mein Haushalt"').listId).toBe('l-haus');
    expect(p('x #mein-haushalt').listId).toBe('l-haus');
  });
  it('unbekannte Liste bleibt im Titel', () => {
    const r = p('Feier #Party morgen');
    expect(r.listId).toBeNull();
    expect(r.title).toBe('Feier #Party');
  });
  it('Priorität', () => {
    expect(p('x !hoch').priority).toBe('high');
    expect(p('x !mittel').priority).toBe('medium');
    expect(p('x !tief').priority).toBe('low');
    expect(p('x !1').priority).toBe('high');
    expect(p('Wow! Super').priority).toBeNull();
  });
  it('Personen: Vorname, Nachname, ich; uneindeutige oder unbekannte bleiben stehen', () => {
    expect(p('x @anna').assigneeId).toBe('u-anna');
    expect(p('x @Muster').assigneeId).toBe('u-anna');
    expect(p('x @ich').assigneeId).toBe('u-me');
    expect(p('x @ben').assigneeId).toBe('u-ben');
    const unknown = p('Mail an @info schreiben');
    expect(unknown.assigneeId).toBeNull();
    expect(unknown.title).toBe('Mail an @info schreiben');
  });
  it('Tags', () => {
    const r = p('Pass erneuern +wichtig +Reise +wichtig');
    expect(r.tags).toEqual(['wichtig', 'Reise']);
    expect(r.title).toBe('Pass erneuern');
    expect(p('1+1 rechnen').tags).toEqual([]);
  });
});

describe('Wiederholung', () => {
  it('jeden Tag / täglich / wöchentlich', () => {
    expect(p('Pillen jeden Tag').repeat).toEqual({
      rrule: 'FREQ=DAILY',
      repeat_mode: 'fixed',
      repeat_after_days: null,
    });
    expect(p('Pillen täglich').repeat?.rrule).toBe('FREQ=DAILY');
    expect(p('Putzen wöchentlich').repeat?.rrule).toBe('FREQ=WEEKLY');
    expect(p('Miete monatlich').repeat?.rrule).toBe('FREQ=MONTHLY');
    expect(p('Versicherung jährlich').repeat?.rrule).toBe('FREQ=YEARLY');
    expect(p('Pillen jeden Tag').date).toBe('2026-10-22');
  });
  it('alle 2 Wochen, jeden Monat', () => {
    expect(p('Treffen alle 2 Wochen').repeat?.rrule).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(p('Miete jeden Monat').repeat?.rrule).toBe('FREQ=MONTHLY');
    expect(p('Gartenpflege alle drei Tage').repeat?.rrule).toBe('FREQ=DAILY;INTERVAL=3');
  });
  it('bestimmte Wochentage', () => {
    const r = p('Sport jeden Montag und Mittwoch');
    expect(r.repeat?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
    expect(r.title).toBe('Sport');
    expect(r.date).toBe('2026-10-26'); // erster Termin: nächster Montag
    expect(p('Sport jeden Donnerstag').date).toBe('2026-10-22'); // heute passt auch
    expect(p('Büro werktags').repeat?.rrule).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });
  it('mit Datum und Uhrzeit', () => {
    expect(p('Yoga jeden Dienstag 18 Uhr')).toMatchObject({
      title: 'Yoga',
      time: '18:00',
      date: '2026-10-27',
    });
    expect(p('Rechnung prüfen jeden Monat ab 1.12.').date).toBe('2026-12-01');
  });
  it('nach Erledigung', () => {
    const r = p('Pflanzen giessen 3 Tage nach Erledigung');
    expect(r.repeat).toEqual({
      rrule: null,
      repeat_mode: 'after_completion',
      repeat_after_days: 3,
    });
    expect(r.title).toBe('Pflanzen giessen');
    expect(r.date).toBe('2026-10-25');
    expect(p('Haare 2 Wochen nach Erledigung').repeat?.repeat_after_days).toBe(14);
  });
});

describe('Titel', () => {
  it('bleibt sauber, wenn nichts erkannt wird', () => {
    const r = p('  Einfach   etwas   tun  ');
    expect(r).toMatchObject({
      title: 'Einfach etwas tun',
      date: null,
      time: null,
      repeat: null,
      chips: [],
    });
  });
  it('Satzzeichen bleiben sinnvoll', () => {
    expect(p('Arzt anrufen, morgen!').title).toBe('Arzt anrufen!');
    expect(p('morgen, Arzt anrufen').title).toBe('Arzt anrufen');
  });
  it('alles zusammen', () => {
    const r = p('Wohnung putzen jeden Samstag 10 Uhr #"Mein Haushalt" !tief @ben +haushalt');
    expect(r).toMatchObject({
      title: 'Wohnung putzen',
      time: '10:00',
      date: '2026-10-24',
      listId: 'l-haus',
      priority: 'low',
      assigneeId: 'u-ben',
      tags: ['haushalt'],
    });
    expect(r.repeat?.rrule).toBe('FREQ=WEEKLY;BYDAY=SA');
  });
});
