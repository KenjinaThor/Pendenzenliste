import { useEffect, useRef, useState } from 'react';
import type { DrawPlan } from '../../lib/shuffle';

const STOP_AT = [1300, 1900, 2500];
const IDLE = ['🍀', '⭐', '🎯'];

/** Spielautomat: drei Walzen drehen sich durch deine Pendenzen und bleiben alle bei der Gewinnerin stehen. */
export function SlotMachine({
  plan,
  reduced,
  onDone,
}: {
  /** null = noch nicht gespielt; pro Zug neu einhängen (key), dann läuft die Animation einmal ab */
  plan: DrawPlan | null;
  reduced: boolean;
  onDone: () => void;
}) {
  const instant = Boolean(plan && reduced);
  const [faces, setFaces] = useState<string[]>(() =>
    instant ? Array(3).fill(plan!.winner.title) : IDLE,
  );
  const [locked, setLocked] = useState<boolean[]>(() => [instant, instant, instant]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!plan) return;
    if (reduced) {
      done.current();
      return;
    }
    const titles = plan.reelTitles;
    const faceAt = (n: number) => titles[n % Math.max(titles.length, 1)] ?? '🎲';
    const stopped = [false, false, false];
    let tick = 0;
    const spin = window.setInterval(() => {
      tick++;
      setFaces((old) => old.map((f, i) => (stopped[i] ? f : faceAt(tick * 3 + i * 7 + i))));
    }, 75);
    const timers = STOP_AT.map((ms, i) =>
      window.setTimeout(() => {
        stopped[i] = true;
        setFaces((old) => old.map((f, k) => (k === i ? plan.winner.title : f)));
        setLocked((old) => old.map((l, k) => l || k === i));
        if (i === STOP_AT.length - 1) {
          window.clearInterval(spin);
          timers.push(window.setTimeout(() => done.current(), 450));
        }
      }, ms),
    );
    return () => {
      window.clearInterval(spin);
      timers.forEach(window.clearTimeout);
    };
  }, [plan, reduced]);

  return (
    <div
      role="img"
      aria-label="Spielautomat mit drei Walzen"
      className="rounded-3xl bg-gradient-to-b from-fuchsia-700 to-indigo-900 p-4 shadow-xl ring-4 ring-amber-300"
    >
      <div aria-hidden className="mb-3 flex justify-center gap-2 text-lg">
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className={plan && !locked.every(Boolean) ? 'bulb-blink' : ''}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            {i % 2 ? '🟡' : '🔴'}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2" aria-hidden>
        {faces.map((f, i) => (
          <div
            key={i}
            className={`flex h-24 items-center justify-center overflow-hidden rounded-xl bg-white px-2 text-center text-sm leading-tight font-bold text-slate-900 shadow-inner ring-4 ${locked[i] ? 'ring-emerald-400' : 'ring-slate-300'}`}
          >
            <span className="line-clamp-3 break-words">{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
