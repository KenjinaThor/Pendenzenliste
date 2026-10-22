import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useTasks } from '../../lib/api';
import { searchTasks } from '../../lib/views';
import { TaskSections } from '../tasks/TaskSections';

export function SearchPage() {
  const { data: tasks = [] } = useTasks();
  const [query, setQuery] = useState('');
  const results = searchTasks(tasks, query);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="🔍 Suche" />
      <div className="px-4 pb-3">
        <input
          autoFocus
          type="search"
          aria-label="Suchen"
          placeholder="Titel, Notizen, Unteraufgaben …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          data-search-input
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm"
        />
      </div>
      <TaskSections
        sections={results.length ? [{ key: 'r', title: `Treffer`, tasks: results }] : []}
        emptyText={query.trim() ? 'Keine Treffer.' : 'Tippe, um alle Pendenzen zu durchsuchen.'}
      />
    </div>
  );
}
