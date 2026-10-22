import { buildIcs } from '../../supabase/functions/_shared/ics.ts';
import type { Task, TodoList } from './types';

/** Erzeugt eine einzelne .ics-Datei und lässt sie vom Browser öffnen bzw. herunterladen. */
export function downloadTaskIcs(task: Task, list?: TodoList) {
  if (!task.due_at) return;
  const ics = buildIcs(
    [
      {
        id: task.id,
        title: task.title,
        notes_md: task.notes_md,
        due_at: task.due_at,
        due_all_day: task.due_all_day,
        duration_min: task.duration_min,
        priority: task.priority,
        rrule: task.rrule,
        updated_at: task.updated_at,
        list_name: list?.name,
        subtasks: task.subtasks.map((s) => ({ title: s.title, done: s.done })),
      },
    ],
    {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich',
      appUrl: `${window.location.origin}${import.meta.env.BASE_URL}`,
    },
  );
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${task.title.replace(/[^\w\-äöüÄÖÜ ]+/g, '').trim() || 'Pendenz'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
