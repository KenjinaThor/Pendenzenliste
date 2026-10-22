import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useLists, useTasks } from '../../lib/api';
import { compareTasks, isDone } from '../../lib/views';
import { ShareSheet } from '../sharing/ShareSheet';
import { usePermissions } from '../sharing/usePermissions';
import { QuickAdd } from '../tasks/QuickAdd';
import { useEditor } from '../tasks/EditorContext';
import { TaskSections } from '../tasks/TaskSections';

export function ListPage() {
  const { id } = useParams();
  const { data: lists = [], isLoading: listsLoading } = useLists();
  const { data: tasks = [] } = useTasks();
  const { openList } = useEditor();
  const perms = usePermissions();
  const [sharing, setSharing] = useState(false);
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
      {perms.canEdit(list.id) ? (
        <QuickAdd listId={list.id} />
      ) : (
        <p className="px-4 pb-3 text-sm text-slate-500">Du hast in dieser Liste nur Leserechte.</p>
      )}
      <TaskSections sections={sections} emptyText="Diese Liste ist leer." showList={false} />
      {sharing && <ShareSheet listId={list.id} onClose={() => setSharing(false)} />}
    </div>
  );
}
