import { describe, expect, it } from 'vitest';
import { changedFields, type EditableValues } from './taskDiff';
import type { Task } from './types';

const existing = {
  id: 't',
  list_id: 'l1',
  title: 'Alt',
  notes_md: '',
  due_at: '2026-10-25T10:00:00.000Z',
  due_all_day: false,
  duration_min: null,
  priority: 'medium',
  status: 'open',
  assignee_id: null,
  rrule: null,
  repeat_mode: 'fixed',
  repeat_after_days: null,
  focus_date: '2026-10-22',
  completed_at: null,
} as unknown as Task;
const values: EditableValues = {
  list_id: 'l1',
  title: 'Alt',
  notes_md: '',
  due_at: '2026-10-25T10:00:00.000Z',
  due_all_day: false,
  duration_min: null,
  priority: 'medium',
  status: 'open',
  assignee_id: null,
  rrule: null,
  repeat_mode: 'fixed',
  repeat_after_days: null,
};

describe('changedFields', () => {
  it('nichts geändert → leer', () => {
    expect(changedFields(existing, values)).toEqual({});
  });
  it('nur geänderte Felder', () => {
    expect(changedFields(existing, { ...values, title: 'Neu', priority: 'high' })).toEqual({
      title: 'Neu',
      priority: 'high',
    });
  });
  it('Datum wird zeitlich verglichen (andere Schreibweise = gleich)', () => {
    expect(changedFields(existing, { ...values, due_at: '2026-10-25T12:00:00+02:00' })).toEqual({});
    expect(changedFields(existing, { ...values, due_at: null })).toEqual({ due_at: null });
  });
  it('Status erledigt setzt completed_at, Wiedereröffnen löscht es', () => {
    expect(changedFields(existing, { ...values, status: 'done' })).toMatchObject({
      status: 'done',
      completed_at: expect.any(String),
    });
    expect(changedFields({ ...existing, status: 'done', completed_at: 'x' }, values)).toEqual({
      status: 'open',
      completed_at: null,
    });
  });
});
