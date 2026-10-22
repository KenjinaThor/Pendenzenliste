import { useMemo } from 'react';
import { useLists, useTasks } from '../../lib/api';
import { usePermissions } from '../sharing/usePermissions';

/** Auswahlmöglichkeiten für die Filterleiste (alle Tags, Personen und Listen, die man sieht). */
export function useFilterOptions() {
  const { data: tasks = [] } = useTasks();
  const { data: lists = [] } = useLists();
  const { members } = usePermissions();
  return useMemo(() => {
    const tags = [...new Set(tasks.flatMap((t) => t.tags.map((x) => x.name)))].sort((a, b) =>
      a.localeCompare(b, 'de-CH'),
    );
    const people = [
      ...new Map(
        members
          .filter((m) => m.profiles)
          .map((m) => [m.user_id, { id: m.user_id, name: m.profiles!.name }]),
      ).values(),
    ];
    return { tags, people, lists };
  }, [tasks, lists, members]);
}
