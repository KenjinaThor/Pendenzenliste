import { useRef, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useCreateTask } from '../../lib/api';
import { buildDue } from '../../lib/dates';
import { findAppointments, type FoundAppointment } from '../../lib/docScan';
import { recognizeText } from '../../lib/ocr';

const STATUS_DE: Record<string, string> = {
  'loading tesseract core': 'Texterkennung wird geladen …',
  'loading language traineddata': 'Sprachpaket wird geladen (nur beim ersten Mal) …',
  'initializing api': 'Wird vorbereitet …',
  'recognizing text': 'Text wird gelesen …',
};
const field =
  'h-10 rounded-lg border border-slate-300 bg-white px-2 text-base text-slate-900 dark:border-slate-600';

interface Row extends FoundAppointment {
  created: boolean;
}

/** Dokument fotografieren oder aus den Fotos wählen und Termine daraus als Pendenzen übernehmen. */
export function ScanDialog({ listId, onClose }: { listId: string; onClose: () => void }) {
  const create = useCreateTask();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<{ text: string; fraction: number } | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setBusy({ text: 'Wird vorbereitet …', fraction: 0 });
    try {
      const result = await recognizeText(file, (status, fraction) =>
        setBusy({ text: STATUS_DE[status] ?? 'Wird verarbeitet …', fraction }),
      );
      setText(result);
      setRows(findAppointments(result).map((a) => ({ ...a, created: false })));
    } catch (e) {
      setError(
        e instanceof Error && /fetch|network|load/i.test(e.message)
          ? 'Die Texterkennung konnte nicht geladen werden. Beim ersten Mal brauchst du eine Internetverbindung.'
          : 'Das Bild konnte nicht gelesen werden. Bitte versuche es mit einem schärferen, gut beleuchteten Foto.',
      );
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  const patch = (i: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));

  function add(i: number) {
    const r = rows[i];
    if (!r.title.trim() || !r.date) return;
    create({ list_id: listId, title: r.title.trim(), ...(buildDue(r.date, r.time ?? '') ?? {}) });
    patch(i, { created: true });
  }

  return (
    <Sheet title="Dokument scannen" onClose={onClose}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        aria-label="Foto des Dokuments"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {text === null && !busy && (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Fotografiere einen Brief oder eine Einladung. Die App liest den Text direkt auf deinem
            Gerät und sucht nach Terminen. Das Bild wird nirgends hochgeladen.
          </p>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="h-12 rounded-xl bg-brand-600 font-semibold text-white active:bg-brand-700"
          >
            📷 Foto aufnehmen oder wählen
          </button>
        </div>
      )}
      {busy && (
        <div role="status" className="py-4 text-sm">
          <p>{busy.text}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${Math.round(busy.fraction * 100)}%` }}
            />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {text !== null && (
        <div className="flex flex-col gap-3 pb-2">
          {rows.length === 0 ? (
            <p className="text-sm">Ich habe keinen Termin mit Datum gefunden.</p>
          ) : (
            <>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {rows.length === 1 ? 'Ein Termin gefunden.' : `${rows.length} Termine gefunden.`}{' '}
                Prüfe die Angaben und tippe auf «Anlegen».
              </p>
              <ul className="flex flex-col gap-3">
                {rows.map((r, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <input
                      aria-label="Titel"
                      value={r.title}
                      onChange={(e) => patch(i, { title: e.target.value })}
                      className={`${field} w-full`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="date"
                        aria-label="Datum"
                        value={r.date}
                        onChange={(e) => patch(i, { date: e.target.value })}
                        className={`${field} flex-1`}
                      />
                      <input
                        type="time"
                        aria-label="Uhrzeit"
                        value={r.time ?? ''}
                        onChange={(e) => patch(i, { time: e.target.value || null })}
                        className={`${field} w-28`}
                      />
                    </div>
                    <p className="line-clamp-2 text-xs whitespace-pre-line text-slate-600 dark:text-slate-400">
                      «{r.snippet}»
                    </p>
                    <button
                      type="button"
                      disabled={r.created || !r.title.trim() || !r.date}
                      onClick={() => add(i)}
                      className="h-10 rounded-lg bg-brand-600 font-medium text-white disabled:bg-slate-300 disabled:text-slate-700 dark:disabled:bg-slate-700 dark:disabled:text-slate-300"
                    >
                      {r.created ? '✓ Angelegt' : 'Anlegen'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <details className="text-xs text-slate-600 dark:text-slate-400">
            <summary className="cursor-pointer py-1">Erkannten Text anzeigen</summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap dark:bg-slate-900">
              {text || '(kein Text erkannt)'}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => {
              setText(null);
              setRows([]);
              input.current?.click();
            }}
            className="h-10 rounded-lg bg-slate-100 font-medium dark:bg-slate-700"
          >
            Weiteres Foto
          </button>
        </div>
      )}
    </Sheet>
  );
}
