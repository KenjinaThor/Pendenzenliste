import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
  useCalendarFeed,
  useLists,
  useRotateCalendarToken,
  useSaveCalendarLists,
} from '../../lib/api';
import { feedUrl, toWebcal } from '../../lib/calendarUrl';
import { useAuth } from '../auth/AuthProvider';

const card = 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';

export function CalendarPage() {
  const { session } = useAuth();
  const { data: feed, isLoading, error } = useCalendarFeed();
  const { data: lists = [] } = useLists();
  const rotate = useRotateCalendarToken();
  const saveLists = useSaveCalendarLists();
  const [copied, setCopied] = useState(false);
  const userId = session?.user.id ?? '';

  const url = feed?.token ? feedUrl(feed.token) : null;
  const selected = feed?.list_ids ?? lists.map((l) => l.id);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Link kopieren:', url);
    }
  }

  function toggleList(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    // alle Listen gewählt = keine Einschränkung (auch künftige Listen erscheinen im Kalender)
    saveLists.mutate({ userId, listIds: next.length === lists.length ? null : next });
  }

  async function regenerate() {
    if (
      !window.confirm(
        'Neuen Link erzeugen? Der alte Link funktioniert danach nicht mehr, und du musst den Kalender neu abonnieren.',
      )
    )
      return;
    await rotate.mutateAsync();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="📆 Kalender verbinden"
        subtitle="Deine Pendenzen im Apple-, Google- oder Outlook-Kalender"
      />
      <div className="flex flex-col gap-4 px-4 pb-6">
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            {(error as Error).message}
          </p>
        )}
        {isLoading ? (
          <p className="py-8 text-center text-slate-500">Lade …</p>
        ) : !url ? (
          <section className={card}>
            <p className="mb-3">
              Erzeuge deinen persönlichen Kalender-Link. Alle Pendenzen mit Fälligkeit erscheinen
              dann als Termine in deiner Kalender-App.
            </p>
            <button
              onClick={() => rotate.mutate()}
              disabled={rotate.isPending}
              className="h-12 w-full rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
            >
              Kalender-Link erzeugen
            </button>
            {rotate.error && (
              <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">
                {(rotate.error as Error).message}
              </p>
            )}
          </section>
        ) : (
          <>
            <section className={card}>
              <a
                href={toWebcal(url)}
                className="flex h-12 items-center justify-center rounded-xl bg-brand-600 font-medium text-white active:bg-brand-700"
              >
                In Apple Kalender abonnieren
              </a>
              <p className="mt-3 text-sm font-medium">Dein persönlicher Link</p>
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  aria-label="Kalender-Link"
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900"
                />
                <button
                  onClick={copy}
                  className="h-11 rounded-xl bg-slate-200 px-4 text-sm font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
                >
                  {copied ? 'Kopiert ✓' : 'Kopieren'}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Der Link ist geheim: Wer ihn kennt, sieht deine Termine. Gib ihn nicht weiter.
              </p>
            </section>

            <section className={card}>
              <h2 className="mb-1 font-semibold">Welche Listen erscheinen im Kalender?</h2>
              <ul className="flex flex-col">
                {lists.map((l) => (
                  <li key={l.id}>
                    <label className="flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={selected.includes(l.id)}
                        onChange={() => toggleList(l.id)}
                      />
                      <span>
                        {l.emoji} {l.name}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className={card}>
              <h2 className="mb-2 font-semibold">So geht es</h2>
              <details open className="mb-2">
                <summary className="cursor-pointer font-medium">iPhone / iPad</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  <li>
                    Tippe oben auf <strong>«In Apple Kalender abonnieren»</strong> und bestätige mit{' '}
                    <strong>Abonnieren</strong>.
                  </li>
                  <li>
                    Oder manuell:{' '}
                    <em>
                      Einstellungen → Kalender → Accounts → Account hinzufügen → Andere →
                      Kalenderabo hinzufügen
                    </em>{' '}
                    und den Link einfügen.
                  </li>
                </ol>
              </details>
              <details className="mb-2">
                <summary className="cursor-pointer font-medium">Mac</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                  <li>
                    Öffne die Kalender-App und wähle <em>Ablage → Neues Kalenderabonnement …</em>
                  </li>
                  <li>Füge den Link ein und bestätige.</li>
                </ol>
              </details>
              <details className="mb-2">
                <summary className="cursor-pointer font-medium">Google Kalender</summary>
                <p className="mt-2 text-sm">
                  Am PC auf calendar.google.com: <em>Weitere Kalender (+) → Per URL</em>, Link
                  einfügen und «Kalender hinzufügen» wählen. Google aktualisiert abonnierte Kalender
                  nur alle paar Stunden.
                </p>
              </details>
              <details>
                <summary className="cursor-pointer font-medium">Outlook</summary>
                <p className="mt-2 text-sm">
                  Outlook im Web: <em>Kalender hinzufügen → Aus dem Internet abonnieren</em>, Link
                  einfügen.
                </p>
              </details>
              <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <strong>Gut zu wissen:</strong> Apple aktualisiert abonnierte Kalender
                zeitverzögert. Das Intervall stellst du auf dem iPhone unter{' '}
                <em>Einstellungen → Kalender → Accounts → Neue Daten laden</em> ein. Für einen
                sofortigen Eintrag nutze bei einer Pendenz den Knopf «Zum Kalender hinzufügen».
              </p>
            </section>

            <button
              onClick={regenerate}
              disabled={rotate.isPending}
              className="h-12 rounded-xl border border-red-300 font-medium text-red-700 disabled:opacity-60"
            >
              Link neu erzeugen (alter Link wird ungültig)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
