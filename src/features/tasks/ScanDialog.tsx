import { useRef, useState } from 'react';
import { useCalendarDefault } from '../settings/useCalendarDefault';
import { Sheet } from '../../components/Sheet';
import { useCreateTask } from '../../lib/api';
import { buildDue } from '../../lib/dates';
import { findAppointments, type FoundAppointment } from '../../lib/docScan';
import { recognizeText } from '../../lib/ocr';
import { ScanAiError, scanWithAi } from '../../lib/scanAi';

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
  const calendarDefault = useCalendarDefault();
  const input = useRef<HTMLInputElement>(null);
  const wantAi = useRef(true);
  const [busy, setBusy] = useState<{ text: string; fraction: number } | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<'ai' | 'ocr'>('ai');
  const [notice, setNotice] = useState('');

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    setNotice('');
    setBusy({ text: 'Wird vorbereitet …', fraction: 0 });
    try {
      let ai: FoundAppointment[] | null = null;
      try {
        if (!wantAi.current) throw new ScanAiError('Ohne KI gewählt', 'declined');
        setBusy({ text: 'KI liest das Dokument …', fraction: 0.5 });
        ai = await scanWithAi(file);
      } catch (e) {
        // Ohne KI (nicht eingerichtet, Limit erreicht, offline) liest die Texterkennung im Gerät
        const code = e instanceof ScanAiError ? e.code : 'failed';
        if (code !== 'declined')
          setNotice(
            {
              not_configured:
                'Die KI ist nicht eingerichtet – es wurde die einfache Texterkennung verwendet.',
              rate_limit:
                'Das KI-Limit ist erreicht – es wurde die einfache Texterkennung verwendet.',
              offline: 'Du bist offline – es wurde die einfache Texterkennung verwendet.',
              declined: '',
              failed:
                'Die KI hat nicht geantwortet – es wurde die einfache Texterkennung verwendet.',
            }[code],
          );
      }
      if (ai) {
        setSource('ai');
        setText('');
        setRows(ai.map((a) => ({ ...a, created: false })));
      } else {
        setSource('ocr');
        const result = await recognizeText(file, (status, fraction) =>
          setBusy({ text: STATUS_DE[status] ?? 'Wird verarbeitet …', fraction }),
        );
        setText(result);
        setRows(findAppointments(result).map((a) => ({ ...a, created: false })));
      }
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
    create({
      list_id: listId,
      title: r.title.trim(),
      ...(buildDue(r.date, r.time ?? '') ?? {}),
      in_calendar: calendarDefault,
    });
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
            Fotografiere einen Brief oder eine Einladung und wähle, wie er gelesen werden soll:
          </p>
          <button
            type="button"
            onClick={() => {
              wantAi.current = true;
              input.current?.click();
            }}
            className="rounded-xl bg-brand-600 px-4 py-3 text-left text-white active:bg-brand-700"
          >
            <span className="block font-semibold">✨ Mit KI lesen (genauer)</span>
            <span className="block text-xs text-indigo-100">
              Google Gemini, Gratis-Kontingent. Das Foto wird kurz an Google gesendet und nicht
              gespeichert.
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              wantAi.current = false;
              input.current?.click();
            }}
            className="rounded-xl border border-slate-300 px-4 py-3 text-left dark:border-slate-600"
          >
            <span className="block font-semibold">📱 Nur auf diesem Gerät lesen</span>
            <span className="block text-xs text-slate-600 dark:text-slate-400">
              Das Foto verlässt dein Gerät nicht. Weniger genau, funktioniert auch offline.
            </span>
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
          {notice && (
            <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
              {notice}
            </p>
          )}
          {source === 'ai' && rows.length > 0 && (
            <p className="text-xs text-slate-600 dark:text-slate-400">✨ Von der KI gelesen</p>
          )}
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
                    {r.snippet && (
                      <p className="line-clamp-2 text-xs whitespace-pre-line text-slate-600 dark:text-slate-400">
                        {source === 'ai' ? `ℹ️ ${r.snippet}` : `«${r.snippet}»`}
                      </p>
                    )}
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
          {source === 'ocr' && (
            <details className="text-xs text-slate-600 dark:text-slate-400">
              <summary className="cursor-pointer py-1">Erkannten Text anzeigen</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-100 p-2 whitespace-pre-wrap dark:bg-slate-900">
                {text || '(kein Text erkannt)'}
              </pre>
            </details>
          )}
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
