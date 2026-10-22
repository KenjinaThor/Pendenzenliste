import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useLists, useTasks } from '../../lib/api';
import { compareTasks, isDone } from '../../lib/views';
import { QuickAdd } from '../tasks/QuickAdd';
import { useEditor } from '../tasks/EditorContext';
import { TaskSections } from '../tasks/TaskSections';

export function ListPage() {
  const { id } = useParams();
  const { data: lists = [], isLoading: listsLoading } = useLists();
  const { data: tasks = [] } = useTasks();
  const { openList } = useEditor();
  const list = lists.find((l) => l.id === id);

  if (listsLoading) return <p className="px-4 py-12 text-center text-slate-500">Lade …</p>;
  if (!list) return <Navigate to="/heute" replace />;

  const own = tasks.filter((t) => t.list_id === list.id);
  const sections = [
    { key: 'open', title: 'Offen', tasks: own.filter((t) => !isDone(t)).sort(compareTasks) },
    { key: 'done', title: 'Erledigt', tasks: own.filter(isDone).sort(compareTasks) },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={
          <span>
            <span style={{ color: list.color }}>●</span> {list.emoji} {list.name}
          </span>
        }
        action={
          <button
            onClick={() => openList(list.id)}
            aria-label="Liste bearbeiten"
            className="h-10 w-10 rounded-full bg-slate-200 text-lg dark:bg-slate-700"
          >
            ⋯
          </button>
        }
      />
      <QuickAdd listId={list.id} />
      <TaskSections sections={sections} emptyText="Diese Liste ist leer." showList={false} />
    </div>
  );
}
