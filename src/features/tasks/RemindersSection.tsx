import { useState } from 'react';
import {
  useAddReminders,
  useDeleteReminder,
  useReminders,
  type ReminderInput,
} from '../../lib/api';
import { REMINDER_PRESETS, offsetLabel, reminderLabel } from '../../lib/reminders';

const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

interface Props {
  /** vorhandene Pendenz: Erinnerungen werden sofort gespeichert; sonst nur vorgemerkt */
  taskId: string | null;
  hasDue: boolean;
  allDay: boolean;
  drafts: ReminderInput[];
  onDraftsChange: (items: ReminderInput[]) => void;
}

export function RemindersSection({ taskId, hasDue, allDay, drafts, onDraftsChange }: Props) {
  const { data: saved = [] } = useReminders(taskId ?? undefined);
  const add = useAddReminders();
  const del = useDeleteReminder();
  const [custom, setCustom] = useState('');

  const items: { key: string; label: string; remove: () => void; sent?: boolean }[] = taskId
    ? saved.map((r) => ({
        key: r.id,
        label: reminderLabel(r, allDay),
        sent: Boolean(r.sent_at),
        remove: () => del.mutate({ id: r.id, taskId }),
      }))
    : drafts.map((d, i) => ({
        key: `d${i}`,
        label: reminderLabel(d, allDay),
        remove: () => onDraftsChange(drafts.filter((_, j) => j !== i)),
      }));

  function addItem(item: ReminderInput) {
    if (taskId) add.mutate({ taskId, items: [item] });
    else onDraftsChange([...drafts, item]);
  }

  const used = new Set(
    (taskId ? saved : drafts)
      .map((r) => r.offset_min)
      .filter((m): m is number => m !== null && m !== undefined),
  );

  return (
    <section aria-label="Erinnerungen">
      <p className="mb-2 text-sm font-medium">Erinnerungen</p>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {items.map((i) => (
            <li
              key={i.key}
              className="flex items-center gap-1 rounded-full bg-indigo-100 py-1 pr-1 pl-3 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
            >
              <span>
                🔔 {i.label}
                {i.sent ? ' ✓' : ''}
              </span>
              <button
                type="button"
                aria-label={`Erinnerung ${i.label} entfernen`}
                onClick={i.remove}
                className="h-7 w-7 rounded-full text-indigo-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <select
          aria-label="Erinnerung hinzufügen"
          value=""
          disabled={!hasDue}
          onChange={(e) =>
            e.target.value !== '' && void addItem({ offset_min: Number(e.target.value) })
          }
          className={field}
        >
          <option value="">
            {hasDue ? '＋ Erinnerung hinzufügen …' : 'Zuerst ein Fälligkeitsdatum setzen'}
          </option>
          {REMINDER_PRESETS.filter((m) => !used.has(m)).map((m) => (
            <option key={m} value={m}>
              {offsetLabel(m, allDay)}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            aria-label="Eigener Erinnerungszeitpunkt"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className={`${field} min-w-0 flex-1`}
          />
          <button
            type="button"
            disabled={!custom}
            onClick={() => {
              void addItem({ at: new Date(custom).toISOString() });
              setCustom('');
            }}
            className="h-11 rounded-xl bg-slate-200 px-3 text-sm font-medium text-slate-900 disabled:opacity-50 dark:bg-slate-700 dark:text-white"
          >
            Eigene Zeit
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Erinnerungen kommen als Mitteilung aufs Gerät – aktivierbar unter{' '}
        <a href="#/einstellungen" className="underline">
          Einstellungen
        </a>
        .
      </p>
    </section>
  );
}
