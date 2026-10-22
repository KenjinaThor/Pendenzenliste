import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useMyProfile, useTasks, useUpdateProfile, useUpdateTask } from '../../lib/api';
import { addDays, startOfDay, toDateInput, formatTime } from '../../lib/dates';
import { monthGrid, moveDueToDay, tasksByDay, weekDays } from '../../lib/calendarGrid';
import { CANTONS, holidaysFor } from '../../lib/holidays';
import type { Task } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';
import { usePermissions } from '../sharing/usePermissions';
import { useEditor } from '../tasks/EditorContext';

type Mode = 'month' | 'week';
const WEEKDAY_HEAD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const readHolidayPref = () => {
  try {
    return localStorage.getItem('showHolidays') !== '0';
  } catch {
    return true;
  }
};

/** Monats- und Wochenansicht; Pendenzen lassen sich auf einen anderen Tag ziehen. */
export function CalendarViewPage() {
  const { data: tasks = [] } = useTasks();
  const { session } = useAuth();
  const { data: profile } = useMyProfile(session?.user.id);
  const updateProfile = useUpdateProfile(session?.user.id);
  const update = useUpdateTask();
  const perms = usePermissions();
  const { openTask, newTask } = useEditor();

  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [showHolidays, setShowHolidays] = useState(readHolidayPref);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const today = startOfDay(new Date());
  const days =
    mode === 'month' ? monthGrid(anchor.getFullYear(), anchor.getMonth()) : weekDays(anchor);
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const canton = profile?.canton ?? 'SG';
  const holidays = useMemo(() => {
    const years = new Set(days.map((d) => d.getFullYear()));
    return new Map([...years].flatMap((y) => [...holidaysFor(y, canton)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, mode, canton]);

  const title =
    mode === 'month'
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : `${days[0].getDate()}.${days[0].getMonth() + 1}. – ${days[6].getDate()}.${days[6].getMonth() + 1}.${days[6].getFullYear()}`;

  const step = (dir: -1 | 1) =>
    setAnchor((a) =>
      mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + dir, 1) : addDays(a, 7 * dir),
    );

  function drop(key: string, day: Date, e: React.DragEvent) {
    e.preventDefault();
    setDragOver(null);
    const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/task-id'));
    if (!task || !perms.canEdit(task.list_id) || toDateInput(new Date(task.due_at ?? day)) === key)
      return;
    update.mutate({ id: task.id, patch: moveDueToDay(task, day) });
  }

  const chip = (t: Task) => (
    <li key={t.id}>
      <button
        draggable={perms.canEdit(t.list_id)}
        onDragStart={(e) => e.dataTransfer.setData('text/task-id', t.id)}
        onClick={(e) => {
          e.stopPropagation();
          openTask(t.id);
        }}
        title={t.title}
        className={`w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs ${t.priority === 'high' ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100' : 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100'}`}
      >
        {!t.due_all_day && t.due_at && (
          <span className="font-semibold">{formatTime(new Date(t.due_at))} </span>
        )}
        {t.title}
      </button>
    </li>
  );

  const selectedTasks = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="📅 Kalender" />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        <button
          onClick={() => step(-1)}
          aria-label="Zurück"
          className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700"
        >
          ◀
        </button>
        <h2 aria-live="polite" className="min-w-40 text-center text-lg font-semibold">
          {title}
        </h2>
        <button
          onClick={() => step(1)}
          aria-label="Weiter"
          className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700"
        >
          ▶
        </button>
        <button
          onClick={() => setAnchor(today)}
          className="h-10 rounded-xl bg-slate-200 px-3 text-sm font-medium dark:bg-slate-700"
        >
          Heute
        </button>
        <div
          className="ml-auto inline-flex rounded-xl bg-slate-200 p-1 text-sm font-medium dark:bg-slate-700"
          role="group"
          aria-label="Darstellung"
        >
          {(['month', 'week'] as Mode[]).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-white shadow-sm dark:bg-slate-900' : ''}`}
            >
              {m === 'month' ? 'Monat' : 'Woche'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showHolidays}
            onChange={(e) => {
              setShowHolidays(e.target.checked);
              try {
                localStorage.setItem('showHolidays', e.target.checked ? '1' : '0');
              } catch {
                /* ignorieren */
              }
            }}
          />
          Feiertage anzeigen
        </label>
        {showHolidays && (
          <select
            aria-label="Kanton für Feiertage"
            value={canton}
            disabled={!profile}
            onChange={(e) => updateProfile.mutate({ canton: e.target.value })}
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-slate-900"
          >
            {Object.entries(CANTONS).map(([code, name]) => (
              <option key={code} value={code}>
                {code === 'CH' ? name : `${name} (${code})`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="px-2 md:px-4">
        {mode === 'month' && (
          <div
            className="grid grid-cols-7 text-center text-xs font-semibold text-slate-600 dark:text-slate-400"
            aria-hidden
          >
            {WEEKDAY_HEAD.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
        )}
        <div
          className={
            mode === 'month'
              ? 'grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-700'
              : 'grid grid-cols-1 gap-2 md:grid-cols-7'
          }
        >
          {days.map((day) => {
            const key = toDateInput(day);
            const list = byDay.get(key) ?? [];
            const holiday = showHolidays ? holidays.get(key) : undefined;
            const isToday = key === toDateInput(today);
            const outside = mode === 'month' && day.getMonth() !== anchor.getMonth();
            const limit = mode === 'month' ? 3 : 99;
            return (
              <div
                key={key}
                role="group"
                aria-label={`${day.getDate()}. ${MONTHS[day.getMonth()]}${holiday ? `, ${holiday}` : ''}, ${list.length} Pendenzen`}
                onClick={() => setSelected(key)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(key);
                }}
                onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                onDrop={(e) => drop(key, day, e)}
                className={`flex min-h-24 cursor-pointer flex-col gap-1 p-1.5 ${mode === 'month' ? (outside ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-800') : 'rounded-xl bg-white shadow-sm dark:bg-slate-800'}  ${selected === key ? 'outline-2 -outline-offset-2 outline-indigo-500' : ''} ${dragOver === key ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <button
                    type="button"
                    aria-pressed={selected === key}
                    aria-label={`${mode === 'week' ? `${WEEKDAY_HEAD[(day.getDay() + 6) % 7]} ` : ''}${day.getDate()}. ${MONTHS[day.getMonth()]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(key);
                    }}
                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${isToday ? 'bg-indigo-600 text-white' : outside ? 'text-slate-600 dark:text-slate-400' : ''}`}
                  >
                    {mode === 'week'
                      ? `${WEEKDAY_HEAD[(day.getDay() + 6) % 7]} ${day.getDate()}.`
                      : day.getDate()}
                  </button>
                  {holiday && (
                    <span
                      className="truncate text-[10px] font-medium text-red-600 dark:text-red-300"
                      title={holiday}
                    >
                      {holiday}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {list.slice(0, limit).map(chip)}
                  {list.length > limit && (
                    <li className="text-[11px] text-slate-600 dark:text-slate-400">
                      +{list.length - limit} weitere
                    </li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <section
          aria-label="Ausgewählter Tag"
          className="mx-4 mt-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800"
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">
              {selected.split('-').reverse().join('.')}
              {showHolidays && holidays.get(selected) ? ` · ${holidays.get(selected)}` : ''}
            </h3>
            <button
              onClick={() => newTask({ date: selected })}
              className="h-9 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white"
            >
              ＋ Pendenz
            </button>
          </div>
          {selectedTasks.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">Nichts fällig.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {selectedTasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => openTask(t.id)}
                    className="w-full rounded-lg px-2 py-1.5 text-left active:bg-slate-100 dark:active:bg-slate-700"
                  >
                    {!t.due_all_day && t.due_at && (
                      <span className="mr-2 text-slate-600 dark:text-slate-400">
                        {formatTime(new Date(t.due_at))}
                      </span>
                    )}
                    {t.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
