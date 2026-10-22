import { useState } from 'react';
import { useSnackbar } from '../../components/Snackbar';
import { useCompleteTask, useUpdateTask } from '../../lib/api';
import { formatDue, formatDay } from '../../lib/dates';
import { STATUS_LABEL, type Status, type Task } from '../../lib/types';
import { compareTasks, isOverdue } from '../../lib/views';
import { usePermissions } from '../sharing/usePermissions';
import { useEditor } from '../tasks/EditorContext';

export const COLUMNS: Status[] = ['open', 'in_progress', 'waiting', 'done'];

const COLUMN_STYLE: Record<Status, string> = {
  open: 'bg-slate-100 dark:bg-slate-800',
  in_progress: 'bg-blue-50 dark:bg-blue-950',
  waiting: 'bg-amber-50 dark:bg-amber-950',
  done: 'bg-emerald-50 dark:bg-emerald-950',
};

/** Spalten = Status. Karten lassen sich ziehen (PC) oder mit den Pfeilen verschieben (Touch, Tastatur). */
export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const { openTask } = useEditor();
  const perms = usePermissions();
  const update = useUpdateTask();
  const complete = useCompleteTask();
  const snackbar = useSnackbar();
  const [overColumn, setOverColumn] = useState<Status | null>(null);
  const now = new Date();

  function move(task: Task, to: Status) {
    if (task.status === to || !perms.canEdit(task.list_id)) return;
    if (to === 'done') {
      complete(task).then(
        ({ nextDue, undo }) =>
          snackbar({
            text: nextDue
              ? `«${task.title}» erledigt · nächste: ${formatDay(nextDue, new Date())}`
              : `«${task.title}» erledigt`,
            onAction: () => void undo(),
          }),
        (e: Error) => snackbar({ text: `Fehler: ${e.message}` }),
      );
    } else {
      // aus «Erledigt» heraus wird die Pendenz zugleich wieder geöffnet
      update.mutate({
        id: task.id,
        patch: { status: to, ...(task.status === 'done' ? { completed_at: null } : {}) },
      });
    }
  }

  return (
    <div className="flex snap-x gap-3 overflow-x-auto px-4 pb-6" aria-label="Kanban-Ansicht">
      {COLUMNS.map((status, ci) => {
        const column = tasks.filter((t) => t.status === status).sort(compareTasks);
        return (
          <section
            key={status}
            aria-label={`${STATUS_LABEL[status]} (${column.length})`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverColumn(status);
            }}
            onDragLeave={() => setOverColumn((c) => (c === status ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOverColumn(null);
              const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/task-id'));
              if (task) move(task, status);
            }}
            className={`min-h-48 w-64 shrink-0 snap-start rounded-2xl p-3 md:w-auto md:min-w-48 md:flex-1 ${COLUMN_STYLE[status]} ${overColumn === status ? 'ring-2 ring-indigo-500' : ''}`}
          >
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
              {STATUS_LABEL[status]}
              <span className="font-normal text-slate-500">{column.length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {column.map((t) => (
                <li
                  key={t.id}
                  data-task-id={t.id}
                  draggable={perms.canEdit(t.list_id)}
                  onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
                  className="rounded-xl bg-white p-3 shadow-sm dark:bg-slate-700"
                >
                  <button onClick={() => openTask(t.id)} className="block w-full text-left">
                    <span
                      className={`block font-medium ${status === 'done' ? 'text-slate-400 line-through' : ''}`}
                    >
                      {t.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                      {t.due_at && (
                        <span className={isOverdue(t, now) ? 'font-medium text-red-600' : ''}>
                          {formatDue(new Date(t.due_at), t.due_all_day, now)}
                        </span>
                      )}
                      {t.assignee_id && (
                        <span>
                          👤{' '}
                          {t.assignee_id === perms.userId
                            ? 'ich'
                            : perms.nameOf(t.list_id, t.assignee_id)}
                        </span>
                      )}
                      {t.tags.map((x) => (
                        <span key={x.id} className="text-indigo-700 dark:text-indigo-300">
                          #{x.name}
                        </span>
                      ))}
                    </span>
                  </button>
                  {perms.canEdit(t.list_id) && (
                    <div className="mt-2 flex justify-between">
                      <button
                        disabled={ci === 0}
                        onClick={() => move(t, COLUMNS[ci - 1])}
                        aria-label={`${t.title} nach «${STATUS_LABEL[COLUMNS[Math.max(ci - 1, 0)]]}» verschieben`}
                        className="h-8 w-10 rounded-lg bg-slate-100 text-sm disabled:opacity-30 dark:bg-slate-600"
                      >
                        ◀
                      </button>
                      <button
                        disabled={ci === COLUMNS.length - 1}
                        onClick={() => move(t, COLUMNS[ci + 1])}
                        aria-label={`${t.title} nach «${STATUS_LABEL[COLUMNS[Math.min(ci + 1, COLUMNS.length - 1)]]}» verschieben`}
                        className="h-8 w-10 rounded-lg bg-slate-100 text-sm disabled:opacity-30 dark:bg-slate-600"
                      >
                        ▶
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
