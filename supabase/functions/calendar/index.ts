// Edge Function «calendar»: liefert den persönlichen ICS-Kalender-Feed.
// Aufruf: https://<projekt>.supabase.co/functions/v1/calendar/<token>.ics
// Läuft ohne JWT (Kalender-Apps können sich nicht anmelden); der geheime Token in der URL
// ist die Zugriffsberechtigung. Gespeichert ist nur sein SHA-256-Hash.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleFeedRequest, type FeedStore } from '../_shared/feed.ts';
import type { IcsTask } from '../_shared/ics.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const store: FeedStore = {
  async findToken(tokenHash) {
    const { data, error } = await supabase
      .from('calendar_tokens')
      .select('user_id, list_ids')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) throw error;
    return data ? { userId: data.user_id, listIds: data.list_ids } : null;
  },

  async loadFeed({ userId, listIds }) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();

    const { data: memberships, error: mErr } = await supabase
      .from('list_members')
      .select('list_id')
      .eq('user_id', userId);
    if (mErr) throw mErr;
    const allowed = (memberships ?? []).map((m) => m.list_id as string);
    const ids = listIds ? allowed.filter((id) => listIds.includes(id)) : allowed;
    const timezone = profile?.timezone ?? 'Europe/Zurich';
    if (ids.length === 0) return { timezone, tasks: [] };

    const { data: lists } = await supabase
      .from('lists')
      .select('id, name')
      .in('id', ids)
      .is('archived_at', null);
    const names = new Map((lists ?? []).map((l) => [l.id as string, l.name as string]));

    const { data: rows, error } = await supabase
      .from('tasks')
      .select('*, subtasks(title, done, position)')
      .in('list_id', [...names.keys()])
      .is('deleted_at', null)
      .neq('status', 'done')
      .not('due_at', 'is', null);
    if (error) throw error;

    const tasks: IcsTask[] = (rows ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      notes_md: t.notes_md ?? '',
      due_at: t.due_at,
      due_all_day: t.due_all_day,
      duration_min: t.duration_min,
      priority: t.priority,
      rrule: t.rrule,
      updated_at: t.updated_at,
      list_name: names.get(t.list_id),
      subtasks: [...(t.subtasks ?? [])]
        .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
        .map((s: { title: string; done: boolean }) => ({ title: s.title, done: s.done })),
    }));
    return { timezone, tasks };
  },
};

Deno.serve((req) =>
  handleFeedRequest(req, store, {
    appUrl: Deno.env.get('APP_URL') ?? 'https://kenjinathor.github.io/Pendenzenliste/',
  }),
);
