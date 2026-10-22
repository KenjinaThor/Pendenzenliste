import { WEEKDAYS, describeRepeat, weekdayShort, type Weekday } from '../../lib/recurrence';
import { fieldsFromForm, type RepeatForm } from '../../lib/repeatForm';

const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';
const UNIT: Record<string, string> = {
  DAILY: 'Tage',
  WEEKLY: 'Wochen',
  MONTHLY: 'Monate',
  YEARLY: 'Jahre',
};

export function RepeatSection({
  value,
  onChange,
  dueDate,
}: {
  value: RepeatForm;
  onChange: (v: RepeatForm) => void;
  dueDate: Date | null;
}) {
  const disabled = !dueDate;
  const toggleDay = (d: Weekday) =>
    onChange({
      ...value,
      byday: value.byday.includes(d) ? value.byday.filter((x) => x !== d) : [...value.byday, d],
    });
  const summary = describeRepeat(fieldsFromForm(value, dueDate ?? new Date()));

  return (
    <section aria-label="Wiederholung einstellen">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Wiederholung
        <select
          aria-label="Wiederholung"
          value={value.kind}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, kind: e.target.value as RepeatForm['kind'] })}
          className={field}
        >
          <option value="none">{disabled ? 'Zuerst ein Fälligkeitsdatum setzen' : 'Keine'}</option>
          <option value="DAILY">Täglich</option>
          <option value="WEEKLY">Wöchentlich</option>
          <option value="MONTHLY">Monatlich</option>
          <option value="YEARLY">Jährlich</option>
          <option value="after">Nach Erledigung</option>
        </select>
      </label>

      {value.kind !== 'none' && value.kind !== 'after' && !disabled && (
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            Alle
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              aria-label="Wiederholungsabstand"
              value={value.interval}
              onChange={(e) =>
                onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })
              }
              className={`${field} w-20 text-center`}
            />
            {UNIT[value.kind]}
          </div>
          {value.kind === 'WEEKLY' && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Wochentage">
              {WEEKDAYS.map((d) => (
                <button
                  type="button"
                  key={d}
                  aria-pressed={value.byday.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={`h-10 w-10 rounded-full text-sm font-medium ${value.byday.includes(d) ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                >
                  {weekdayShort(d)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {value.kind === 'after' && !disabled && (
        <div className="mt-2 flex items-center gap-2 text-sm">
          <input
            type="number"
            min={1}
            max={365}
            inputMode="numeric"
            aria-label="Tage nach Erledigung"
            value={value.afterDays}
            onChange={(e) =>
              onChange({ ...value, afterDays: Math.max(1, Number(e.target.value) || 1) })
            }
            className={`${field} w-20 text-center`}
          />
          Tage nach Erledigung
        </div>
      )}
      {value.kind !== 'none' && !disabled && (
        <p className="mt-1 text-xs text-slate-500">🔁 {summary}</p>
      )}
    </section>
  );
}
