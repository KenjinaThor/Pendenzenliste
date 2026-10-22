import { formatDue } from './dates';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type ActivityEntry,
  type Priority,
  type Status,
} from './types';

type Diff = Record<string, { from: unknown; to: unknown }>;

/** Beschreibt eine Änderung in Worten, z. B. «hat die Fälligkeit auf Morgen gesetzt». */
export function activityLines(
  entry: Pick<ActivityEntry, 'action' | 'diff'>,
  nameOf: (userId: string | null) => string | null,
  now = new Date(),
): string[] {
  if (entry.action === 'created') return ['hat die Pendenz erstellt'];
  if (entry.action === 'commented') return ['hat kommentiert'];

  const diff = (entry.diff ?? {}) as Diff;
  const lines: string[] = [];
  const dueText = (value: unknown, allDay: boolean) =>
    typeof value === 'string' ? formatDue(new Date(value), allDay, now) : null;

  for (const [key, { from, to }] of Object.entries(diff)) {
    switch (key) {
      case 'title':
        lines.push('hat den Titel geändert');
        break;
      case 'status':
        if (to === 'done') lines.push('hat die Pendenz erledigt');
        else if (from === 'done') lines.push('hat die Pendenz wieder geöffnet');
        else lines.push(`hat den Status auf «${STATUS_LABEL[to as Status] ?? to}» gesetzt`);
        break;
      case 'priority':
        lines.push(`hat die Priorität auf «${PRIORITY_LABEL[to as Priority] ?? to}» gesetzt`);
        break;
      case 'due_at': {
        const text = dueText(to, 'due_all_day' in diff ? Boolean(diff.due_all_day.to) : true);
        lines.push(text ? `hat die Fälligkeit auf ${text} gesetzt` : 'hat die Fälligkeit entfernt');
        break;
      }
      case 'due_all_day':
        if (!('due_at' in diff)) lines.push('hat die Uhrzeit geändert');
        break;
      case 'assignee_id': {
        const name = nameOf((to as string | null) ?? null);
        lines.push(
          to ? `hat die Pendenz ${name ?? 'jemandem'} zugewiesen` : 'hat die Zuweisung entfernt',
        );
        break;
      }
      case 'list_id':
        lines.push('hat die Pendenz in eine andere Liste verschoben');
        break;
      case 'deleted_at':
        lines.push(
          to ? 'hat die Pendenz in den Papierkorb verschoben' : 'hat die Pendenz wiederhergestellt',
        );
        break;
    }
  }
  return lines;
}
