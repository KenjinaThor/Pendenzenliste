import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useSnackbar } from '../../components/Snackbar';
import { useCompleteTask, useLists, useTasks } from '../../lib/api';
import { formatDay, formatDue } from '../../lib/dates';
import {
  makePlan,
  pickTask,
  shufflePool,
  type DrawPlan,
  type ShuffleScope,
} from '../../lib/shuffle';
import { PRIORITY_LABEL } from '../../lib/types';
import { useEditor } from '../tasks/EditorContext';
import { Confetti } from './Confetti';
import { LuckyWheel } from './LuckyWheel';
import { ScratchCard } from './ScratchCard';
import { SlotMachine } from './SlotMachine';
import { useReducedMotion } from './useReducedMotion';

type Mode = 'slot' | 'wheel' | 'scratch';
const MODES: { key: Mode; icon: string; label: string; action: string }[] = [
  { key: 'slot', icon: '🎰', label: 'Automat', action: 'Hebel ziehen' },
  { key: 'wheel', icon: '🎡', label: 'Glücksrad', action: 'Rad drehen' },
  { key: 'scratch', icon: '🎟️', label: 'Rubbellos', action: 'Neues Los ziehen' },
];

const chip = (on: boolean) =>
  `h-10 rounded-xl px-3 text-sm font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'}`;

