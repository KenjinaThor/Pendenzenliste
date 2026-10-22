import { describe, expect, it } from 'vitest';
import { normalizePayload, parseSubtaskLines, taskToTemplate } from './templates';
import type { Task } from './types';

describe('templates', () => {
  it('Vorlage aus einer Pendenz', () => {
    const task = {
      title: 'Ferien vorbereiten',
      notes_md: 'Checkliste',
      priority: 'high',
      duration_min: 60,
      tags: [{ id: '1', name: 'Reise', color: '#000' }],
      subtasks: [{ title: 'Pass prüfen' }, { title: 'Koffer packen' }],
      due_at: '2026-01-01',
      assignee_id: 'x',
    } as unknown as Task;
    expect(taskToTemplate(task)).toEqual({
      title: 'Ferien vorbereiten',
      notes_md: 'Checkliste',
      priority: 'high',
      duration_min: 60,
      tags: ['Reise'],
      subtasks: ['Pass prüfen', 'Koffer packen'],
    });
  });
  it('ergänzt fehlende und ungültige Felder', () => {
    expect(normalizePayload(null)).toEqual({
      title: '',
      notes_md: '',
      priority: 'medium',
      duration_min: null,
      tags: [],
      subtasks: [],
    });
    expect(
      normalizePayload({
        title: 'x',
        priority: 'dringend',
        subtasks: ['a', ' ', 3, ' b '],
        duration_min: -5,
      }),
    ).toEqual({
      title: 'x',
      notes_md: '',
      priority: 'medium',
      duration_min: null,
      tags: [],
      subtasks: ['a', 'b'],
    });
  });
  it('Unteraufgaben aus Text (Aufzählungszeichen und Leerzeilen entfernen)', () => {
    expect(
      parseSubtaskLines(
        '- Pass prüfen\n\n* Koffer packen\r\n3. Tickets drucken\n☐ Wohnung abschliessen\n  Haustier betreuen  ',
      ),
    ).toEqual([
      'Pass prüfen',
      'Koffer packen',
      'Tickets drucken',
      'Wohnung abschliessen',
      'Haustier betreuen',
    ]);
    expect(parseSubtaskLines('')).toEqual([]);
  });
});
