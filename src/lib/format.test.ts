import { describe, expect, it } from 'vitest';
import { formatDate } from './format';

describe('formatDate', () => {
  it('formatiert als TT.MM.JJJJ', () => {
    expect(formatDate(new Date(2026, 10, 5))).toBe('05.11.2026');
  });
});
