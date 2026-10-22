// Import und Export: CSV (Excel-tauglich) und vollständiges JSON-Backup.
import { BOM, parseCsv, stripBom, toCsv } from './csv';
import { toDateInput } from './dates';
import { parseQuickInput } from './quickParse';
import { describeRepeat, parseRrule } from './recurrence';
import type { Priority, SavedFilter, Status, Task, Template, TodoList } from './types';

export interface ImportTask {
  /** Name der Liste (leer = Standardliste beim Import) */
  list: string | null;
  title: string;
  notes_md: string;
  due_at: string | null;
  due_all_day: boolean;
  duration_min: number | null;
  priority: Priority;
  status: Status;
  tags: string[];
  subtasks: { title: string; done: boolean }[];
  rrule: string | null;
  repeat_mode: 'fixed' | 'after_completion';
  repeat_after_days: number | null;
  completed_at: string | null;
}

export interface ParseError {
  /** Zeilennummer in der Datei (bei CSV inkl. Kopfzeile) bzw. laufende Nummer (JSON) */
  line: number;
  message: string;
}

export interface ImportData {
  tasks: ImportTask[];
  lists: { name: string; emoji?: string; color?: string }[];
  templates: { name: string; payload: unknown }[];
  savedFilters: { name: string; filter: unknown }[];
  errors: ParseError[];
}

