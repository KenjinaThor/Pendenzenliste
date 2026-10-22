import { onlineManager } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  attachmentUrl,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from '../../lib/api';
import { formatBytes } from '../../lib/attachments';

const button =
  'flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-medium dark:bg-slate-700';

/** Dateianhänge einer Pendenz: Datei oder Foto hinzufügen, öffnen, löschen (max. 5 MB, nur mit Verbindung). */
export function AttachmentsSection({
  task,
  canEdit,
}: {
  task: { id: string; list_id: string };
  canEdit: boolean;
}) {
  const { data: attachments = [] } = useAttachments(task.id);
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(files: FileList | null) {
    setError(null);
    if (!files?.length) return;
    if (!onlineManager.isOnline()) {
      setError('Anhänge brauchen eine Internetverbindung.');
      return;
    }
    for (const file of Array.from(files)) {
      upload.mutate({ task, file }, { onError: (e) => setError((e as Error).message) });
    }
  }

  async function open(path: string) {
    setError(null);
    try {
      window.open(await attachmentUrl(path), '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section aria-label="Anhänge">
      <p className="mb-2 text-sm font-medium">
        Anhänge{' '}
        {attachments.length > 0 && <span className="text-slate-500">({attachments.length})</span>}
      </p>
      {attachments.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void open(a.storage_path)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left active:bg-slate-100 dark:active:bg-slate-700"
              >
                <span aria-hidden>{a.mime?.startsWith('image/') ? '🖼️' : '📄'}</span>
                <span className="truncate">{a.file_name}</span>
                <span className="shrink-0 text-xs text-slate-500">{formatBytes(a.size_bytes)}</span>
              </button>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Anhang ${a.file_name} löschen`}
                  onClick={() => window.confirm(`«${a.file_name}» löschen?`) && remove.mutate(a)}
                  className="h-9 w-9 text-slate-400"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
            className={button}
          >
            📎 Datei
          </button>
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            disabled={upload.isPending}
            className={button}
          >
            📷 Foto aufnehmen
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            aria-label="Datei anhängen"
            accept="image/*,application/pdf"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInput}
            type="file"
            hidden
            aria-label="Foto aufnehmen"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}
      {upload.isPending && (
        <p role="status" className="mt-2 text-sm text-slate-500">
          Lade hoch …
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">Fotos und PDF, höchstens 5 MB pro Datei.</p>
    </section>
  );
}
