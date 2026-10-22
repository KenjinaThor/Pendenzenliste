import { useState } from 'react';
import {
  EMPTY_FILTER,
  SORT_LABEL,
  activeFilterCount,
  isDefaultFilter,
  type SortKey,
  type TaskFilter,
} from '../../lib/filters';
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status } from '../../lib/types';

const field = 'h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900';

interface Props {
  value: TaskFilter;
  onChange: (f: TaskFilter) => void;
  tags: string[];
  people: { id: string; name: string }[];
  /** Listen zur Auswahl (nur auf Seiten über mehrere Listen) */
  lists?: { id: string; name: string; emoji: string }[];
  /** «Als Intelligente Liste speichern» anbieten */
  onSave?: (name: string) => void;
  /** Panel standardmässig offen */
  defaultOpen?: boolean;
}

export function FilterBar({
  value,
  onChange,
  tags,
  people,
  lists,
  onSave,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState('');
  const count = activeFilterCount(value);
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-10 items-center gap-2 rounded-xl bg-slate-200 px-3 text-sm font-medium dark:bg-slate-700"
        >
          ⚙️ Filter &amp; Sortierung
          {count > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 text-xs text-white">{count}</span>
          )}
        </button>
        {!isDefaultFilter(value) && (
          <button
            onClick={() => onChange(EMPTY_FILTER)}
            className="text-sm text-slate-600 dark:text-slate-400 underline"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Sortieren nach
            <select
              value={value.sort}
              onChange={(e) => onChange({ ...value, sort: e.target.value as SortKey })}
              className={field}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>

          <div role="group" aria-label="Priorität">
            <p className="mb-1 text-sm font-medium">Priorität</p>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <button
                  key={p}
                  aria-pressed={value.priorities.includes(p)}
                  onClick={() => onChange({ ...value, priorities: toggle(value.priorities, p) })}
                  className={`h-9 flex-1 rounded-lg text-sm font-medium ${value.priorities.includes(p) ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Status
            <select
              value={value.statuses[0] ?? ''}
              onChange={(e) =>
                onChange({ ...value, statuses: e.target.value ? [e.target.value as Status] : [] })
              }
              className={field}
            >
              <option value="">Alle</option>
              {(['open', 'in_progress', 'waiting'] as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          {people.length > 0 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Person
              <select
                value={value.assignee}
                onChange={(e) => onChange({ ...value, assignee: e.target.value })}
                className={field}
              >
                <option value="any">Alle</option>
                <option value="me">Mir zugewiesen</option>
                <option value="none">Niemandem zugewiesen</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tags.length > 0 && (
            <div role="group" aria-label="Tags">
              <p className="mb-1 text-sm font-medium">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t}
                    aria-pressed={value.tags.includes(t)}
                    onClick={() => onChange({ ...value, tags: toggle(value.tags, t) })}
                    className={`rounded-full px-3 py-1 text-sm ${value.tags.includes(t) ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {lists && lists.length > 1 && (
            <div role="group" aria-label="Listen">
              <p className="mb-1 text-sm font-medium">Listen</p>
              <div className="flex flex-wrap gap-1.5">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    aria-pressed={value.listIds.includes(l.id)}
                    onClick={() => onChange({ ...value, listIds: toggle(value.listIds, l.id) })}
                    className={`rounded-full px-3 py-1 text-sm ${value.listIds.includes(l.id) ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                  >
                    {l.emoji} {l.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {onSave && (
            <form
              className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-700"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) {
                  onSave(name.trim());
                  setName('');
                }
              }}
            >
              <input
                aria-label="Name der Intelligenten Liste"
                placeholder="Als Intelligente Liste speichern …"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${field} min-w-0 flex-1`}
              />
              <button
                disabled={!name.trim()}
                className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                Speichern
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