/** Daily-Shuffle: Das Glück entscheidet, welche Pendenz als Nächstes drankommt. */
export function ShufflePage() {
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const { openTask } = useEditor();
  const complete = useCompleteTask();
  const snackbar = useSnackbar();
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<Mode>('slot');
  const [scope, setScope] = useState<ShuffleScope>('heute');
  const [weighted, setWeighted] = useState(true);
  const [runId, setRunId] = useState(0);
  const [plan, setPlan] = useState<DrawPlan | null>(null);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'done'>('idle');
  const [finished, setFinished] = useState<string | null>(null);

  const now = new Date();
  // Der Topf ändert sich nur mit den Pendenzen und der Auswahl, nicht mit jedem Rendern
  const pool = useMemo(() => shufflePool(tasks, scope, new Date()), [tasks, scope]);
  const winnerId = plan?.winner.id ?? null;
  const winner = tasks.find((t) => t.id === winnerId) ?? null;
  const list = lists.find((l) => l.id === winner?.list_id);
  const current = MODES.find((m) => m.key === mode)!;

  function draw() {
    const next = pickTask(pool, { weighted, exclude: winnerId });
    if (!next) return;
    setPlan(makePlan(pool, next));
    setFinished(null);
    setPhase('spinning');
    setRunId((n) => n + 1);
  }

  function pickMode(m: Mode) {
    setMode(m);
    setPhase('idle');
    setPlan(null);
    setRunId(0);
  }

  function onDone() {
    setPhase('done');
  }

  async function markDone() {
    if (!winner) return;
    try {
      const { nextDue, undo } = await complete(winner);
      setFinished(winner.id);
      snackbar({
        text: nextDue
          ? `«${winner.title}» erledigt · nächste: ${formatDay(nextDue, new Date())}`
          : `«${winner.title}» erledigt`,
        onAction: () => {
          void undo();
          setFinished(null);
        },
      });
    } catch (e) {
      snackbar({ text: `Fehler: ${(e as Error).message}` });
    }
  }

  const spinning = phase === 'spinning';
  const showResult = phase === 'done' && winner;

  return (
    <section className="mx-auto max-w-xl pb-6">
      <PageHeader
        title="🎰 Daily-Shuffle"
        subtitle="Das Glück entscheidet, was als Nächstes dran ist."
      />
      <div className="flex flex-col gap-4 px-4">
        <div role="group" aria-label="Spielart" className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              aria-pressed={mode === m.key}
              disabled={spinning}
              onClick={() => pickMode(m.key)}
              className={`${chip(mode === m.key)} disabled:opacity-60`}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-800">
          <div role="group" aria-label="Topf" className="flex flex-wrap gap-2">
            <button
              aria-pressed={scope === 'heute'}
              onClick={() => setScope('heute')}
              className={chip(scope === 'heute')}
            >
              Heute &amp; überfällig
            </button>
            <button
              aria-pressed={scope === 'alle'}
              onClick={() => setScope('alle')}
              className={chip(scope === 'alle')}
            >
              Alle offenen
            </button>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={weighted}
              onChange={(e) => setWeighted(e.target.checked)}
              className="h-5 w-5 accent-indigo-600"
            />
            ⭐ Wichtiges bevorzugen
          </label>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {pool.length === 0
              ? 'Der Topf ist leer.'
              : `${pool.length} ${pool.length === 1 ? 'Pendenz' : 'Pendenzen'} im Topf`}
          </p>
        </div>

        {pool.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center shadow-sm dark:bg-slate-800">
            {scope === 'heute'
              ? 'Heute ist nichts fällig. Wähle «Alle offenen», um aus allem zu ziehen. 🎉'
              : 'Keine offenen Pendenzen. Geniesse den Tag! 🎉'}
          </p>
        ) : (
          <>
            {mode === 'slot' && (
              <SlotMachine key={runId} plan={plan} reduced={reduced} onDone={onDone} />
            )}
            {mode === 'wheel' && (
              <LuckyWheel
                key={runId}
                idle={pool.slice(0, 10)}
                plan={plan}
                reduced={reduced}
                onDone={onDone}
              />
            )}
            {mode === 'scratch' &&
              (winner && runId > 0 ? (
                <ScratchCard key={runId} winner={winner} reduced={reduced} onDone={onDone} />
              ) : (
                <div className="mx-auto flex h-44 w-full max-w-sm items-center justify-center rounded-2xl bg-gradient-to-br from-slate-300 to-slate-400 text-center font-semibold text-slate-900 shadow-xl ring-4 ring-slate-500">
                  🎟️ Zieh ein Los und rubble es frei
                </div>
              ))}
            <button
              onClick={draw}
              disabled={spinning}
              className="h-14 rounded-2xl bg-gradient-to-r from-pink-600 to-orange-500 text-lg font-extrabold text-white shadow-lg active:scale-95 disabled:opacity-60"
            >
              {spinning
                ? '… das Glück entscheidet …'
                : `${current.icon} ${showResult ? 'Nochmal: ' : ''}${current.action}`}
            </button>
          </>
        )}

        <div aria-live="polite">
          {showResult && (
            <article
              aria-label="Gezogene Pendenz"
              className="rounded-2xl border-2 border-amber-400 bg-white p-4 shadow-lg dark:bg-slate-800"
            >
              <p className="text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-300">
                🏆 Deine nächste Pendenz
              </p>
              <h2 className="mt-1 text-xl font-bold break-words">{winner.title}</h2>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {list ? `${list.emoji} ${list.name} · ` : ''}
                {winner.due_at
                  ? `${formatDue(new Date(winner.due_at), winner.due_all_day, now)} · `
                  : ''}
                Priorität {PRIORITY_LABEL[winner.priority].toLowerCase()}
              </p>
              {finished === winner.id ? (
                <p className="mt-3 font-semibold text-emerald-800 dark:text-emerald-300">
                  ✅ Erledigt – stark! Zieh die nächste.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openTask(winner.id)}
                    className="h-11 rounded-xl bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
                  >
                    ▶️ Öffnen
                  </button>
                  <button
                    onClick={() => void markDone()}
                    className="h-11 rounded-xl bg-emerald-700 font-semibold text-white active:bg-emerald-800"
                  >
                    ✅ Erledigt
                  </button>
                </div>
              )}
            </article>
          )}
        </div>
      </div>
      {showResult && finished !== winner.id && !reduced && <Confetti key={runId} />}
    </section>
  );
}
