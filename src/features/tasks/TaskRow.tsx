import { useEffect, useRef, useState } from 'react';
import { useSnackbar } from '../../components/Snackbar';
import { useLists, useSetDone } from '../../lib/api';
import { formatDue } from '../../lib/dates';
import type { Task } from '../../lib/types';
import { isDone, isOverdue } from '../../lib/views';
import { useEditor } from './EditorContext';

const PRIORITY_COLOR = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-slate-300' } as const;

export function TaskRow({ task, showList = true }: { task: Task; showList?: boolean }) {
  const { openTask } = useEditor();
  const { data: lists = [] } = useLists();
  const setDone = useSetDone();
  const snackbar = useSnackbar();
  const [checking, setChecking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const now = new Date();
  const list = lists.find((l) => l.id === task.list_id);
  const done = isDone(task);
  const overdue = isOverdue(task, now);
  const checked = done || checking;
  const subtasksDone = task.subtasks.filter((s) => s.done).length;

  function toggle() {
    const next = !done;
    if (!next) {
      void setDone(task, false);
      return;
    }
    // kurze Animation, bevor die Pendenz aus der Ansicht verschwindet
    setChecking(true);
    timer.current = window.setTimeout(() => {
      void setDone(task, true);
      setChecking(false);
      snackbar({ text: `«${task.title}» erledigt`, onAction: () => void setDone(task, false) });
    }, 350);
  }

  return (
    <li className="flex items-start gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm dark:bg-slate-800">
      <button
        role="checkbox"
        aria-checked={checked}
        aria-label={`${task.title} als erledigt markieren`}
        onClick={toggle}
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300 active:scale-90"
        style={{
          borderColor: list?.color ?? '#94a3b8',
          backgroundColor: checked ? (list?.color ?? '#94a3b8') : 'transparent',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 text-white transition-all duration-300 ${checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12l5 5 9-10" />
        </svg>
      </button>
      <button onClick={() => openTask(task.id)} className="min-w-0 flex-1 text-left">
        <span
          className={`flex items-center gap-2 transition-all duration-300 ${checked ? 'text-slate-400 line-through' : ''}`}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_COLOR[task.priority]}`}
            title={`Priorität ${task.priority}`}
          />
          <span className="truncate font-medium">{task.title}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          {task.due_at && (
            <span className={overdue ? 'font-medium text-red-600' : ''}>
              {formatDue(new Date(task.due_at), task.due_all_day, now)}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span>
              ☑ {subtasksDone}/{task.subtasks.length}
            </span>
          )}
          {task.status === 'in_progress' && <span>In Arbeit</span>}
          {task.status === 'waiting' && <span>Wartend</span>}
          {showList && list && (
            <span>
              {list.emoji} {list.name}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
