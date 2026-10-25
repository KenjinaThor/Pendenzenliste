import { useEffect, useRef, useState } from 'react';
import { wheelAngle, type DrawPlan } from '../../lib/shuffle';
import type { Task } from '../../lib/types';

const COLORS = [
  '#be185d',
  '#6d28d9',
  '#047857',
  '#b45309',
  '#1d4ed8',
  '#b91c1c',
  '#0f766e',
  '#7e22ce',
];
const SIZE = 300;
const R = 140;
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

function slicePath(i: number, n: number): string {
  const a0 = ((i * 360) / n - 90) * (Math.PI / 180);
  const a1 = (((i + 1) * 360) / n - 90) * (Math.PI / 180);
  const c = SIZE / 2;
  const [x0, y0, x1, y1] = [
    c + R * Math.cos(a0),
    c + R * Math.sin(a0),
    c + R * Math.cos(a1),
    c + R * Math.sin(a1),
  ];
  return `M${c} ${c} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
}

/** Glücksrad: höchstens 10 Felder (der Gewinner ist immer dabei), der Zeiger oben entscheidet. */
export function LuckyWheel({
  idle,
  plan,
  reduced,
  onDone,
}: {
  /** Felder, solange noch nicht gedreht wurde */
  idle: Task[];
  /** null = noch nicht gedreht; pro Zug neu einhängen (key), dann läuft die Animation einmal ab */
  plan: DrawPlan | null;
  reduced: boolean;
  onDone: () => void;
}) {
  const segments = plan?.segments ?? idle;
  const index = plan ? plan.segments.findIndex((t) => t.id === plan.winner.id) : 0;
  const target = plan ? wheelAngle(0, index, segments.length, 5, plan.jitter) : 0;
  const [angle, setAngle] = useState(() => (plan && reduced ? target % 360 : 0));
  const [animate, setAnimate] = useState(false);
  const finished = useRef(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!plan) return;
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      done.current();
    };
    if (reduced) {
      finish();
      return;
    }
    // zwei Bilder warten, damit der Startwinkel (0°) gezeichnet ist, bevor die Drehung beginnt
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setAnimate(true);
        setAngle(target);
      });
    });
    const fallback = window.setTimeout(finish, 5200);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(fallback);
    };
  }, [plan, reduced, target]);

  const n = segments.length;
  const c = SIZE / 2;
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="relative">
        <div
          aria-hidden
          className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[26px] border-x-transparent border-t-amber-400 drop-shadow"
        />
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Glücksrad mit ${n} Feldern`}
          className="w-full rounded-full shadow-xl ring-8 ring-amber-300"
          style={{
            transform: `rotate(${angle}deg)`,
            transition: animate ? 'transform 4.4s cubic-bezier(0.12, 0.7, 0.1, 1)' : 'none',
          }}
          onTransitionEnd={() => {
            if (plan && !finished.current) {
              finished.current = true;
              done.current();
            }
          }}
        >
          {segments.map((t, i) => (
            <g key={t.id}>
              <path
                d={slicePath(i, n)}
                fill={COLORS[i % COLORS.length]}
                stroke="#fff"
                strokeWidth="2"
              />
              <text
                x={c + 48}
                y={c}
                fill="#fff"
                fontSize="12"
                fontWeight="700"
                dominantBaseline="middle"
                transform={`rotate(${((i + 0.5) * 360) / n - 90} ${c} ${c})`}
              >
                {short(t.title)}
              </text>
            </g>
          ))}
          <circle cx={c} cy={c} r="16" fill="#fbbf24" stroke="#fff" strokeWidth="3" />
        </svg>
      </div>
    </div>
  );
}
