import { PageHeader } from '../../components/PageHeader';
import { usePurgeTask, useTrash, useTrashTask } from '../../lib/api';

export function TrashPage() {
  const { data: trash = [], isPending } = useTrash();
  const restore = useTrashTask();
  const purge = usePurgeTask();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="🗑️ Papierkorb"
        subtitle="Gelöschte Pendenzen sind 30 Tage wiederherstellbar."
      />
      {isPending ? (
        <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">Lade …</p>
      ) : trash.length === 0 ? (
        <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">
          Der Papierkorb ist leer.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {trash.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800"
            >
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <button
                onClick={() => restore.mutate({ id: t.id, trashed: false })}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium dark:bg-slate-700"
              >
                Wiederherstellen
              </button>
              <button
                onClick={() =>
                  window.confirm(`«${t.title}» endgültig löschen?`) && purge.mutate(t.id)
                }
                aria-label={`${t.title} endgültig löschen`}
                className="rounded-lg px-3 py-2 text-sm font-medium text-red-700 dark:text-red-300"
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