export const MAX_IMPORT_TASKS = 2000;

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${toDateInput(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ================================================================= CSV-Export
export const CSV_HEADER = [
  'Liste',
  'Titel',
  'Notizen',
  'Fällig',
  'Uhrzeit',
  'Dauer (Min)',
  'Priorität',
  'Status',
  'Tags',
  'Unteraufgaben',
  'Wiederholung',
  'Regel',
  'Erledigt am',
];

const PRIORITY_DE: Record<Priority, string> = { high: 'Hoch', medium: 'Mittel', low: 'Tief' };
const STATUS_DE: Record<Status, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  done: 'Erledigt',
};

const dateDe = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

export function tasksToCsv(tasks: Task[], listName: (id: string) => string): string {
  const rows = tasks.map((t) => {
    const due = t.due_at ? new Date(t.due_at) : null;
    const rule =
      t.repeat_mode === 'after_completion' && t.repeat_after_days
        ? `after:${t.repeat_after_days}`
        : (t.rrule ?? '');
    return [
      listName(t.list_id),
      t.title,
      t.notes_md,
      due ? dateDe(due) : '',
      due && !t.due_all_day ? `${pad(due.getHours())}:${pad(due.getMinutes())}` : '',
      t.duration_min ? String(t.duration_min) : '',
      PRIORITY_DE[t.priority],
      STATUS_DE[t.status],
      t.tags.map((x) => x.name).join(', '),
      t.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`).join(' | '),
      describeRepeat(t),
      rule,
      t.completed_at ? stamp(new Date(t.completed_at)) : '',
    ];
  });
  return BOM + toCsv([CSV_HEADER, ...rows]);
}

// ================================================================= CSV-Import
const ALIASES: Record<string, string[]> = {
  list: ['liste', 'list', 'projekt', 'project'],
  title: ['titel', 'title', 'aufgabe', 'task', 'name', 'pendenz', 'betreff', 'subject', 'content'],
  notes: ['notizen', 'notiz', 'notes', 'beschreibung', 'description', 'bemerkung'],
  date: [
    'fällig',
    'faellig',
    'fälligkeit',
    'faelligkeit',
    'datum',
    'due',
    'due date',
    'date',
    'termin',
    'fälligkeitsdatum',
  ],
  time: ['uhrzeit', 'zeit', 'time', 'due time'],
  duration: ['dauer (min)', 'dauer', 'duration'],
  priority: ['priorität', 'prioritaet', 'priority', 'prio'],
  status: ['status', 'zustand'],
  tags: ['tags', 'tag', 'labels', 'label', 'schlagwörter'],
  subtasks: ['unteraufgaben', 'unteraufgabe', 'subtasks', 'checkliste'],
  repeat: ['wiederholung', 'repeat', 'recurrence'],
  rule: ['regel', 'rrule'],
  done: ['erledigt am', 'completed', 'completed at', 'erledigt'],
};

function columnIndex(header: string[]): Record<string, number> {
  const lower = header.map((h) => h.trim().toLocaleLowerCase('de-CH'));
  const out: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const i = lower.findIndex((h) => names.includes(h));
    if (i >= 0) out[key] = i;
  }
  return out;
}

function parseDate(text: string): { y: number; m: number; d: number } | null {
  const t = text.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(t);
  if (m)
    return check(
      m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]),
      Number(m[2]),
      Number(m[1]),
    );
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return check(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); // 11/15/2026 (US)
  if (m) return check(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}
function check(y: number, m: number, d: number) {
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? { y, m, d }
    : null;
}

const PRIORITY_WORDS: Record<string, Priority> = {
  hoch: 'high',
  high: 'high',
  h: 'high',
  '1': 'high',
  dringend: 'high',
  mittel: 'medium',
  medium: 'medium',
  m: 'medium',
  '2': 'medium',
  normal: 'medium',
  tief: 'low',
  niedrig: 'low',
  low: 'low',
  t: 'low',
  '3': 'low',
};
const STATUS_WORDS: Record<string, Status> = {
  offen: 'open',
  open: 'open',
  todo: 'open',
  neu: 'open',
  'in arbeit': 'in_progress',
  in_arbeit: 'in_progress',
  'in progress': 'in_progress',
  in_progress: 'in_progress',
  doing: 'in_progress',
  wartend: 'waiting',
  waiting: 'waiting',
  blockiert: 'waiting',
  blocked: 'waiting',
  erledigt: 'done',
  done: 'done',
  fertig: 'done',
  abgeschlossen: 'done',
  completed: 'done',
  x: 'done',
  ja: 'done',
  true: 'done',
};

function splitList(text: string, separators: RegExp): string[] {
  return text
    .split(separators)
    .map((s) => s.trim().replace(/^#/, ''))
    .filter(Boolean);
}

export function parseTasksCsv(text: string): ImportData {
  const rows = parseCsv(text);
  const out: ImportData = { tasks: [], lists: [], templates: [], savedFilters: [], errors: [] };
  if (rows.length === 0) {
    out.errors.push({ line: 1, message: 'Die Datei ist leer.' });
    return out;
  }
  const col = columnIndex(rows[0]);
  if (col.title === undefined) {
    out.errors.push({
      line: 1,
      message: 'Keine Spalte «Titel» gefunden (erwartet z. B. Titel, Aufgabe oder Name).',
    });
    return out;
  }
  const cell = (row: string[], key: string) =>
    col[key] === undefined ? '' : (row[col[key]] ?? '').trim();

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const title = cell(row, 'title');
    if (!title) {
      out.errors.push({ line, message: 'Titel fehlt – Zeile übersprungen.' });
      return;
    }
    const task: ImportTask = {
      list: cell(row, 'list') || null,
      title: title.slice(0, 300),
      notes_md: row[col.notes] ?? '',
      due_at: null,
      due_all_day: true,
      duration_min: null,
      priority: 'medium',
      status: 'open',
      tags: [],
      subtasks: [],
      rrule: null,
      repeat_mode: 'fixed',
      repeat_after_days: null,
      completed_at: null,
    };

    const dateText = cell(row, 'date');
    if (dateText) {
      const d = parseDate(dateText);
      if (!d)
        out.errors.push({
          line,
          message: `Datum «${dateText}» nicht erkannt (erwartet TT.MM.JJJJ oder JJJJ-MM-TT) – ohne Datum importiert.`,
        });
      else {
        const time = /^(\d{1,2}):(\d{2})/.exec(
          cell(row, 'time') || /[T ](\d{1,2}:\d{2})/.exec(dateText)?.[1] || '',
        );
        const hh = time ? Number(time[1]) : 0;
        const mm = time ? Number(time[2]) : 0;
        if (time && hh < 24 && mm < 60) {
          task.due_at = new Date(d.y, d.m - 1, d.d, hh, mm).toISOString();
          task.due_all_day = false;
        } else task.due_at = new Date(d.y, d.m - 1, d.d).toISOString();
      }
    }

    const duration = Number(cell(row, 'duration'));
    if (Number.isFinite(duration) && duration > 0) task.duration_min = Math.round(duration);

    const prio = cell(row, 'priority').toLocaleLowerCase('de-CH');
    if (prio) {
      if (PRIORITY_WORDS[prio]) task.priority = PRIORITY_WORDS[prio];
      else
        out.errors.push({
          line,
          message: `Priorität «${prio}» nicht erkannt – «Mittel» verwendet.`,
        });
    }

    const status = cell(row, 'status').toLocaleLowerCase('de-CH');
    if (status) {
      if (STATUS_WORDS[status]) task.status = STATUS_WORDS[status];
      else
        out.errors.push({ line, message: `Status «${status}» nicht erkannt – «Offen» verwendet.` });
    }
    const doneCell = cell(row, 'done');
    if (doneCell && task.status !== 'done') {
      const when = parseDate(doneCell);
      if (when || STATUS_WORDS[doneCell.toLocaleLowerCase('de-CH')] === 'done')
        task.status = 'done';
    }
    if (task.status === 'done') {
      const when = parseDate(doneCell);
      task.completed_at = when ? new Date(when.y, when.m - 1, when.d, 12).toISOString() : null;
    }

    task.tags = splitList(cell(row, 'tags'), /[,|;]/);
    task.subtasks = splitList(row[col.subtasks] ?? '', /\s*\|\s*|\r?\n/)
      .map((s) => {
        const done = /^(\[x\]|☑|✓)/i.test(s);
        return { title: s.replace(/^(\[[ x]\]|☑|☐|✓)\s*/i, '').trim(), done };
      })
      .filter((s) => s.title);

    // Wiederholung: bevorzugt die technische Regel, sonst Text wie «jeden Montag»
    const rule = cell(row, 'rule');
    const repeatText = cell(row, 'repeat');
    if (/^after:\d+$/.test(rule))
      Object.assign(task, {
        repeat_mode: 'after_completion',
        repeat_after_days: Number(rule.slice(6)),
      });
    else if (rule && parseRrule(rule)) task.rrule = rule.replace(/^RRULE:/i, '');
    else if (repeatText) {
      const r = parseQuickInput(repeatText, { now: new Date(), lists: [], members: [] }).repeat;
      if (r) Object.assign(task, r);
      else
        out.errors.push({
          line,
          message: `Wiederholung «${repeatText}» nicht erkannt – ohne Wiederholung importiert.`,
        });
    }
    if (!task.due_at && (task.rrule || task.repeat_after_days)) {
      task.rrule = null;
      task.repeat_mode = 'fixed';
      task.repeat_after_days = null;
    }
    out.tasks.push(task);
  });

  if (out.tasks.length > MAX_IMPORT_TASKS) {
    out.errors.push({
      line: 0,
      message: `Es werden höchstens ${MAX_IMPORT_TASKS} Pendenzen pro Import verarbeitet.`,
    });
    out.tasks.length = MAX_IMPORT_TASKS;
  }
  return out;
}

// ================================================================= JSON-Backup
export function buildBackup(input: {
  lists: TodoList[];
  tasks: Task[];
  templates: Template[];
  savedFilters: SavedFilter[];
}): string {
  const name = (id: string) => input.lists.find((l) => l.id === id)?.name ?? 'Importiert';
  const backup = {
    app: 'pendenzen',
    version: 1,
    exportedAt: new Date().toISOString(),
    lists: input.lists.map((l) => ({ name: l.name, emoji: l.emoji, color: l.color })),
    tasks: input.tasks.map((t) => ({
      list: name(t.list_id),
      title: t.title,
      notes_md: t.notes_md,
      due_at: t.due_at,
      due_all_day: t.due_all_day,
      duration_min: t.duration_min,
      priority: t.priority,
      status: t.status,
      tags: t.tags.map((x) => x.name),
      subtasks: t.subtasks.map((s) => ({ title: s.title, done: s.done })),
      rrule: t.rrule,
      repeat_mode: t.repeat_mode,
      repeat_after_days: t.repeat_after_days,
      completed_at: t.completed_at,
    })),
    templates: input.templates.map((t) => ({ name: t.name, payload: t.payload })),
    savedFilters: input.savedFilters.map((f) => ({ name: f.name, filter: f.filter })),
  };
  return JSON.stringify(backup, null, 2);
}

const isPriority = (v: unknown): v is Priority => v === 'low' || v === 'medium' || v === 'high';
const isStatus = (v: unknown): v is Status =>
  v === 'open' || v === 'in_progress' || v === 'waiting' || v === 'done';
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export function parseBackup(text: string): ImportData {
  const out: ImportData = { tasks: [], lists: [], templates: [], savedFilters: [], errors: [] };
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stripBom(text));
  } catch {
    out.errors.push({ line: 0, message: 'Die Datei ist kein gültiges JSON.' });
    return out;
  }
  if (data.app !== 'pendenzen' || !Array.isArray(data.tasks)) {
    out.errors.push({
      line: 0,
      message: 'Das ist kein Pendenzen-Backup (Feld «app» oder «tasks» fehlt).',
    });
    return out;
  }

  (data.tasks as Record<string, unknown>[]).forEach((raw, i) => {
    const line = i + 1;
    if (typeof raw?.title !== 'string' || !raw.title.trim()) {
      out.errors.push({ line, message: 'Titel fehlt – Pendenz übersprungen.' });
      return;
    }
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    out.tasks.push({
      list: typeof raw.list === 'string' && raw.list ? raw.list : null,
      title: raw.title.trim().slice(0, 300),
      notes_md: typeof raw.notes_md === 'string' ? raw.notes_md : '',
      due_at: isIso(raw.due_at) ? raw.due_at : null,
      due_all_day: raw.due_all_day === true,
      duration_min:
        typeof raw.duration_min === 'number' && raw.duration_min > 0 ? raw.duration_min : null,
      priority: isPriority(raw.priority) ? raw.priority : 'medium',
      status: isStatus(raw.status) ? raw.status : 'open',
      tags: strings(raw.tags),
      subtasks: (Array.isArray(raw.subtasks) ? raw.subtasks : [])
        .map((s) => s as { title?: unknown; done?: unknown })
        .filter((s) => typeof s.title === 'string' && s.title.trim())
        .map((s) => ({ title: String(s.title).trim(), done: s.done === true })),
      rrule: typeof raw.rrule === 'string' && parseRrule(raw.rrule) ? raw.rrule : null,
      repeat_mode: raw.repeat_mode === 'after_completion' ? 'after_completion' : 'fixed',
      repeat_after_days:
        typeof raw.repeat_after_days === 'number' && raw.repeat_after_days > 0
          ? raw.repeat_after_days
          : null,
      completed_at: isIso(raw.completed_at) ? raw.completed_at : null,
    });
  });
  const named = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter(
      (x): x is Record<string, unknown> => typeof (x as { name?: unknown })?.name === 'string',
    );
  out.lists = named(data.lists).map((l) => ({
    name: String(l.name),
    emoji: typeof l.emoji === 'string' ? l.emoji : undefined,
    color: typeof l.color === 'string' ? l.color : undefined,
  }));
  out.templates = named(data.templates).map((t) => ({ name: String(t.name), payload: t.payload }));
  out.savedFilters = named(data.savedFilters).map((f) => ({
    name: String(f.name),
    filter: f.filter,
  }));
  if (out.tasks.length > MAX_IMPORT_TASKS) {
    out.errors.push({
      line: 0,
      message: `Es werden höchstens ${MAX_IMPORT_TASKS} Pendenzen pro Import verarbeitet.`,
    });
    out.tasks.length = MAX_IMPORT_TASKS;
  }
  return out;
}

/** CSV oder JSON, je nach Inhalt */
export function parseImportFile(name: string, text: string): ImportData {
  const trimmed = stripBom(text).trimStart();
  return name.toLowerCase().endsWith('.json') || trimmed.startsWith('{')
    ? parseBackup(text)
    : parseTasksCsv(text);
}
