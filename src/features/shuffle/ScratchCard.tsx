import { useEffect, useRef, useState } from 'react';
import type { Task } from '../../lib/types';

const BRUSH = 26;
const REVEAL_AT = 0.5;

/** Rubbellos: Unter der Silberschicht steht die gezogene Pendenz. Mit dem Finger oder der Maus freirubbeln. */
export function ScratchCard({
  winner,
  reduced,
  onDone,
}: {
  winner: Task;
  reduced: boolean;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  const last = useRef(0);
  const [revealed, setRevealed] = useState(reduced);
  const done = useRef(onDone);
  const reveal = useRef(() => {});
  useEffect(() => {
    done.current = onDone;
    reveal.current = () => {
      if (revealed) return;
      setRevealed(true);
      done.current();
    };
  });

  useEffect(() => {
    if (reduced) {
      done.current();
      return;
    }
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = box.getBoundingClientRect();
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#d1d5db');
    g.addColorStop(0.5, '#f3f4f6');
    g.addColorStop(1, '#9ca3af');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#4b5563';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨ Hier rubbeln ✨', width / 2, height / 2);
  }, [reduced]);

  function scratch(e: React.PointerEvent<HTMLCanvasElement>) {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx || revealed) return;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr, BRUSH * dpr, 0, Math.PI * 2);
    ctx.fill();
    const now = performance.now();
    if (now - last.current < 120) return;
    last.current = now;
    // Anteil des freigerubbelten Bereichs (jeder 40. Bildpunkt genügt)
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 40) {
      total++;
      if (data[i] < 128) clear++;
    }
    if (clear / total >= REVEAL_AT) reveal.current();
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div
        ref={wrap}
        className="relative h-44 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 shadow-xl ring-4 ring-amber-500"
      >
        <div
          aria-hidden={!revealed}
          className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-slate-900"
        >
          <span className="text-xs font-semibold tracking-wide uppercase">🎁 Dein Gewinn</span>
          <span className="line-clamp-3 text-xl font-extrabold break-words">{winner.title}</span>
        </div>
        {!revealed && (
          <canvas
            ref={canvas}
            aria-hidden
            data-testid="scratch-layer"
            className="absolute inset-0 h-full w-full cursor-pointer"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
              pressed.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              scratch(e);
            }}
            onPointerMove={(e) => pressed.current && scratch(e)}
            onPointerUp={() => (pressed.current = false)}
            onPointerCancel={() => (pressed.current = false)}
          />
        )}
      </div>
      {!revealed && (
        <button
          type="button"
          onClick={() => reveal.current()}
          className="mx-auto mt-2 block text-sm text-slate-700 underline dark:text-slate-300"
        >
          Sofort aufdecken
        </button>
      )}
    </div>
  );
}
