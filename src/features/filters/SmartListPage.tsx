import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useDeleteFilter, useSavedFilters, useSaveFilter, useTasks } from '../../lib/api';
import { applyFilter, normalizeFilter, type TaskFilter } from '../../lib/filters';
import { useAuth } from '../auth/AuthProvider';
import { TaskSections } from '../tasks/TaskSections';
import { FilterBar } from './FilterBar';
import { useFilterOptions } from './useFilterContext';

/** Intelligente Liste: ein gespeicherter Filter über alle Listen (nur offene Pendenzen). */
/** Neuer Entwurf pro Liste: der Schlüssel setzt die Bearbeitung beim Wechsel zurück. */
export function SmartListPage() {
  const { id } = useParams();
  return <SmartList key={id} id={id} />;
}

function SmartList({ id }: { id: string | undefined }) {
  const { data: saved = [], isLoading } = useSavedFilters();
  const { data: tasks = [] } = useTasks();
  const { session } = useAuth();
  const options = useFilterOptions();
  const save = useSaveFilter();
  const del = useDeleteFilter();
  const navigate = useNavigate();
  const current = saved.find((s) => s.id === id);
  const [draft, setDraft] = useState<TaskFilter | null>(null);

  if (isLoading) return <p className="px-4 py-12 text-center text-slate-500">Lade …</p>;
  if (!current) return <Navigate to="/alle" replace />;

  const stored = normalizeFilter(current.filter as Partial<TaskFilter>);
  const filter = draft ?? stored;
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(stored);
  const open = tasks.filter((t) => t.status !== 'done');
  const results = applyFilter(open, filter, session?.user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`🔎 ${current.name}`}
        subtitle="Intelligente Liste"
        action={
          <button
            onClick={() =>
              window.confirm(`Intelligente Liste «${current.name}» löschen?`) &&
              del.mutateAsync(current.id).then(() => navigate('/alle'))
            }
            className="h-10 rounded-full bg-slate-200 px-3 text-sm dark:bg-slate-700"
            aria-label="Intelligente Liste löschen"
          >
            🗑️
          </button>
        }
      />
      <FilterBar
        value={filter}
        onChange={setDraft}
        tags={options.tags}
        people={options.people}
        lists={options.lists}
        defaultOpen
      />
      {changed && (
        <div className="px-4 pb-3">
          <button
            onClick={() =>
              save
                .mutateAsync({ id: current.id, name: current.name, filter })
                .then(() => setDraft(null))
            }
            className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white"
          >
            Änderungen speichern
          </button>
        </div>
      )}
      <TaskSections
        sections={results.length ? [{ key: 'r', title: 'Treffer', tasks: results }] : []}
        emptyText="Keine Pendenzen entsprechen diesem Filter."
      />
    </div>
  );
}
