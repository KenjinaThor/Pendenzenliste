import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTasks } from '../../lib/api';
import { useEditor } from './EditorContext';

/** Rück-Link aus dem Kalender (#/pendenz/<id>): öffnet die Pendenz, sobald die Daten geladen sind. */
export function TaskDeepLink() {
  const { id } = useParams();
  const { data: tasks, isSuccess, isError } = useTasks();
  const { openTask } = useEditor();
  const navigate = useNavigate();
  const found = isSuccess && tasks.some((t) => t.id === id);

  useEffect(() => {
    if (found && id) {
      openTask(id);
      navigate('/heute', { replace: true });
    }
  }, [found, id, openTask, navigate]);

  if (isError || (isSuccess && !found)) return <Navigate to="/heute" replace />;
  return <p className="px-4 py-12 text-center text-slate-500">Lade …</p>;
}
