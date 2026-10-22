import { PageHeader } from '../../components/PageHeader';
import { useTasks } from '../../lib/api';
import { computeStats } from '../../lib/stats';

const card = 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={card}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatsPage() {
  const { data: tasks = [], isLoading } = useTasks();
  const s = computeStats(tasks, new Date());
  const max = Math.max(1, ...s.weeks.map((w) => w.done));
  const barW = 36;
  const gap = 12;
  const height = 140;
  const width = s.weeks.length * (barW + gap) - gap;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="📊 Statistik" />
      {isLoading ? (
        <p className="px-4 py-12 text-center text-slate-500">Lade …</p>
      ) : (
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <Tile
              label="Erledigt diese Woche"
              value={String(s.doneThisWeek)}
              hint={`${s.doneThisMonth} in diesem Monat`}
            />
            <Tile
              label="Serie 🔥"
              value={`${s.streak} ${s.streak === 1 ? 'Tag' : 'Tage'}`}
              hint={`Beste Serie: ${s.bestStreak} ${s.bestStreak === 1 ? 'Tag' : 'Tage'}`}
            />
            <Tile
              label="Überfällig"
              value={`${Math.round(s.overdueRate * 100)} %`}
              hint={`${s.overdue} von ${s.open} offenen Pendenzen überfällig`}
            />
            <Tile
              label="Insgesamt erledigt"
              value={String(s.doneTotal)}
              hint={`${s.open} noch offen`}
            />
          </div>

          <section aria-label="Erledigte Pendenzen pro Woche" className={card}>
            <h2 className="mb-3 font-semibold">Erledigte Pendenzen pro Woche</h2>
            <svg
              viewBox={`0 0 ${width} ${height + 24}`}
              className="w-full"
              role="img"
              aria-label={`Erledigte Pendenzen pro Woche: ${s.weeks.map((w) => `ab ${w.label} ${w.done}`).join(', ')}`}
            >
              {s.weeks.map((w, i) => {
                const h = (w.done / max) * (height - 20);
                const x = i * (barW + gap);
                return (
                  <g key={w.label}>
                    <rect
                      x={x}
                      y={height - h}
                      width={barW}
                      height={Math.max(h, w.done ? 2 : 0)}
                      rx={6}
                      className="fill-indigo-500"
                    />
                    <text
                      x={x + barW / 2}
                      y={height - h - 4}
                      textAnchor="middle"
                      className="fill-slate-700 text-[11px] dark:fill-slate-200"
                    >
                      {w.done || ''}
                    </text>
                    <text
                      x={x + barW / 2}
                      y={height + 16}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px]"
                    >
                      {w.label}
                    </text>
                  </g>
                );
              })}
              <line
                x1={0}
                x2={width}
                y1={height}
                y2={height}
                className="stroke-slate-300 dark:stroke-slate-600"
              />
            </svg>
            <p className="mt-1 text-xs text-slate-500">
              Beschriftung: Montag der jeweiligen Woche.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
