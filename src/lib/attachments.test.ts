import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  fitWithin,
  formatBytes,
  isAllowedType,
  sanitizeFileName,
} from './attachments';

describe('attachments', () => {
  it('erlaubte Typen und Limit', () => {
    expect(isAllowedType('application/pdf')).toBe(true);
    expect(isAllowedType('image/JPEG')).toBe(true);
    expect(isAllowedType('application/zip')).toBe(false);
    expect(MAX_ATTACHMENT_BYTES).toBe(5_242_880);
  });
  it('Dateinamen bereinigen', () => {
    expect(sanitizeFileName('Rechnung März 2026.pdf')).toBe('Rechnung_Marz_2026.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeFileName('  ?? .jpg')).toBe('jpg');
    expect(sanitizeFileName('???')).toBe('datei');
    expect(sanitizeFileName('a'.repeat(300) + '.pdf').length).toBe(100);
    expect(sanitizeFileName('a'.repeat(300) + '.pdf').endsWith('.pdf')).toBe(true);
  });
  it('Grössen anzeigen', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1,5 MB');
  });
  it('Bilder verkleinern, Seitenverhältnis bleibt', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
