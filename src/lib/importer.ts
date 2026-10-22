// Überträgt eingelesene Daten (siehe exchange.ts) in die Datenbank. Nur mit Verbindung.
import type { ImportData } from './exchange';
import { supabase } from './supabase';
import { normalizePayload } from './templates';
import type { TodoList } from './types';

export interface ImportSummary {
  tasks: number;
  subtasks: number;
  lists: number;
  templates: number;
  filters: number;
}

const CHUNK = 100;
const lower = (s: string) => s.toLocaleLowerCase('de-CH').trim();

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function check<T>(
  result: PromiseLike<{ data: T; error: { message: string } | null }>,
  what: string,
): Promise<NonNullable<T>> {
  const { data, error } = await result;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}

export async function runImport(
  data: ImportData,
  opts: { defaultListId: string; writableLists: TodoList[]; onProgress?: (text: string) => void },
): Promise<ImportSummary> {
  const progress = opts.onProgress ?? (() => undefined);
  const summary: ImportSummary = { tasks: 0, subtasks: 0, lists: 0, templates: 0, filters: 0 };

  // ---- Listen: vorhandene nach Namen verwenden, fehlende anlegen
  const listIds = new Map(opts.writableLists.map((l) => [lower(l.name), l.id]));
  const meta = new Map(data.lists.map((l) => [lower(l.name), l]));
  const missing = [
    ...new Set(
      data.tasks.map((t) => t.list).filter((n): n is string => !!n && !listIds.has(lower(n))),
    ),
  ];
  for (const name of missing) {
    progress(`Liste «${name}» anlegen …`);
    const m = meta.get(lower(name));
    const created = await check(
      supabase
        .from('lists')
        .insert({ name: name.slice(0, 80), emoji: m?.emoji ?? '📋', color: m?.color ?? '#6366f1' })
        .select('id')
        .single(),
      'Liste anlegen',
    );
    listIds.set(lower(name), created.id);
    summary.lists++;
  }
  const listFor = (name: string | null) =>
    name ? (listIds.get(lower(name)) ?? opts.defaultListId) : opts.defaultListId;

  // ---- Pendenzen (Kennungen vorab vergeben, damit Unteraufgaben und Tags zugeordnet werden können)
  const rows = data.tasks.map((t) => ({
    id: crypto.randomUUID(),
    list_id: listFor(t.list),
    title: t.title,
    notes_md: t.notes_md,
    due_at: t.due_at,
    due_all_day: t.due_all_day,
    duration_min: t.duration_min,
    priority: t.priority,
    status: t.status,
    rrule: t.rrule,
    repeat_mode: t.repeat_mode,
    repeat_after_days: t.repeat_after_days,
    completed_at: t.completed_at,
  }));
  for (const [i, part] of chunks(rows).entries()) {
    progress(`Pendenzen speichern … ${Math.min((i + 1) * CHUNK, rows.length)} von ${rows.length}`);
    await check(supabase.from('tasks').insert(part), 'Pendenzen speichern');
    summary.tasks += part.length;
  }

  // ---- Unteraufgaben
  const subtaskRows = data.tasks.flatMap((t, i) =>
    t.subtasks.map((s, position) => ({
      task_id: rows[i].id,
      title: s.title.slice(0, 300),
      done: s.done,
      position,
    })),
  );
  for (const part of chunks(subtaskRows)) {
    progress(
      `Unteraufgaben speichern … ${summary.subtasks + part.length} von ${subtaskRows.length}`,
    );
    await check(supabase.from('subtasks').insert(part), 'Unteraufgaben speichern');
    summary.subtasks += part.length;
  }

  // ---- Tags (pro Liste)
  const tagsByList = new Map<string, Set<string>>();
  data.tasks.forEach((t, i) => {
    for (const tag of t.tags)
      tagsByList.set(
        rows[i].list_id,
        (tagsByList.get(rows[i].list_id) ?? new Set()).add(tag.slice(0, 40)),
      );
  });
  const tagIds = new Map<string, string>(); // «liste|tag» → Tag-ID
  for (const [listId, names] of tagsByList) {
    progress('Tags speichern …');
    const existing = (await check(
      supabase.from('tags').select('id, name').eq('list_id', listId),
      'Tags lesen',
    )) as { id: string; name: string }[];
    for (const t of existing) tagIds.set(`${listId}|${lower(t.name)}`, t.id);
    const fresh = [...names].filter((n) => !tagIds.has(`${listId}|${lower(n)}`));
    if (fresh.length) {
      const created = (await check(
        supabase
          .from('tags')
          .insert(fresh.map((name) => ({ list_id: listId, name })))
          .select('id, name'),
        'Tags anlegen',
      )) as { id: string; name: string }[];
      for (const t of created) tagIds.set(`${listId}|${lower(t.name)}`, t.id);
    }
  }
  const taskTags = data.tasks.flatMap((t, i) =>
    [...new Set(t.tags.map((x) => lower(x.slice(0, 40))))]
      .map((name) => tagIds.get(`${rows[i].list_id}|${name}`))
      .filter((id): id is string => !!id)
      .map((tag_id) => ({ task_id: rows[i].id, tag_id })),
  );
  for (const part of chunks(taskTags))
    await check(supabase.from('task_tags').insert(part), 'Tags zuordnen');

  // ---- Vorlagen und Intelligente Listen (aus einem Backup)
  for (const t of data.templates) {
    await check(
      supabase
        .from('templates')
        .insert({ name: t.name.slice(0, 80), payload: normalizePayload(t.payload) }),
      'Vorlage speichern',
    );
    summary.templates++;
  }
  for (const f of data.savedFilters) {
    await check(
      supabase.from('saved_filters').insert({ name: f.name.slice(0, 80), filter: f.filter ?? {} }),
      'Filter speichern',
    );
    summary.filters++;
  }
  return summary;
}
