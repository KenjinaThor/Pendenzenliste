import { NavLink } from 'react-router-dom';
import { useLists, useNotifications, useSavedFilters, useTasks } from '../lib/api';
import { usePermissions } from '../features/sharing/usePermissions';
import { countFor, isDone, VIEWS } from '../lib/views';
import { useAuth } from '../features/auth/AuthProvider';
import { useEditor } from '../features/tasks/EditorContext';

const link = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 ${isActive ? 'bg-indigo-100 font-semibold text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'active:bg-slate-100 md:hover:bg-slate-100 dark:active:bg-slate-700 dark:md:hover:bg-slate-700'}`;

/** Ansichten, Listen und Verknüpfungen – in der Seitenleiste (PC) und auf der Seite «Listen» (iPhone). */
export function NavContent() {
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const { data: smartLists = [] } = useSavedFilters();
  const { session } = useAuth();
  const { openList } = useEditor();
  const perms = usePermissions();
  const { data: notifications = [] } = useNotifications();
  const unread = notifications.filter((n) => !n.read_at).length;
  const now = new Date();

  return (
    <nav aria-label="Navigation" className="flex flex-col gap-1">
      {VIEWS.map((v) => {
        const n = countFor(v.key, tasks, now, session?.user.id);
        return (
          <NavLink key={v.key} to={`/${v.key}`} className={link}>
            <span aria-hidden>{v.icon}</span>
            <span className="flex-1">{v.label}</span>
            {n > 0 && (
              <span
                className={`text-sm ${v.key === 'ueberfaellig' ? 'font-semibold text-red-600' : 'text-slate-500'}`}
              >
                {n}
              </span>
            )}
          </NavLink>
        );
      })}
      <h2 className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Listen
      </h2>
      {lists.map((l) => (
        <NavLink key={l.id} to={`/liste/${l.id}`} className={link}>
          <span aria-hidden>{l.emoji}</span>
          <span className="flex-1 truncate">
            {l.name}
            {perms.isShared(l.id) && <span aria-label="geteilt"> 👥</span>}
          </span>
          <span className="text-sm text-slate-500">
            {tasks.filter((t) => t.list_id === l.id && !isDone(t)).length || ''}
          </span>
        </NavLink>
      ))}
      {smartLists.length > 0 && (
        <>
          <h2 className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Intelligente Listen
          </h2>
          {smartLists.map((s) => (
            <NavLink key={s.id} to={`/filter/${s.id}`} className={link}>
              <span aria-hidden>🔎</span>
              <span className="flex-1 truncate">{s.name}</span>
            </NavLink>
          ))}
        </>
      )}
      <button
        onClick={() => openList(null)}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-indigo-700 dark:text-indigo-300"
      >
        <span aria-hidden>＋</span> Neue Liste
      </button>
      <div className="mt-4 border-t border-slate-200 pt-2 dark:border-slate-700">
        <NavLink to="/kalenderansicht" className={link}>
          <span aria-hidden>📅</span> Kalender
        </NavLink>
        <NavLink to="/statistik" className={link}>
          <span aria-hidden>📊</span> Statistik
        </NavLink>
        <NavLink to="/mitteilungen" className={link}>
          <span aria-hidden>🔔</span>
          <span className="flex-1">Mitteilungen</span>
          {unread > 0 && (
            <span className="rounded-full bg-indigo-600 px-2 text-xs text-white">{unread}</span>
          )}
        </NavLink>
        <NavLink to="/kalender" className={link}>
          <span aria-hidden>📆</span> Kalender verbinden
        </NavLink>
        <NavLink to="/papierkorb" className={link}>
          <span aria-hidden>🗑️</span> Papierkorb
        </NavLink>
        <NavLink to="/einstellungen" className={link}>
          <span aria-hidden>⚙️</span> Einstellungen
        </NavLink>
      </div>
    </nav>
  );
}
