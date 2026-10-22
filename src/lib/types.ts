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
  completed_at: string | null;
  deleted_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  subtasks: Subtask[];
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
