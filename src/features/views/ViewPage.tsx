import { PageHeader } from '../../components/PageHeader';
import { useTasks } from '../../lib/api';
import { buildSections, VIEWS, type ViewKey } from '../../lib/views';
import { useAuth } from '../auth/AuthProvider';
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

export function ViewPage({ view }: { view: ViewKey }) {
  const { data: tasks = [], isLoading, error } = useTasks();
  const { session } = useAuth();
  const meta = VIEWS.find((v) => v.key === view)!;
  const sections = buildSections(view, tasks, new Date(), session?.user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`${meta.icon} ${meta.label}`} />
      {(view === 'heute' || view === 'alle') && <QuickAdd today={view === 'heute'} />}
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
