import { describe, expect, it } from 'vitest';
import { BOM, detectDelimiter, parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('Trennzeichen erkennen', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(detectDelimiter('"a;b",c,d')).toBe(','); // Trennzeichen in Anführungszeichen zählt nicht
    expect(detectDelimiter('nur eine Spalte')).toBe(';');
  });
  it('liest einfache und komplizierte Felder', () => {
    expect(parseCsv('a;b\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv(BOM + 'a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]); // BOM
    expect(parseCsv('t;n\n"Titel; mit Semikolon";"Zeile 1\nZeile 2"')).toEqual([
      ['t', 'n'],
      ['Titel; mit Semikolon', 'Zeile 1\nZeile 2'],
    ]);
    expect(parseCsv('a;b\n"sagt ""Hallo""";x')).toEqual([
      ['a', 'b'],
      ['sagt "Hallo"', 'x'],
    ]);
    expect(parseCsv('a;b\n\n;\n1;')).toEqual([
      ['a', 'b'],
      ['1', ''],
    ]); // Leerzeilen weg, leere Felder bleiben
  });
  it('schreibt mit Anführungszeichen nur wo nötig und liest es wieder', () => {
    const rows = [
      ['Titel', 'Notiz'],
      ['Einkaufen; Brot', 'a "b"\nc'],
      ['ohne', 'nichts'],
    ];
    const csv = toCsv(rows);
    expect(csv).toContain('"Einkaufen; Brot"');
    expect(csv).toContain('ohne;nichts');
    expect(parseCsv(csv)).toEqual(rows);
    expect(parseCsv(toCsv(rows, ','), ',')).toEqual(rows);
  });
});
