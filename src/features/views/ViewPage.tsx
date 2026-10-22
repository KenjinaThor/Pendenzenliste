import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useSaveFilter, useTasks } from '../../lib/api';
import { EMPTY_FILTER, applyFilter, type TaskFilter } from '../../lib/filters';
import { toDateInput } from '../../lib/dates';
import {
  MAX_FOCUS,
  buildSections,
  focusTasks,
  VIEWS,
  type Section,
  type ViewKey,
} from '../../lib/views';
import { useAuth } from '../auth/AuthProvider';
import { FilterBar } from '../filters/FilterBar';
import { useFilterOptions } from '../filters/useFilterContext';
import { QuickAdd } from '../tasks/QuickAdd';
import { TaskSections } from '../tasks/TaskSections';

const EMPTY: Record<ViewKey, string> = {
  heute: 'Nichts fällig heute. Geniesse den Tag! 🎉',
  demnaechst: 'In den nächsten 7 Tagen ist nichts fällig.',
  ueberfaellig: 'Nichts überfällig. Super!',
  alle: 'Noch keine offenen Pendenzen.',
  zugewiesen: 'Dir ist nichts zugewiesen.',
  erledigt: 'Noch nichts erledigt.',
};

/** «Heute»: oben der Tagesfokus (Meine 3), darunter Überfälliges und heute Fälliges ohne Doppelungen. */
function heuteSections(
  tasks: Parameters<typeof buildSections>[1],
  userId: string | undefined,
): Section[] {
  const now = new Date();
  const focus = focusTasks(tasks, toDateInput(now));
  const ids = new Set(focus.map((t) => t.id));
  const rest = buildSections(
    'heute',
    tasks.filter((t) => !ids.has(t.id)),
    now,
    userId,
  );
  return focus.length
    ? [
        {
          key: 'focus',
          title: `⭐ Meine ${MAX_FOCUS} für heute (${focus.length}/${MAX_FOCUS})`,
          tasks: focus,
        },
        ...rest,
      ]
    : rest;
}

export function ViewPage({ view }: { view: ViewKey }) {
  const { data: tasks = [], isLoading, error } = useTasks();
  const { session } = useAuth();
  const meta = VIEWS.find((v) => v.key === view)!;
  const options = useFilterOptions();
  const saveFilter = useSaveFilter();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  // «Alle» lässt sich filtern und sortieren; die übrigen Ansichten sind fest definiert
  const sections =
    view === 'alle'
      ? [
          {
            key: 'all',
            title: 'Alle offenen Pendenzen',
            tasks: applyFilter(
              tasks.filter((t) => t.status !== 'done'),
              filter,
              session?.user.id,
            ),
          },
        ].filter((s) => s.tasks.length > 0)
      : view === 'heute'
        ? heuteSections(tasks, session?.user.id)
        : buildSections(view, tasks, new Date(), session?.user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`${meta.icon} ${meta.label}`} />
      {(view === 'heute' || view === 'alle') && <QuickAdd today={view === 'heute'} />}
      {view === 'alle' && (
        <FilterBar
          value={filter}
          onChange={setFilter}
          tags={options.tags}
          people={options.people}
          lists={options.lists}
          onSave={(name) =>
            saveFilter.mutateAsync({ name, filter }).then((s) => navigate(`/filter/${s.id}`))
          }
        />
      )}
      {error ? (
        <p role="alert" className="mx-4 rounded-lg bg-red-100 p-3 text-sm text-red-800">
          {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="px-4 py-12 text-center text-slate-500">Lade …</p>
      ) : (
        <TaskSections sections={sections} emptyText={EMPTY[view]} />
      )}
    </div>
  );
}
