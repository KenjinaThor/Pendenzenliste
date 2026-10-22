import { useEffect, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { Sheet } from '../../components/Sheet';
import { toDateInput } from '../../lib/dates';
import { useEditor } from '../tasks/EditorContext';
import { useSelection } from '../tasks/SelectionContext';

export const SHOW_SHORTCUTS_EVENT = 'show-shortcuts';

const SHORTCUTS: [string, string][] = [
  ['N', 'Neue Pendenz'],
  ['/', 'Suche öffnen'],
  ['J / K', 'Nächste / vorherige Pendenz auswählen'],
  ['E', 'Ausgewählte Pendenz erledigen'],
  ['Enter', 'Ausgewählte Pendenz öffnen'],
  ['Esc', 'Auswahl aufheben / Fenster schliessen'],
  ['?', 'Diese Übersicht'],
];

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);

const taskElements = () => [...document.querySelectorAll<HTMLElement>('[data-task-id]')];

/** Tastenkürzel am PC (wirken nicht beim Tippen in Feldern oder bei geöffnetem Fenster). */
export function Shortcuts() {
  const navigate = useNavigate();
  const { newTask, openTask } = useEditor();
  const { selectedId, setSelectedId } = useSelection();
  const listMatch = useMatch('/liste/:id');
  const viewMatch = useMatch('/:view');
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const show = () => setHelp(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;

      const ids = taskElements().map((el) => el.dataset.taskId!);
      const index = selectedId ? ids.indexOf(selectedId) : -1;
      const select = (id: string | undefined) => {
        if (!id) return;
        setSelectedId(id);
        document.querySelector(`[data-task-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
      };

      switch (e.key) {
        case 'n':
          e.preventDefault();
          newTask({
            list_id: listMatch?.params.id,
            date: viewMatch?.params.view === 'heute' ? toDateInput(new Date()) : undefined,
          });
          break;
        case '/':
          e.preventDefault();
          navigate('/suche');
          break;
        case '?':
          setHelp(true);
          break;
        case 'j':
          select(ids[Math.min(index + 1, ids.length - 1)]);
          break;
        case 'k':
          select(ids[Math.max(index - 1, 0)]);
          break;
        case 'e':
          if (index >= 0) {
            const next = ids[index + 1] ?? ids[index - 1] ?? null;
            document
              .querySelector<HTMLElement>(`[data-task-id="${selectedId}"] [role="checkbox"]`)
              ?.click();
            setSelectedId(next);
          }
          break;
        case 'Enter':
          if (index >= 0) {
            e.preventDefault();
            openTask(ids[index]);
          }
          break;
        case 'Escape':
          setSelectedId(null);
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, setSelectedId, newTask, openTask, navigate, listMatch, viewMatch]);

  if (!help) return null;
  return (
    <Sheet title="Tastenkürzel" onClose={() => setHelp(false)}>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 pt-2">
        {SHORTCUTS.map(([key, text]) => (
          <div key={key} className="contents">
            <dt>
              <kbd className="rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 font-mono text-sm dark:border-slate-600 dark:bg-slate-700">
                {key}
              </kbd>
            </dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
        Auf dem iPhone: Zeile nach rechts wischen = erledigt, nach links wischen = auf morgen
        verschieben oder löschen.
      </p>
    </Sheet>
  );
}
