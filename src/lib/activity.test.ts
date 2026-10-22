import { describe, expect, it } from 'vitest';
import { activityLines } from './activity';

const now = new Date(2026, 9, 22, 10, 0);
const names = (id: string | null) => (id === 'ben' ? 'Ben' : null);

describe('activityLines', () => {
  it('erstellt und kommentiert', () => {
    expect(activityLines({ action: 'created', diff: null }, names, now)).toEqual([
      'hat die Pendenz erstellt',
    ]);
    expect(
      activityLines({ action: 'commented', diff: { excerpt: 'Hallo' } as never }, names, now),
    ).toEqual(['hat kommentiert']);
  });

  it('Änderungen in Worten', () => {
    const lines = activityLines(
      {
        action: 'updated',
        diff: {
          status: { from: 'open', to: 'done' },
          priority: { from: 'medium', to: 'high' },
          due_at: { from: null, to: new Date(2026, 9, 23).toISOString() },
          due_all_day: { from: false, to: true },
          assignee_id: { from: null, to: 'ben' },
        },
      },
      names,
      now,
    );
    expect(lines).toEqual([
      'hat die Pendenz erledigt',
      'hat die Priorität auf «Hoch» gesetzt',
      'hat die Fälligkeit auf Morgen gesetzt',
      'hat die Pendenz Ben zugewiesen',
    ]);
  });

  it('entfernt, wiederhergestellt, wieder geöffnet', () => {
    const lines = activityLines(
      {
        action: 'updated',
        diff: {
          due_at: { from: 'x', to: null },
          deleted_at: { from: 'x', to: null },
          status: { from: 'done', to: 'open' },
          assignee_id: { from: 'ben', to: null },
        },
      },
      names,
      now,
    );
    expect(lines).toEqual([
      'hat die Fälligkeit entfernt',
      'hat die Pendenz wiederhergestellt',
      'hat die Pendenz wieder geöffnet',
      'hat die Zuweisung entfernt',
    ]);
  });
});
