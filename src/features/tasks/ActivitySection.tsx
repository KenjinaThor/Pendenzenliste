import { useActivity } from '../../lib/api';
import { activityLines } from '../../lib/activity';
import { usePermissions } from '../sharing/usePermissions';

export function ActivitySection({ taskId, listId }: { taskId: string; listId: string }) {
  const { data: entries = [] } = useActivity(taskId);
  const { nameOf } = usePermissions();
  const rows = entries.flatMap((e) =>
    activityLines(e, (id) => nameOf(listId, id)).map((text, i) => ({
      key: `${e.id}-${i}`,
      who: e.profiles?.name ?? 'Jemand',
      text,
      at: e.created_at,
    })),
  );

  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-medium">
        Verlauf{' '}
        {rows.length > 0 && (
          <span className="text-slate-600 dark:text-slate-400">({rows.length})</span>
        )}
      </summary>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Noch keine Änderungen.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {rows.map((r) => (
            <li key={r.key}>
              <strong>{r.who}</strong> {r.text}
              <span className="text-slate-600 dark:text-slate-400">
                {' '}
                ·{' '}
                {new Date(r.at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
