import { useMemo, useState, type FormEvent } from 'react';
import { useCreateTask, useLists, useSetTaskTags } from '../../lib/api';
import { buildDue, toDateInput } from '../../lib/dates';
import { parseQuickInput } from '../../lib/quickParse';
import { ScanDialog } from './ScanDialog';
import { useCalendarDefault } from '../settings/useCalendarDefault';
import { usePermissions } from '../sharing/usePermissions';

/**
 * Schnelles Erfassen in natürlicher Sprache, z. B.
 * «Steuererklärung morgen 14 Uhr #Privat !hoch @Anna +wichtig jeden Montag».
 * Unter dem Feld steht, was erkannt wurde. Optional mit Datum «heute» und fester Liste.
 */
export function QuickAdd({ listId, today = false }: { listId?: string; today?: boolean }) {
  const { data: lists = [] } = useLists();
  const create = useCreateTask();
  const setTags = useSetTaskTags();
  const perms = usePermissions();
  const writable = lists.filter((l) => perms.canEdit(l.id));
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const calendarDefault = useCalendarDefault();
  const [chosenInCalendar, setInCalendar] = useState<boolean | null>(null);
  const inCalendar = chosenInCalendar ?? calendarDefault;

  const people = useMemo(
    () => [
      ...new Map(
        perms.members
          .filter((m) => m.profiles)
          .map((m) => [m.user_id, { user_id: m.user_id, name: m.profiles!.name }]),
      ).values(),
    ],
    [perms.members],
  );

  function defaultList(): string | undefined {
    if (listId) return perms.canEdit(listId) ? listId : undefined;
    let last: string | null = null;
    try {
      last = localStorage.getItem('lastListId');
    } catch {
      /* ignorieren */
    }
    return writable.find((l) => l.id === last)?.id ?? writable[0]?.id;
  }

  const parsed = useMemo(
    () =>
      parseQuickInput(text, {
        now: new Date(),
        lists: writable,
        members: people,
        userId: perms.userId,
      }),
    // writable/people ändern sich nur mit den Listen und Mitgliedern
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, lists, people, perms.userId, perms.members],
  );
  const disabled = !defaultList();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const list = parsed.listId ?? defaultList();
    if (!parsed.title || !list) return;
    setText('');
    setInCalendar(null); // nächste Pendenz wieder mit dem Standard aus den Einstellungen
    const date = parsed.date ?? (today ? toDateInput(new Date()) : null);
    const due = date ? buildDue(date, parsed.time ?? '') : null;
    // Zuweisung nur, wenn die Person Mitglied der Liste ist
    const assignee =
      parsed.assigneeId &&
      perms.membersOf(list).some((m) => m.user_id === parsed.assigneeId && m.role !== 'viewer')
        ? parsed.assigneeId
        : null;
    const id = create({
      list_id: list,
      title: parsed.title,
      ...(due ?? {}),
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(assignee ? { assignee_id: assignee } : {}),
      ...(parsed.repeat ?? {}),
      in_calendar: inCalendar,
    });
    if (parsed.tags.length) setTags.mutate({ taskId: id, listId: list, names: parsed.tags });
  }

  return (
    <>
      <form onSubmit={onSubmit} className="px-4 pb-3">
        <div className="flex gap-2">
          <input
            aria-label="Pendenz schnell erfassen"
            disabled={disabled}
            placeholder={
              disabled ? 'Lade …' : today ? 'Neue Pendenz für heute …' : 'Neue Pendenz …'
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="done"
            className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm placeholder:text-slate-500"
          />
          <button
            type="button"
            aria-label="Dokument scannen"
            title="Dokument scannen"
            disabled={disabled}
            onClick={() => setScanning(true)}
            className="h-12 w-12 shrink-0 rounded-xl border border-slate-200 bg-white text-xl shadow-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
          >
            📷
          </button>
        </div>
        {text.trim() && (
          <label className="mt-2 flex items-center gap-2 text-xs font-medium">
            <input
              type="checkbox"
              checked={inCalendar}
              onChange={(e) => setInCalendar(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
            📆 Im Kalender anzeigen
          </label>
        )}
        {text.trim() && parsed.chips.length > 0 && (
          <ul aria-label="Erkannt" className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {parsed.chips.map((c, i) => (
              <li
                key={`${c.kind}-${i}`}
                className="rounded-full bg-indigo-100 px-2.5 py-1 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
              >
                {c.label}
              </li>
            ))}
          </ul>
        )}
        {text.trim() && !parsed.title && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Es fehlt noch ein Titel.
          </p>
        )}
      </form>
      {scanning && defaultList() && (
        <ScanDialog listId={defaultList()!} onClose={() => setScanning(false)} />
      )}
    </>
  );
}
