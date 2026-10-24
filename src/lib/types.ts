export type Priority = 'low' | 'medium' | 'high';
export type Status = 'open' | 'in_progress' | 'waiting' | 'done';

export interface Subtask {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: string;
  list_id: string;
  title: string;
  notes_md: string;
  due_at: string | null;
  due_all_day: boolean;
  duration_min: number | null;
  priority: Priority;
  status: Status;
  assignee_id: string | null;
  rrule: string | null;
  repeat_mode: 'fixed' | 'after_completion';
  repeat_after_days: number | null;
  /** Tag (YYYY-MM-DD), an dem die Pendenz im Tagesfokus «Meine 3» steht */
  focus_date: string | null;
  /** erscheint im Kalender-Abo (fehlt bei älteren Datenbanken = ja) */
  in_calendar?: boolean;
  completed_at: string | null;
  deleted_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
  tags: Tag[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface TodoList {
  id: string;
  owner_id: string;
  name: string;
  color: string;
  emoji: string;
  position: number;
  archived_at: string | null;
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Tief',
};

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Offen',
  in_progress: 'In Arbeit',
  waiting: 'Wartend',
  done: 'Erledigt',
};

export type Role = 'viewer' | 'editor' | 'owner';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Besitzer',
  editor: 'Bearbeiter',
  viewer: 'Leser',
};

export interface Profile {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
}

export interface Member {
  list_id: string;
  user_id: string;
  role: Role;
  profiles: Profile | null;
}

export interface Invite {
  id: string;
  list_id: string;
  email: string | null;
  role: Role;
  expires_at: string;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  profiles: { name: string; avatar_url: string | null } | null;
}

export interface ActivityEntry {
  id: number;
  task_id: string;
  actor_id: string | null;
  action: 'created' | 'updated' | 'commented';
  diff: Record<string, { from: unknown; to: unknown }> | { excerpt?: string } | null;
  created_at: string;
  profiles: { name: string } | null;
}

export interface AppNotification {
  id: string;
  kind: 'assigned' | 'mention' | 'test';
  task_id: string | null;
  payload: { task_title?: string; actor_name?: string; excerpt?: string };
  read_at: string | null;
  created_at: string;
}

export interface Reminder {
  id: string;
  task_id: string;
  offset_min: number | null;
  at: string | null;
  fire_at: string | null;
  sent_at: string | null;
}

export interface MyProfile {
  id: string;
  name: string;
  timezone: string;
  canton: string;
  theme: 'system' | 'light' | 'dark';
  daily_digest_time: string | null;
  /** Standard für neue Pendenzen: im Kalender-Abo anzeigen (fehlt bei älteren Datenbanken = ja) */
  calendar_default?: boolean;
}

export interface SavedFilter {
  id: string;
  name: string;
  filter: unknown;
}

/** Inhalt einer Vorlage: ein wiederverwendbares Pendenzen-Set (z. B. «Ferienvorbereitung» mit 10 Unterpunkten) */
export interface TemplatePayload {
  title: string;
  notes_md: string;
  priority: Priority;
  duration_min: number | null;
  tags: string[];
  subtasks: string[];
}

export interface Template {
  id: string;
  name: string;
  payload: TemplatePayload;
}

export interface Attachment {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  mime: string | null;
  size_bytes: number;
  created_at: string;
}
