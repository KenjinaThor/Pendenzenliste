import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet } from '../../components/Sheet';
import { useDeleteList, useLists, useSaveList } from '../../lib/api';

export const LIST_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
];
const EMOJIS = [
  '📋',
  '🏠',
  '💼',
  '🛒',
  '❤️',
  '✈️',
  '💪',
  '📚',
  '🎯',
  '💡',
  '🎉',
  '🧾',
  '🚗',
  '🐶',
  '🍽️',
  '🌱',
];

export function ListEditor({ listId, onClose }: { listId: string | null; onClose: () => void }) {
  const { data: lists = [] } = useLists();
  const existing = lists.find((l) => l.id === listId);
  const save = useSaveList();
  const del = useDeleteList();
  const navigate = useNavigate();

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📋');
  const [color, setColor] = useState(existing?.color ?? LIST_COLORS[0]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const saved = await save.mutateAsync({ id: existing?.id, name: name.trim(), emoji, color });
    onClose();
    if (!existing) navigate(`/liste/${saved.id}`);
  }

  async function onDelete() {
    if (!existing) return;
    if (!window.confirm(`Liste «${existing.name}» mit allen Pendenzen endgültig löschen?`)) return;
    await del.mutateAsync(existing.id);
    onClose();
    navigate('/heute');
  }

  return (
    <Sheet title={existing ? 'Liste bearbeiten' : 'Neue Liste'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
        <input
          autoFocus
          aria-label="Name der Liste"
          placeholder="Name der Liste"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900"
        />
        <div>
          <p className="mb-2 text-sm font-medium">Symbol</p>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => setEmoji(e)}
                aria-label={`Symbol ${e}`}
                aria-pressed={e === emoji}
                className={`h-11 w-11 rounded-xl text-xl ${e === emoji ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900' : 'bg-slate-100 dark:bg-slate-700'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Farbe</p>
          <div className="flex flex-wrap gap-3">
            {LIST_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                aria-label={`Farbe ${c}`}
                aria-pressed={c === color}
                style={{ backgroundColor: c }}
                className={`h-9 w-9 rounded-full ${c === color ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-800' : ''}`}
              />
            ))}
          </div>
        </div>
        {(save.error || del.error) && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            {((save.error ?? del.error) as Error).message}
          </p>
        )}
        <button
          disabled={save.isPending || !name.trim()}
          className="h-12 rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
        >
          Speichern
        </button>
        {existing && (
          <button
            type="button"
            onClick={onDelete}
            className="h-12 rounded-xl border border-red-300 font-medium text-red-700"
          >
            Liste löschen
          </button>
        )}
      </form>
    </Sheet>
  );
}
