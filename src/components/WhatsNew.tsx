import { useState } from 'react';
import { LATEST_CHANGELOG_ID, unseenEntries } from '../lib/changelog';
import { Sheet } from './Sheet';

const KEY = 'changelogSeen';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Zeigt nach einem Update beim Öffnen, was neu ist. «off» schaltet die Info ab (für Tests). */
export function WhatsNew() {
  const [entries, setEntries] = useState(() => {
    const seen = read();
    return seen === 'off' ? [] : unseenEntries(seen);
  });
  if (entries.length === 0) return null;

  function close() {
    try {
      localStorage.setItem(KEY, LATEST_CHANGELOG_ID);
    } catch {
      /* ignorieren */
    }
    setEntries([]);
  }

  return (
    <Sheet title="Neu in der App" onClose={close}>
      <div className="flex flex-col gap-4 pb-2">
        {entries.map((e) => (
          <section key={e.id}>
            <h3 className="font-semibold">{e.title}</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">
              {e.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
        <button
          type="button"
          onClick={close}
          className="h-12 rounded-xl bg-brand-600 font-semibold text-white active:bg-brand-700"
        >
          Verstanden
        </button>
      </div>
    </Sheet>
  );
}
