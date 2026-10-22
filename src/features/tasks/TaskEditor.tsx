import { useState, type FormEvent } from 'react';
import { Sheet } from '../../components/Sheet';
import { useSnackbar } from '../../components/Snackbar';
import {
  useAddSubtasks,
  useCreateTask,
  useDeleteSubtask,
  useLists,
  useTasks,
  useTrashTask,
  useUpdateSubtask,
  useUpdateTask,
} from '../../lib/api';
import { addDays, buildDue, nextMonday, toDateInput, toTimeInput } from '../../lib/dates';
import { downloadTaskIcs } from '../../lib/singleIcs';
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from '../../lib/types';
import { usePermissions } from '../sharing/usePermissions';
import { ActivitySection } from './ActivitySection';
import { CommentsSection } from './CommentsSection';
import type { NewTaskDefaults } from './EditorContext';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const field = 'h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

export function TaskEditor({
  taskId,
  defaults,
  onClose,
}: {
  taskId: string | null;
  defaults?: NewTaskDefaults;
  onClose: () => void;
}) {
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const existing = tasks.find((t) => t.id === taskId);
  const create = useCreateTask();
  const update = useUpdateTask();
  const trash = useTrashTask();
  const addSubtasks = useAddSubtasks();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();
  const snackbar = useSnackbar();
  const perms = usePermissions();

  const due = existing?.due_at ? new Date(existing.due_at) : null;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes_md ?? '');
  // Auswahl der Person; solange nichts gewählt ist, gilt die erste Liste (auch wenn sie erst später lädt)
  const [chosenListId, setListId] = useState(existing?.list_id ?? defaults?.list_id ?? '');
  const [assigneeId, setAssigneeId] = useState(existing?.assignee_id ?? '');
  const listId = chosenListId || lists[0]?.id || '';
  // Leser dürfen nichts ändern; in Listen ohne Schreibrecht kann nichts neu angelegt werden
  const readOnly = existing ? !perms.canEdit(existing.list_id) : false;
  const members = perms.membersOf(listId);
  const writableLists = lists.filter((l) => perms.canEdit(l.id) || l.id === existing?.list_id);
  const effectiveAssignee = members.some((m) => m.user_id === assigneeId) ? assigneeId : '';
  const [date, setDate] = useState(due ? toDateInput(due) : (defaults?.date ?? ''));
  const [time, setTime] = useState(due && !existing?.due_all_day ? toTimeInput(due) : '');
  const [duration, setDuration] = useState<number | ''>(existing?.duration_min ?? '');
  // «Eigene Dauer»: Eingabe in Stunden und Minuten (auch für bereits gespeicherte Sonderwerte)
  const [customDuration, setCustomDuration] = useState(
    existing?.duration_min != null && !DURATIONS.includes(existing.duration_min),
  );
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 'medium');
  const [status, setStatus] = useState<Status>(existing?.status ?? 'open');
  const [draftSubtasks, setDraftSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [error, setError] = useState<string | null>(null);

  const minutesPart = (d: number | '') => (d === '' ? 0 : d % 60);
  function setCustomParts(hours: number, minutes: number) {
    const total =
      Math.max(0, Math.min(99, hours || 0)) * 60 + Math.max(0, Math.min(59, minutes || 0));
    setDuration(total > 0 ? total : '');
  }

  const today = new Date();
  const setQuickDate = (d: Date | null) => setDate(d ? toDateInput(d) : '');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !listId) return;
    setError(null);
    const dueValues = buildDue(date, time) ?? { due_at: null, due_all_day: false };
    const values = {
      list_id: listId,
      title: title.trim(),
      notes_md: notes,
      ...dueValues,
      duration_min: time && duration ? Number(duration) : null,
      priority,
      status,
      assignee_id: effectiveAssignee || null,
    };
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          patch: {
            ...values,
            completed_at:
              status === 'done' ? (existing.completed_at ?? new Date().toISOString()) : null,
          },
        });
      } else {
        const task = await create.mutateAsync(values);
        const pending = newSubtask.trim() ? [...draftSubtasks, newSubtask.trim()] : draftSubtasks;
        if (pending.length)
          await addSubtasks.mutateAsync({ taskId: task.id, titles: pending, start: 0 });
        try {
          localStorage.setItem('lastListId', listId);
        } catch {
          /* ignorieren */
        }
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addSubtask() {
    const text = newSubtask.trim();
    if (!text) return;
    setNewSubtask('');
    if (existing) {
      const start = existing.subtasks.length
        ? Math.max(...existing.subtasks.map((s) => s.position)) + 1
        : 0;
      await addSubtasks.mutateAsync({ taskId: existing.id, titles: [text], start });
    } else {
      setDraftSubtasks((d) => [...d, text]);
    }
  }

  async function onTrash() {
    if (!existing) return;
    await trash.mutateAsync({ id: existing.id, trashed: true });
    onClose();
    snackbar({
      text: 'In den Papierkorb verschoben',
      onAction: () => trash.mutate({ id: existing.id, trashed: false }),
    });
  }

  const subtasks = existing?.subtasks ?? [];
  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <Sheet title={existing ? 'Pendenz bearbeiten' : 'Neue Pendenz'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
        {readOnly && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Du hast in dieser Liste nur Leserechte.
          </p>
        )}
        <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
          <input
            autoFocus={!existing}
            aria-label="Titel"
            placeholder="Titel"
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
            className={field}
          />
          <textarea
            aria-label="Notizen"
            placeholder="Notizen (Markdown möglich)"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
          />

          <label className="flex flex-col gap-1 text-sm font-medium">
            Liste
            <select value={listId} onChange={(e) => setListId(e.target.value)} className={field}>
              {writableLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.emoji} {l.name}
                </option>
              ))}
            </select>
          </label>

          {members.length > 1 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Zugewiesen an
              <select
                value={effectiveAssignee}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={field}
              >
                <option value="">Niemand</option>
                {members
                  .filter((m) => m.role !== 'viewer')
                  .map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profiles?.name}
                      {m.user_id === perms.userId ? ' (ich)' : ''}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">Fällig</p>
            <div className="mb-2 flex flex-wrap gap-2 text-sm">
              {[
                ['Heute', today],
                ['Morgen', addDays(today, 1)],
                ['Nächste Woche', nextMonday(today)],
                ['Kein Datum', null],
              ].map(([label, d]) => (
                <button
                  type="button"
                  key={label as string}
                  onClick={() => setQuickDate(d as Date | null)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 active:bg-slate-200 dark:bg-slate-700 dark:active:bg-slate-600"
                >
                  {label as string}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                aria-label="Fälligkeitsdatum"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${field} min-w-0 flex-1`}
              />
              <input
                type="time"
                aria-label="Uhrzeit (optional)"
                value={time}
                disabled={!date}
                onChange={(e) => setTime(e.target.value)}
                className={`${field} w-32 disabled:opacity-50`}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Ohne Uhrzeit ist die Pendenz ganztägig fällig.
            </p>
            {time && (
              <div className="mt-2 flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Dauer
                  <select
                    aria-label="Dauer"
                    value={customDuration ? 'custom' : duration}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomDuration(v === 'custom');
                      if (v !== 'custom') setDuration(v ? Number(v) : '');
                    }}
                    className={field}
                  >
                    <option value="">Keine Angabe</option>
                    {DURATIONS.map((m) => (
                      <option key={m} value={m}>
                        {m >= 60 && m % 60 === 0 ? `${m / 60} Std.` : `${m} Min.`}
                      </option>
                    ))}
                    <option value="custom">Eigene Dauer …</option>
                  </select>
                </label>
                {customDuration && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      aria-label="Dauer in Stunden"
                      value={duration === '' ? '' : Math.floor(duration / 60)}
                      onChange={(e) =>
                        setCustomParts(Number(e.target.value), minutesPart(duration))
                      }
                      placeholder="0"
                      className={`${field} w-20 text-center`}
                    />
                    <span className="text-sm">Std.</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      aria-label="Dauer in Minuten"
                      value={duration === '' ? '' : duration % 60}
                      onChange={(e) =>
                        setCustomParts(
                          Math.floor(Number(duration || 0) / 60),
                          Number(e.target.value),
                        )
                      }
                      placeholder="0"
                      className={`${field} w-20 text-center`}
                    />
                    <span className="text-sm">Min.</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Priorität</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Priorität">
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <button
                  type="button"
                  key={p}
                  aria-pressed={priority === p}
                  onClick={() => setPriority(p)}
                  className={`h-11 rounded-xl text-sm font-medium ${priority === p ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Status)}
              className={field}
            >
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-2 text-sm font-medium">
              Unteraufgaben{' '}
              {subtasks.length > 0 && (
                <span className="text-slate-500">
                  ({doneCount}/{subtasks.length})
                </span>
              )}
            </p>
            {subtasks.length > 0 && (
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(doneCount / subtasks.length) * 100}%` }}
                />
              </div>
            )}
            <ul className="flex flex-col gap-1">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.done}
                    aria-label={s.title}
                    className="h-5 w-5"
                    onChange={(e) =>
                      updateSubtask.mutate({
                        id: s.id,
                        taskId: s.task_id,
                        patch: { done: e.target.checked },
                      })
                    }
                  />
                  <span className={`flex-1 ${s.done ? 'text-slate-400 line-through' : ''}`}>
                    {s.title}
                  </span>
                  <button
                    type="button"
                    aria-label={`Unteraufgabe ${s.title} löschen`}
                    className="h-9 w-9 text-slate-400"
                    onClick={() => deleteSubtask.mutate({ id: s.id, taskId: s.task_id })}
                  >
                    ×
                  </button>
                </li>
              ))}
              {draftSubtasks.map((t, i) => (
                <li key={`${t}-${i}`} className="flex items-center gap-2">
                  <input type="checkbox" disabled className="h-5 w-5" aria-hidden />
                  <span className="flex-1">{t}</span>
                  <button
                    type="button"
                    aria-label={`Unteraufgabe ${t} entfernen`}
                    className="h-9 w-9 text-slate-400"
                    onClick={() => setDraftSubtasks((d) => d.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                aria-label="Neue Unteraufgabe"
                placeholder="Unteraufgabe hinzufügen"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void addSubtask();
                  }
                }}
                className={`${field} min-w-0 flex-1`}
              />
              <button
                type="button"
                onClick={() => void addSubtask()}
                className="h-12 rounded-xl bg-slate-200 px-4 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
              >
                +
              </button>
            </div>
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {!readOnly && (
          <button
            disabled={!title.trim() || !listId || create.isPending || update.isPending}
            className="h-12 rounded-xl bg-brand-600 font-medium text-white active:bg-brand-700 disabled:opacity-60"
          >
            Speichern
          </button>
        )}
        {existing?.due_at && (
          <button
            type="button"
            onClick={() =>
              downloadTaskIcs(
                existing,
                lists.find((l) => l.id === existing.list_id),
              )
            }
            className="h-12 rounded-xl bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
          >
            📅 Zum Kalender hinzufügen
          </button>
        )}
        {existing && !readOnly && (
          <button
            type="button"
            onClick={onTrash}
            className="h-12 rounded-xl border border-red-300 font-medium text-red-700"
          >
            In den Papierkorb
          </button>
        )}
      </form>
      {existing && (
        <>
          <CommentsSection
            taskId={existing.id}
            listId={existing.list_id}
            canComment={perms.canEdit(existing.list_id)}
          />
          <ActivitySection taskId={existing.id} listId={existing.list_id} />
        </>
      )}
    </Sheet>
  );
}
