import { useState, type FormEvent, type ReactNode } from 'react';
import { useAddComment, useComments, useDeleteComment } from '../../lib/api';
import { usePermissions } from '../sharing/usePermissions';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Hebt @Erwähnungen (Namen von Mitgliedern) im Text hervor. */
function renderBody(body: string, names: string[]): ReactNode {
  if (!names.length) return body;
  const re = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'gi');
  return body.split(re).map((part, i) =>
    re.test(part) && part.startsWith('@') ? (
      <span
        key={i}
        className="rounded bg-indigo-100 px-1 font-medium text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100"
      >
        {part}
      </span>
    ) : (
      part
    ),
  );
}

export function CommentsSection({
  taskId,
  listId,
  canComment,
}: {
  taskId: string;
  listId: string;
  canComment: boolean;
}) {
  const { data: comments = [] } = useComments(taskId);
  const add = useAddComment();
  const del = useDeleteComment();
  const { membersOf, userId } = usePermissions();
  const members = membersOf(listId);
  const names = members.map((m) => m.profiles?.name).filter((n): n is string => Boolean(n));
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Vorschläge, solange am Ende des Textes «@Na…» steht
  const query = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1];
  const suggestions =
    query === undefined
      ? []
      : members.filter((m) =>
          m.profiles?.name.toLocaleLowerCase('de-CH').startsWith(query.toLocaleLowerCase('de-CH')),
        );

  function pick(name: string) {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${name} `));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const lower = body.toLocaleLowerCase('de-CH');
    const mentions = members
      .filter((m) => m.profiles && lower.includes(`@${m.profiles.name.toLocaleLowerCase('de-CH')}`))
      .map((m) => m.user_id);
    setError(null);
    try {
      await add.mutateAsync({ taskId, body, mentions });
      setText('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section aria-label="Kommentare" className="mt-6">
      <h3 className="mb-2 text-sm font-medium">
        Kommentare{' '}
        {comments.length > 0 && <span className="text-slate-500">({comments.length})</span>}
      </h3>
      <ul className="flex flex-col gap-2">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-700">
            <div className="mb-0.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-300">
              <span>
                <strong>{c.profiles?.name ?? 'Unbekannt'}</strong> ·{' '}
                {new Date(c.created_at).toLocaleString('de-CH', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </span>
              {c.author_id === userId && (
                <button
                  aria-label="Kommentar löschen"
                  className="text-slate-400"
                  onClick={() => del.mutate({ id: c.id, taskId })}
                >
                  ×
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm">{renderBody(c.body, names)}</p>
          </li>
        ))}
      </ul>
      {canComment && (
        <form onSubmit={onSubmit} className="relative mt-2">
          {suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Personen erwähnen"
              className="absolute bottom-full z-10 mb-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-800"
            >
              {suggestions.map((m) => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => pick(m.profiles!.name)}
                    className="block w-full px-3 py-2 text-left active:bg-slate-100 dark:active:bg-slate-700"
                  >
                    @{m.profiles?.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              aria-label="Kommentar schreiben"
              placeholder="Kommentar … (@ erwähnt jemanden)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
            />
            <button
              disabled={!text.trim() || add.isPending}
              className="h-12 rounded-xl bg-brand-600 px-4 font-medium text-white disabled:opacity-60"
            >
              Senden
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
