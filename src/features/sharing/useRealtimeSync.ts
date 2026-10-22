import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Tabelle → betroffene Abfragen (Teil-Schlüssel genügen, React Query invalidiert alle passenden)
const TABLES: Record<string, string[][]> = {
  tasks: [['tasks'], ['trash'], ['activity']],
  subtasks: [['tasks']],
  lists: [['lists']],
  list_members: [['members'], ['lists'], ['tasks']],
  list_invites: [['invites']],
  comments: [['comments'], ['activity']],
  activity_log: [['activity']],
  notifications: [['notifications']],
};

/** Hält die Anzeige live aktuell: Änderungen anderer Geräte/Personen laden die betroffenen Daten neu. */
export function useRealtimeSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const pending = new Set<string>();
    let timer: number | undefined;
    const flush = () => {
      for (const key of pending) void qc.invalidateQueries({ queryKey: [key] });
      pending.clear();
    };

    let channel = supabase.channel('pendenzen-sync');
    for (const [table, keys] of Object.entries(TABLES)) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        keys.forEach(([k]) => pending.add(k));
        window.clearTimeout(timer);
        timer = window.setTimeout(flush, 250); // mehrere Änderungen bündeln
      });
    }
    channel.subscribe();

    // Nach dem Aufwachen (iPhone) oder bei neuer Verbindung sicherheitshalber alles neu laden
    const refresh = () => document.visibilityState === 'visible' && void qc.invalidateQueries();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('online', refresh);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('online', refresh);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
