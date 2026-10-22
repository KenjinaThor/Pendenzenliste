import type { Section } from '../../lib/views';
import { TaskRow } from './TaskRow';

export function TaskSections({
  sections,
  emptyText,
  showList = true,
}: {
  sections: Section[];
  emptyText: string;
  showList?: boolean;
}) {
  if (sections.length === 0) {
    return <p className="px-4 py-12 text-center text-slate-500">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-5 px-4 pb-4">
      {sections.map((s) => (
        <section key={s.key} aria-label={s.title}>
          <h3
            className={`mb-2 px-1 text-sm font-semibold uppercase tracking-wide ${s.tone === 'danger' ? 'text-red-600' : 'text-slate-500'}`}
          >
            {s.title} <span className="font-normal">({s.tasks.length})</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {s.tasks.map((t) => (
              <TaskRow key={t.id} task={t} showList={showList} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
