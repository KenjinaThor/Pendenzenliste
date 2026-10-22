import { useState } from 'react';
import { WEEKDAYS, describeRepeat, weekdayShort, type Weekday } from '../../lib/recurrence';
import { fieldsFromForm, type RepeatForm } from '../../lib/repeatForm';

const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';
const UNIT: Record<string, string> = {
  DAILY: 'Tage',
  WEEKLY: 'Wochen',
  MONTHLY: 'Monate',
  YEARLY: 'Jahre',
};

function NumberField({
  value,
  max,
  label,
  onCommit,
}: {
  value: number;
  max: number;
  label: string;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={1}
      max={max}
      inputMode="numeric"
      aria-label={label}
      value={text ?? value}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && n >= 1) onCommit(Math.min(max, Math.floor(n)));
      }}
      onBlur={() => setText(null)}
      className={`${field} w-20 text-center`}
    />
  );
}

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
            <NumberField
              label="Wiederholungsabstand"
              value={value.interval}
              max={99}
              onCommit={(n) => onChange({ ...value, interval: n })}
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
          <NumberField
            label="Tage nach Erledigung"
            value={value.afterDays}
            max={365}
            onCommit={(n) => onChange({ ...value, afterDays: n })}
          />
          Tage nach Erledigung
        </div>
      )}
      {value.kind !== 'none' && !disabled && (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">🔁 {summary}</p>
      )}
    </section>
  );
}
