import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSnackbar } from '../../components/Snackbar';
import {
  useCompleteTask,
  useLists,
  useSetDone,
  useTasks,
  useTrashTask,
  useUpdateTask,
} from '../../lib/api';
import { addDays, formatDay, formatDue, toDateInput } from '../../lib/dates';
import { describeRepeat, isRecurring } from '../../lib/recurrence';
import type { Task } from '../../lib/types';
import { MAX_FOCUS, focusTasks, isDone, isOverdue } from '../../lib/views';
import { usePermissions } from '../sharing/usePermissions';
import { useEditor } from './EditorContext';
import { useSelection } from './SelectionContext';

const PRIORITY_COLOR = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-slate-300' } as const;

const ACTIONS_WIDTH = 150; // Breite der Schaltflächen hinter der Zeile (Wischen nach links)
const COMPLETE_DISTANCE = 90; // Wischen nach rechts: ab hier gilt die Pendenz als erledigt

export function TaskRow({ task, showList = true }: { task: Task; showList?: boolean }) {
  const { openTask } = useEditor();
  const { data: lists = [] } = useLists();
  const setDone = useSetDone();
  const complete = useCompleteTask();
  const update = useUpdateTask();
  const trash = useTrashTask();
  const perms = usePermissions();
  const snackbar = useSnackbar();
  const { selectedId } = useSelection();
  const { data: allTasks = [] } = useTasks();
  const [checking, setChecking] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const now = new Date();
  const list = lists.find((l) => l.id === task.list_id);
  const done = isDone(task);
  const overdue = isOverdue(task, now);
  const checked = done || checking;
  const subtasksDone = task.subtasks.filter((s) => s.done).length;
  const editable = perms.canEdit(task.list_id);
  const todayKey = toDateInput(now);
  const focused = task.focus_date === todayKey;

  /** Tagesfokus «Meine 3 für heute»: höchstens drei Pendenzen */
  function toggleFocus() {
    if (!focused && focusTasks(allTasks, todayKey).length >= MAX_FOCUS) {
      snackbar({ text: `Dein Tagesfokus ist voll (höchstens ${MAX_FOCUS} Pendenzen).` });
      return;
    }
    update.mutate({ id: task.id, patch: { focus_date: focused ? null : todayKey } });
  }

  function toggle() {
    if (done) {
      void setDone(task, false);
      return;
    }
    // kurze Animation, bevor die Pendenz aus der Ansicht verschwindet
    setChecking(true);
    timer.current = window.setTimeout(() => {
      setChecking(false);
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
    }, 350);
  }

  // ------------------------------------------------------------ Wischgesten (Touch)
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(
    null,
  );
  const swiped = useRef(false);
  const offsetRef = useRef(0); // aktueller Wert unabhängig vom Rendern (Ereignisse können schneller kommen)
  const moveTo = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  function onPointerDown(e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' || !editable) return;
    drag.current = { x: e.clientX, y: e.clientY, base: offsetRef.current, horizontal: null };
  }
  function onPointerMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!d.horizontal) {
        drag.current = null; // senkrecht = normales Scrollen
        return;
      }
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* kein aktiver Zeiger (z. B. Testumgebung) – Wischen funktioniert trotzdem */
      }
    }
    moveTo(Math.max(-ACTIONS_WIDTH, Math.min(130, d.base + dx)));
  }
  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d?.horizontal) return;
    setDragging(false);
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 50);
    const current = offsetRef.current;
    if (current >= COMPLETE_DISTANCE && !done) {
      moveTo(0);
      toggle();
    } else if (current <= -ACTIONS_WIDTH / 2) moveTo(-ACTIONS_WIDTH);
    else moveTo(0);
  }

  function postpone() {
    moveTo(0);
    const before = { due_at: task.due_at, due_all_day: task.due_all_day };
    const tomorrow = addDays(new Date(), 1);
    const due = task.due_at ? new Date(task.due_at) : null;
    const next = due
      ? new Date(
          tomorrow.getFullYear(),
          tomorrow.getMonth(),
          tomorrow.getDate(),
          due.getHours(),
          due.getMinutes(),
        )
      : new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    update.mutate({
      id: task.id,
      patch: { due_at: next.toISOString(), due_all_day: due ? task.due_all_day : true },
    });
    snackbar({
      text: `«${task.title}» auf morgen verschoben`,
      onAction: () => update.mutate({ id: task.id, patch: before }),
    });
  }

  function remove() {
    moveTo(0);
    trash.mutate({ id: task.id, trashed: true });
    snackbar({
      text: 'In den Papierkorb verschoben',
      onAction: () => trash.mutate({ id: task.id, trashed: false }),
    });
  }

  const selected = selectedId === task.id;

  return (
    <li
      data-task-id={task.id}
      className={`relative overflow-hidden rounded-2xl shadow-sm ${selected ? 'ring-2 ring-indigo-500' : ''}`}
    >
      {editable && (
        <>
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 flex w-32 items-center bg-emerald-500 pl-5 font-semibold text-white"
          >
            ✓ Erledigt
          </div>
          <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
            <button
              tabIndex={offset < 0 ? 0 : -1}
              onClick={postpone}
              className="flex-1 bg-amber-500 text-sm font-semibold text-white"
            >
              Morgen
            </button>
            <button
              tabIndex={offset < 0 ? 0 : -1}
              onClick={remove}
              aria-label="Pendenz löschen"
              className="flex-1 bg-red-600 text-sm font-semibold text-white"
            >
              🗑️
            </button>
          </div>
        </>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => swiped.current && (e.preventDefault(), e.stopPropagation())}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 200ms ease',
          touchAction: 'pan-y',
        }}
        className="relative flex items-start gap-3 bg-white px-3 py-3 dark:bg-slate-800"
      >
        <button
          role="checkbox"
          aria-checked={checked}
          aria-label={`${task.title} als erledigt markieren`}
          onClick={toggle}
          disabled={!editable}
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
        <button
          onClick={() => (offsetRef.current < 0 ? moveTo(0) : openTask(task.id))}
          className="min-w-0 flex-1 text-left"
        >
          <span
            className={`flex items-center gap-2 transition-all duration-300 ${checked ? 'text-slate-500 dark:text-slate-400 line-through' : ''}`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_COLOR[task.priority]}`}
              title={`Priorität ${task.priority}`}
            />
            <span className="truncate font-medium">{task.title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400">
            {task.due_at && (
              <span className={overdue ? 'font-medium text-red-800 dark:text-red-300' : ''}>
                {formatDue(new Date(task.due_at), task.due_all_day, now)}
              </span>
            )}
            {isRecurring(task) && (
              <span title={describeRepeat(task)}>🔁 {describeRepeat(task)}</span>
            )}
            {task.subtasks.length > 0 && (
              <span>
                ☑ {subtasksDone}/{task.subtasks.length}
              </span>
            )}
            {task.status === 'in_progress' && <span>In Arbeit</span>}
            {task.status === 'waiting' && <span>Wartend</span>}
            {task.assignee_id && perms.isShared(task.list_id) && (
              <span>
                👤{' '}
                {task.assignee_id === perms.userId
                  ? 'ich'
                  : perms.nameOf(task.list_id, task.assignee_id)}
              </span>
            )}
            {task.tags.map((t) => (
              <span key={t.id} className="text-indigo-700 dark:text-indigo-300">
                #{t.name}
              </span>
            ))}
            {showList && list && (
              <span>
                {list.emoji} {list.name}
              </span>
            )}
          </span>
        </button>
        {editable && !done && (
          <button
            onClick={toggleFocus}
            aria-pressed={focused}
            aria-label={
              focused
                ? `${task.title} aus dem Tagesfokus entfernen`
                : `${task.title} in den Tagesfokus setzen`
            }
            className={`h-8 w-8 shrink-0 rounded-full text-lg ${focused ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
          >
            {focused ? '★' : '☆'}
          </button>
        )}
      </div>
    </li>
  );
}
