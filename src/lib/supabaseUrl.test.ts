import { describe, expect, it } from 'vitest';
import { normalizeSupabaseUrl } from './supabaseUrl';

describe('normalizeSupabaseUrl', () => {
  it('entfernt Pfadzusätze und Schrägstriche', () => {
    expect(normalizeSupabaseUrl('https://abc.supabase.co/rest/v1/')).toBe(
      'https://abc.supabase.co',
    );
    expect(normalizeSupabaseUrl(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co');
  });
  it('lehnt ungültige Werte ab', () => {
    expect(normalizeSupabaseUrl('abc.supabase.co')).toBeUndefined();
    expect(normalizeSupabaseUrl('')).toBeUndefined();
    expect(normalizeSupabaseUrl(undefined)).toBeUndefined();
  });
});
