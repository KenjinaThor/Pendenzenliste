import { useState, type FormEvent } from 'react';
import { useCreateTask, useLists } from '../../lib/api';
import { buildDue, toDateInput } from '../../lib/dates';

/** Schnelles Erfassen: Titel eintippen, Enter. Optional mit Datum «heute» und fester Liste. */
export function QuickAdd({ listId, today = false }: { listId?: string; today?: boolean }) {
  const { data: lists = [] } = useLists();
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  function targetList(): string | undefined {
    if (listId) return listId;
    let last: string | null = null;
    try {
      last = localStorage.getItem('lastListId');
    } catch {
      /* ignorieren */
    }
    return lists.find((l) => l.id === last)?.id ?? lists[0]?.id;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = title.trim();
    const list = targetList();
    if (!text || !list) return;
    setError(null);
    setTitle('');
    try {
      const due = today ? buildDue(toDateInput(new Date()), '') : null;
      await create.mutateAsync({ list_id: list, title: text, ...(due ?? {}) });
    } catch (err) {
      setTitle(text);
      setError((err as Error).message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="px-4 pb-3">
      <input
        aria-label="Pendenz schnell erfassen"
        disabled={!targetList()}
        placeholder={
          !targetList() ? 'Lade …' : today ? 'Neue Pendenz für heute …' : 'Neue Pendenz …'
        }
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        enterKeyHint="done"
        className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
