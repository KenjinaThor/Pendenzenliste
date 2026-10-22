import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Sheet } from '../../components/Sheet';
import { useDeleteTemplate, useSaveTemplate, useTemplates } from '../../lib/api';
import { parseSubtaskLines } from '../../lib/templates';
import { PRIORITY_LABEL, type Priority, type Template } from '../../lib/types';
import { useEditor } from '../tasks/EditorContext';

const field = 'h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

function TemplateEditor({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const save = useSaveTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [title, setTitle] = useState(template?.payload.title ?? '');
  const [notes, setNotes] = useState(template?.payload.notes_md ?? '');
  const [priority, setPriority] = useState<Priority>(template?.payload.priority ?? 'medium');
  const [tags, setTags] = useState((template?.payload.tags ?? []).join(', '));
  const [subtasks, setSubtasks] = useState((template?.payload.subtasks ?? []).join('\n'));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await save.mutateAsync({
      id: template?.id,
      name: name.trim(),
      payload: {
        title: title.trim() || name.trim(),
        notes_md: notes,
        priority,
        duration_min: template?.payload.duration_min ?? null,
        tags: tags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
        subtasks: parseSubtaskLines(subtasks),
      },
    });
    onClose();
  }

  return (
    <Sheet title={template ? 'Vorlage bearbeiten' : 'Neue Vorlage'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 pt-2">
        <input
          autoFocus
          aria-label="Name der Vorlage"
          placeholder="Name der Vorlage (z. B. Ferienvorbereitung)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
          maxLength={80}
        />
        <input
          aria-label="Titel der Pendenz"
          placeholder="Titel der Pendenz (leer = Name)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={field}
        />
        <textarea
          aria-label="Notizen"
          placeholder="Notizen"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
        />
        <div className="grid grid-cols-3 gap-2" role="group" aria-label="Priorität">
          {(['high', 'medium', 'low'] as Priority[]).map((p) => (
            <button
              type="button"
              key={p}
              aria-pressed={priority === p}
              onClick={() => setPriority(p)}
              className={`h-11 rounded-xl text-sm font-medium ${priority === p ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <input
          aria-label="Tags"
          placeholder="Tags, durch Komma getrennt"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className={field}
        />
        <textarea
          aria-label="Unteraufgaben"
          placeholder={'Unteraufgaben – eine pro Zeile\nPass prüfen\nKoffer packen'}
          rows={8}
          value={subtasks}
          onChange={(e) => setSubtasks(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900"
        />
        {save.error && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            {(save.error as Error).message}
          </p>
        )}
        <button
          disabled={!name.trim() || save.isPending}
          className="h-12 rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
        >
          Speichern
        </button>
      </form>
    </Sheet>
  );
}

export function TemplatesPage() {
  const { data: templates = [], isPending } = useTemplates();
  const del = useDeleteTemplate();
  const { newTask } = useEditor();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="📑 Vorlagen"
        subtitle="Wiederverwendbare Pendenzen mit Unteraufgaben"
        action={
          <button
            onClick={() => setEditing('new')}
            className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white"
          >
            ＋ Neu
          </button>
        }
      />
      {isPending ? (
        <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">Lade …</p>
      ) : templates.length === 0 ? (
        <p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">
          Noch keine Vorlagen. Lege eine an oder speichere eine Pendenz über «Als Vorlage
          speichern».
        </p>
      ) : (
        <ul className="flex flex-col gap-2 px-4 pb-6">
          {templates.map((t) => (
            <li key={t.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
              <p className="font-medium">{t.name}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t.payload.subtasks.length}{' '}
                {t.payload.subtasks.length === 1 ? 'Unteraufgabe' : 'Unteraufgaben'}
                {t.payload.tags.length > 0 && ` · ${t.payload.tags.map((x) => `#${x}`).join(' ')}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => newTask({ templateId: t.id })}
                  className="h-10 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white"
                >
                  Pendenz erstellen
                </button>
                <button
                  onClick={() => setEditing(t)}
                  className="h-10 rounded-xl bg-slate-100 px-4 text-sm font-medium dark:bg-slate-700"
                >
                  Bearbeiten
                </button>
                <button
                  onClick={() => window.confirm(`Vorlage «${t.name}» löschen?`) && del.mutate(t.id)}
                  aria-label={`Vorlage ${t.name} löschen`}
                  className="h-10 rounded-xl px-3 text-sm font-medium text-red-700 dark:text-red-300"
                >
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TemplateEditor
          key={editing === 'new' ? 'new' : editing.id}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
