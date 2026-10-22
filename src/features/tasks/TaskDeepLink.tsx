import { onlineManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTasks } from '../../lib/api';
import type { Task } from '../../lib/types';
import { useEditor } from './EditorContext';

/**
 * Rück-Link aus dem Kalender oder einer Push-Nachricht (#/pendenz/<id>): öffnet die Pendenz. Zuerst werden die Daten
 * frisch geladen (der lokale Zwischenspeicher kann veraltet sein); ohne Verbindung gilt der Zwischenspeicher.
 */
export function TaskDeepLink() {
  const { id } = useParams();
  const { data: cached, refetch } = useTasks();
  const { openTask } = useEditor();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const cachedRef = useRef(cached);
  useEffect(() => {
    cachedRef.current = cached;
  }, [cached]);

  useEffect(() => {
    let alive = true;
    const settle = (list: Task[] | undefined) => alive && setTasks(list ?? []);
    if (onlineManager.isOnline()) {
      refetch().then(
        (r) => settle(r.data),
        () => settle(cachedRef.current),
      );
    } else {
      Promise.resolve().then(() => settle(cachedRef.current));
    }
    return () => {
      alive = false;
    };
  }, [refetch]);

  const found = tasks?.some((t) => t.id === id) ?? false;
  useEffect(() => {
    if (found && id) {
      openTask(id);
      navigate('/heute', { replace: true });
    }
  }, [found, id, openTask, navigate]);

  if (tasks && !found) return <Navigate to="/heute" replace />;
  return <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">Lade …</p>;
}
