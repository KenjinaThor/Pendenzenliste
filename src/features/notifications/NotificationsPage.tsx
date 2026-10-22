import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { useMarkNotificationsRead, useNotifications } from '../../lib/api';
import type { AppNotification } from '../../lib/types';

export function notificationText(n: AppNotification): string {
  const who = n.payload.actor_name ?? 'Jemand';
  const title = n.payload.task_title ?? 'eine Pendenz';
  return n.kind === 'assigned'
    ? `${who} hat dir «${title}» zugewiesen`
    : `${who} hat dich in «${title}» erwähnt`;
}

export function NotificationsPage() {
  const { data: items = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const hasUnread = items.some((n) => !n.read_at);

  // Beim Öffnen als gelesen markieren (die Anzeige bleibt bis zum Verlassen der Seite hervorgehoben)
  useEffect(() => {
    if (hasUnread) {
      const t = window.setTimeout(() => markRead.mutate(), 1500);
      return () => window.clearTimeout(t);
    }
  }, [hasUnread, markRead]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="🔔 Mitteilungen" />
      {isLoading ? (
        <p className="px-4 py-12 text-center text-slate-500">Lade …</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-12 text-center text-slate-500">Keine Mitteilungen.</p>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {items.map((n) => (
            <li key={n.id}>
              <Link
                to={n.task_id ? `/pendenz/${n.task_id}` : '/heute'}
                className={`block rounded-2xl p-3 shadow-sm ${n.read_at ? 'bg-white dark:bg-slate-800' : 'bg-indigo-50 dark:bg-indigo-950'}`}
              >
                <span className="block font-medium">{notificationText(n)}</span>
                {n.payload.excerpt && (
                  <span className="mt-0.5 block truncate text-sm text-slate-500">
                    {n.payload.excerpt}
                  </span>
                )}
                <span className="mt-0.5 block text-xs text-slate-500">
                  {new Date(n.created_at).toLocaleString('de-CH')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
