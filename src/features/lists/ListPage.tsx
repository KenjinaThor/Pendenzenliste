import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useLists, useSaveFilter, useTasks } from '../../lib/api';
import { EMPTY_FILTER, applyFilter, type TaskFilter } from '../../lib/filters';
import { isDone } from '../../lib/views';
import { useAuth } from '../auth/AuthProvider';
import { FilterBar } from '../filters/FilterBar';
import { useFilterOptions } from '../filters/useFilterContext';
import { KanbanBoard } from '../kanban/KanbanBoard';
import { ShareSheet } from '../sharing/ShareSheet';
import { usePermissions } from '../sharing/usePermissions';
import { useEditor } from '../tasks/EditorContext';
import { QuickAdd } from '../tasks/QuickAdd';
import { TaskSections } from '../tasks/TaskSections';

type Mode = 'list' | 'kanban';

const readMode = (listId: string): Mode => {
  try {
    return localStorage.getItem(`listView:${listId}`) === 'kanban' ? 'kanban' : 'list';
  } catch {
    return 'list';
  }
};

export function ListPage() {
  const { id } = useParams();
  const { data: lists = [], isPending: listsLoading } = useLists();
  const { data: tasks = [] } = useTasks();
  const { session } = useAuth();
  const { openList } = useEditor();
  const perms = usePermissions();
  const options = useFilterOptions();
  const saveFilter = useSaveFilter();
  const navigate = useNavigate();
  const [sharing, setSharing] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>(EMPTY_FILTER);
  const [modeState, setModeState] = useState<{ id: string; mode: Mode } | null>(null);
  const list = lists.find((l) => l.id === id);

  if (listsLoading)
    return <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">Lade …</p>;
  if (!list) return <Navigate to="/heute" replace />;

  const mode = modeState?.id === list.id ? modeState.mode : readMode(list.id);
  const setMode = (m: Mode) => {
    setModeState({ id: list.id, mode: m });
    try {
      localStorage.setItem(`listView:${list.id}`, m);
    } catch {
      /* ignorieren */
    }
  };

  const own = applyFilter(
    tasks.filter((t) => t.list_id === list.id),
    filter,
    session?.user.id,
  );
  const sections = [
    { key: 'open', title: 'Offen', tasks: own.filter((t) => !isDone(t)) },
    { key: 'done', title: 'Erledigt', tasks: own.filter(isDone) },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="mx-auto max-w-2xl md:max-w-none md:px-4">
      <PageHeader
        title={
          <span>
            <span style={{ color: list.color }}>●</span> {list.emoji} {list.name}
          </span>
        }
        action={
          <span className="flex gap-2">
            <button
              onClick={() => setSharing(true)}
              aria-label="Teilen und Mitglieder"
              className="h-10 rounded-full bg-slate-200 px-3 text-sm font-medium dark:bg-slate-700"
            >
              👥 {perms.membersOf(list.id).length > 1 ? perms.membersOf(list.id).length : 'Teilen'}
            </button>
            {perms.isOwner(list.id) && (
              <button
                onClick={() => openList(list.id)}
                aria-label="Liste bearbeiten"
                className="h-10 w-10 rounded-full bg-slate-200 text-lg dark:bg-slate-700"
              >
                ⋯
              </button>
            )}
          </span>
        }
      />
      <div
        className="mx-4 mb-3 inline-flex rounded-xl bg-slate-200 p-1 text-sm font-medium dark:bg-slate-700"
        role="group"
        aria-label="Ansicht"
      >
        {(['list', 'kanban'] as Mode[]).map((m) => (
          <button
            key={m}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-white shadow-sm dark:bg-slate-900' : ''}`}
          >
            {m === 'list' ? '☰ Liste' : '▦ Kanban'}
          </button>
        ))}
      </div>
      {perms.canEdit(list.id) ? (
        <QuickAdd listId={list.id} />
      ) : (
        <p className="px-4 pb-3 text-sm text-slate-600 dark:text-slate-400">
          Du hast in dieser Liste nur Leserechte.
        </p>
      )}
      <FilterBar
        value={filter}
        onChange={setFilter}
        tags={options.tags}
        people={options.people}
        onSave={(name) =>
          saveFilter
            .mutateAsync({ name, filter: { ...filter, listIds: [list.id] } })
            .then((s) => navigate(`/filter/${s.id}`))
        }
      />
      {mode === 'kanban' ? (
        <KanbanBoard tasks={own} />
      ) : (
        <TaskSections sections={sections} emptyText="Diese Liste ist leer." showList={false} />
      )}
      {sharing && <ShareSheet listId={list.id} onClose={() => setSharing(false)} />}
    </div>
  );
}
