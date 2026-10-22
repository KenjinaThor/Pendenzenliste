import { createContext, useContext, useState, type ReactNode } from 'react';
import { TaskEditor } from './TaskEditor';
import { ListEditor } from '../lists/ListEditor';

export interface NewTaskDefaults {
  list_id?: string;
  /** vorbelegtes Datum (YYYY-MM-DD) */
  date?: string;
  /** Pendenz aus dieser Vorlage vorbelegen */
  templateId?: string;
}

type Editing =
  | { kind: 'task'; taskId: string | null; defaults?: NewTaskDefaults }
  | { kind: 'list'; listId: string | null };

interface EditorApi {
  openTask: (taskId: string) => void;
  newTask: (defaults?: NewTaskDefaults) => void;
  openList: (listId: string | null) => void;
}

const EditorContext = createContext<EditorApi>({ openTask() {}, newTask() {}, openList() {} });

export function EditorProvider({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);

  const api: EditorApi = {
    openTask: (taskId) => setEditing({ kind: 'task', taskId }),
    newTask: (defaults) => setEditing({ kind: 'task', taskId: null, defaults }),
    openList: (listId) => setEditing({ kind: 'list', listId }),
  };

  return (
    <EditorContext.Provider value={api}>
      {children}
      {editing?.kind === 'task' && (
        <TaskEditor
          key={editing.taskId ?? 'new'}
          taskId={editing.taskId}
          defaults={editing.defaults}
          onClose={close}
        />
      )}
      {editing?.kind === 'list' && (
        <ListEditor key={editing.listId ?? 'new'} listId={editing.listId} onClose={close} />
      )}
    </EditorContext.Provider>
  );
}

export const useEditor = () => useContext(EditorContext);
