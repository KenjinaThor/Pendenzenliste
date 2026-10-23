import { describe, expect, it } from 'vitest';
import { findAppointments } from './docScan';

const now = new Date(2026, 9, 23, 10, 0);

describe('findAppointments', () => {
  it('Datum und Uhrzeit in einer Zeile', () => {
    const r = findAppointments('Zahnarzt Kontrolle am 12.11.2026, 14:30 Uhr', now);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ date: '2026-11-12', time: '14:30', title: 'Zahnarzt Kontrolle' });
  });
  it('ausgeschriebener Monat mit Wochentag und «Uhr»', () => {
    const r = findAppointments('Elternabend: Dienstag, 3. November 2026 um 19 Uhr', now);
    expect(r[0]).toMatchObject({ date: '2026-11-03', time: '19:00' });
    expect(r[0].title).toBe('Elternabend');
  });
  it('Datum ohne Jahr nimmt das nächste Vorkommen', () => {
    expect(findAppointments('Treffen 5.1. 9.30 Uhr', now)[0]).toMatchObject({
      date: '2027-01-05',
      time: '09:30',
    });
    expect(findAppointments('Treffen 30. Okt', now)[0].date).toBe('2026-10-30');
  });
  it('Zeitbereich nimmt den Beginn', () => {
    expect(findAppointments('Impfung 02.12.2026 14.00–15.30', now)[0].time).toBe('14:00');
  });
  it('Uhrzeit in der nächsten Zeile', () => {
    const r = findAppointments('Einladung\nDatum: 20.11.2026\nBeginn: 08:15 Uhr', now);
    expect(r[0]).toMatchObject({ date: '2026-11-20', time: '08:15' });
  });
  it('mehrere Termine, keine Doppelten, ungültige Daten ignoriert', () => {
    const r = findAppointments(
      'A 01.12.2026 10:00\nA 01.12.2026 10:00\nB 31.02.2026\nC 2026-12-24',
      now,
    );
    expect(r.map((x) => `${x.date} ${x.time ?? ''}`.trim())).toEqual([
      '2026-12-01 10:00',
      '2026-12-24',
    ]);
  });
  it('Datum ohne Uhrzeit ist ganztägig; Telefonnummern sind keine Zeit', () => {
    const r = findAppointments('Frist 15.11.2026 Tel. 071 123 45 67', now);
    expect(r[0].time).toBeNull();
  });
  it('liefert nichts ohne Datum', () => {
    expect(findAppointments('Guten Tag, vielen Dank', now)).toEqual([]);
  });
});

describe('Leerzeilen', () => {
  it('Uhrzeit nach einer Leerzeile wird gefunden', () => {
    const r = findAppointments('Termin: 3. November 2026\n\num 14:30 Uhr in Raum 12', now);
    expect(r[0]).toMatchObject({ date: '2026-11-03', time: '14:30' });
  });
});
