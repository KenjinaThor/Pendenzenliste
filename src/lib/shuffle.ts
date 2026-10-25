// Daily-Shuffle: aus den offenen Pendenzen eine auslosen, damit man nicht selbst entscheiden muss.
import { diffDays, startOfDay } from './dates';
import type { Task } from './types';
import { isDone, isOverdue } from './views';

export type ShuffleScope = 'heute' | 'alle';

const WEIGHT = { high: 3, medium: 2, low: 1 } as const;

/** Der «Topf»: offene Pendenzen – entweder heute fällig/überfällig oder alle offenen. */
export function shufflePool(tasks: Task[], scope: ShuffleScope, now: Date): Task[] {
  const open = tasks.filter((t) => !isDone(t) && !t.deleted_at);
  if (scope === 'alle') return open;
  return open.filter((t) => {
    if (!t.due_at) return false;
    return isOverdue(t, now) || diffDays(startOfDay(new Date(t.due_at)), startOfDay(now)) === 0;
  });
}

/**
 * Zieht eine Pendenz. Mit «weighted» sind wichtige Pendenzen wahrscheinlicher (hoch 3 : mittel 2 : tief 1).
 * «rand» liefert Zahlen in [0, 1) (für Tests austauschbar). «exclude» wird nur ausgelassen, wenn es Alternativen gibt.
 */
export function pickTask(
  pool: Task[],
  opts: { weighted: boolean; rand?: () => number; exclude?: string | null },
): Task | null {
  const rand = opts.rand ?? Math.random;
  const candidates =
    pool.length > 1 && opts.exclude ? pool.filter((t) => t.id !== opts.exclude) : pool;
  if (candidates.length === 0) return null;
  const weights = candidates.map((t) => (opts.weighted ? WEIGHT[t.priority] : 1));
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/** Mischt eine Kopie (Fisher-Yates). */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Felder des Glücksrads: höchstens «max», der Gewinner ist immer dabei. */
export function wheelSegments(
  pool: Task[],
  winner: Task,
  max = 10,
  rand: () => number = Math.random,
): Task[] {
  const others = shuffled(
    pool.filter((t) => t.id !== winner.id),
    rand,
  ).slice(0, max - 1);
  return shuffled([winner, ...others], rand);
}

/** Drehwinkel (Grad), damit Feld «index» von «count» oben unter dem Zeiger landet; mindestens «spins» Umdrehungen. */
export function wheelAngle(
  previous: number,
  index: number,
  count: number,
  spins = 5,
  jitter = 0,
): number {
  const seg = 360 / count;
  const target = 360 - (index + 0.5) * seg + jitter * seg * 0.35; // Feldmitte nach oben
  const base = Math.ceil(previous / 360) * 360 + spins * 360;
  return base + target;
}

/** Alles Zufällige eines Zugs, vorab festgelegt (die Anzeige spielt es nur noch ab). */
export interface DrawPlan {
  winner: Task;
  /** Titel, durch die die Walzen des Automaten laufen */
  reelTitles: string[];
  /** Felder des Glücksrads (enthält den Gewinner) */
  segments: Task[];
  /** Streuung -1…1, damit der Zeiger nicht immer genau in der Feldmitte landet */
  jitter: number;
}

export function makePlan(pool: Task[], winner: Task, rand: () => number = Math.random): DrawPlan {
  return {
    winner,
    reelTitles: shuffled(
      pool.filter((t) => t.id !== winner.id).map((t) => t.title),
      rand,
    ),
    segments: wheelSegments(pool, winner, 10, rand),
    jitter: rand() * 2 - 1,
  };
}
