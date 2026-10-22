import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useLists, useSavedFilters, useTasks, useTemplates } from '../../lib/api';
import { toDateInput } from '../../lib/dates';
import { downloadText } from '../../lib/download';
import { buildBackup, parseImportFile, tasksToCsv, type ImportData } from '../../lib/exchange';
import { runImport, type ImportSummary } from '../../lib/importer';
import { usePermissions } from '../sharing/usePermissions';

const card = 'rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';

export function DataPage() {
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const { data: templates = [] } = useTemplates();
  const { data: savedFilters = [] } = useSavedFilters();
  const perms = usePermissions();
  const qc = useQueryClient();
  const writable = lists.filter((l) => perms.canEdit(l.id));

  const [parsed, setParsed] = useState<{ name: string; data: ImportData } | null>(null);
  const [defaultList, setDefaultList] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = toDateInput(new Date());
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? '';

  async function onFile(file: File | undefined) {
    setResult(null);
    setError(null);
    setParsed(null);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Die Datei ist zu gross (höchstens 5 MB).');
      return;
    }
    setParsed({ name: file.name, data: parseImportFile(file.name, await file.text()) });
  }

  async function doImport() {
    const target = defaultList || writable[0]?.id;
    if (!parsed || !target) return;
    setError(null);
    setBusy('Import startet …');
    try {
      const summary = await runImport(parsed.data, {
        defaultListId: target,
        writableLists: writable,
        onProgress: setBusy,
      });
      setResult(summary);
      setParsed(null);
      await qc.invalidateQueries();
    } catch (e) {
      setError(
        `${(e as Error).message}. Bereits übertragene Pendenzen bleiben erhalten – prüfe die Listen, bevor du es erneut versuchst.`,
      );
    } finally {
      setBusy(null);
    }
  }

  const importable = parsed ? parsed.data.tasks.length : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="📦 Import & Export" />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <section aria-label="Export" className={card}>
          <h2 className="mb-1 font-semibold">Exportieren</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            {tasks.length} Pendenzen in {lists.length} Listen (ohne Papierkorb).
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() =>
                downloadText(`pendenzen-${today}.csv`, tasksToCsv(tasks, listName), 'text/csv')
              }
              className="h-12 rounded-xl bg-brand-600 font-medium text-white"
            >
              Pendenzen als CSV (Excel)
            </button>
            <button
              onClick={() =>
                downloadText(
                  `pendenzen-backup-${today}.json`,
                  buildBackup({ lists, tasks, templates, savedFilters }),
                  'application/json',
                )
              }
              className="h-12 rounded-xl bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
            >
              Vollständiges Backup (JSON)
            </button>
          </div>
        </section>

        <section aria-label="Import" className={card}>
          <h2 className="mb-1 font-semibold">Importieren</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            CSV mit Spalten wie Titel, Fällig, Priorität, Liste, Tags … (Excel, Todoist,
            Notizen-Apps) oder ein Backup aus dieser App.
          </p>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json,text/plain"
            aria-label="Datei auswählen"
            onChange={(e) => void onFile(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:h-11 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:font-medium dark:file:bg-slate-700"
          />

          {parsed && (
            <div className="mt-4 flex flex-col gap-3" role="region" aria-label="Vorschau">
              <p className="font-medium">
                {importable > 0
                  ? `${importable} ${importable === 1 ? 'Pendenz' : 'Pendenzen'} in «${parsed.name}» erkannt`
                  : `In «${parsed.name}» wurden keine Pendenzen erkannt`}
                {parsed.data.templates.length > 0 && `, ${parsed.data.templates.length} Vorlagen`}
                {parsed.data.savedFilters.length > 0 &&
                  `, ${parsed.data.savedFilters.length} Intelligente Listen`}
              </p>
              {parsed.data.errors.length > 0 && (
                <details
                  className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
                  open
                >
                  <summary className="cursor-pointer font-medium">
                    {parsed.data.errors.length}{' '}
                    {parsed.data.errors.length === 1 ? 'Hinweis' : 'Hinweise'}
                  </summary>
                  <ul className="mt-2 list-disc pl-5">
                    {parsed.data.errors.slice(0, 10).map((e, i) => (
                      <li key={i}>
                        {e.line > 0 ? `Zeile ${e.line}: ` : ''}
                        {e.message}
                      </li>
                    ))}
                    {parsed.data.errors.length > 10 && (
                      <li>… und {parsed.data.errors.length - 10} weitere</li>
                    )}
                  </ul>
                </details>
              )}
              {importable > 0 && (
                <>
                  <label className="flex flex-col gap-1 text-sm font-medium">
                    Pendenzen ohne Liste (oder mit unbekannter Liste) kommen in
                    <select
                      value={defaultList || writable[0]?.id || ''}
                      onChange={(e) => setDefaultList(e.target.value)}
                      className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
                    >
                      {writable.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.emoji} {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Listen, die es noch nicht gibt, werden neu angelegt. Importierte Pendenzen
                    werden hinzugefügt; vorhandene bleiben unverändert.
                  </p>
                  <button
                    onClick={() => void doImport()}
                    disabled={busy !== null}
                    className="h-12 rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
                  >
                    {busy ??
                      `${importable} ${importable === 1 ? 'Pendenz' : 'Pendenzen'} importieren`}
                  </button>
                </>
              )}
            </div>
          )}
          {result && (
            <p
              role="status"
              className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
            >
              ✓ {result.tasks} Pendenzen importiert
              {result.subtasks > 0 && `, ${result.subtasks} Unteraufgaben`}
              {result.lists > 0 && `, ${result.lists} neue Listen`}
              {result.templates > 0 && `, ${result.templates} Vorlagen`}
              {result.filters > 0 && `, ${result.filters} Intelligente Listen`}.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-100 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
