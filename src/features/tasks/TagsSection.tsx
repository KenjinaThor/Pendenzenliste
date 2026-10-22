import { useId, useState } from 'react';

const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

/** Tags als Chips; Eingabe mit Enter oder Komma, Vorschläge aus bereits verwendeten Tags. */
export function TagsSection({
  names,
  onChange,
  suggestions,
}: {
  names: string[];
  onChange: (names: string[]) => void;
  suggestions: string[];
}) {
  const [text, setText] = useState('');
  const listId = useId();

  function add(raw: string) {
    const name = raw.trim().replace(/^[#+]/, '');
    if (!name) return;
    if (!names.some((n) => n.toLocaleLowerCase('de-CH') === name.toLocaleLowerCase('de-CH')))
      onChange([...names, name]);
    setText('');
  }

  return (
    <section aria-label="Tags">
      <p className="mb-2 text-sm font-medium">Tags</p>
      {names.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2">
          {names.map((n) => (
            <li
              key={n}
              className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 text-sm dark:bg-slate-700"
            >
              <span>#{n}</span>
              <button
                type="button"
                aria-label={`Tag ${n} entfernen`}
                onClick={() => onChange(names.filter((x) => x !== n))}
                className="h-7 w-7 rounded-full text-slate-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        aria-label="Tag hinzufügen"
        placeholder="Tag hinzufügen (Enter)"
        value={text}
        list={listId}
        onChange={(e) =>
          e.target.value.endsWith(',') ? add(e.target.value.slice(0, -1)) : setText(e.target.value)
        }
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onBlur={() => add(text)}
        className={`${field} w-full`}
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !names.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </section>
  );
}
