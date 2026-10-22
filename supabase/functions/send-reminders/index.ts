// Edge Function «send-reminders»: wird jede Minute von pg_cron (über pg_net) aufgerufen und verschickt
// fällige Erinnerungen, Mitteilungen und Tageszusammenfassungen als Web-Push.
// Der Aufruf wird über den geheimen Schlüssel «cron_secret» (Tabelle app_config) abgesichert.
// Die VAPID-Schlüssel werden beim ersten Lauf automatisch erzeugt und in app_config gespeichert.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { handleRunRequest, type PushStore, type Pusher } from '../_shared/push.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

const appUrl = Deno.env.get('APP_URL') ?? 'https://kenjinathor.github.io/Pendenzenliste/';

async function config(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/** Liest die VAPID-Schlüssel oder erzeugt sie einmalig (atomar: ein Eintrag, der erste gewinnt). */
async function ensureVapid(): Promise<{ publicKey: string; privateKey: string }> {
  let raw = await config('vapid_keys');
  if (!raw) {
    const keys = webpush.generateVAPIDKeys();
    await supabase
      .from('app_config')
      .upsert(
        { key: 'vapid_keys', value: JSON.stringify(keys) },
        { onConflict: 'key', ignoreDuplicates: true },
      );
    raw = await config('vapid_keys');
  }
  const keys = JSON.parse(raw!) as { publicKey: string; privateKey: string };
  // der öffentliche Schlüssel wird für die App lesbar bereitgestellt (get_vapid_public_key)
  await supabase
    .from('app_config')
    .upsert({ key: 'vapid_public_key', value: keys.publicKey }, { onConflict: 'key' });
  return keys;
}

const store: PushStore = {
  cronSecret: () => config('cron_secret'),
  async claimReminders() {
    const { data, error } = await supabase.rpc('claim_due_reminders');
    if (error) throw error;
    return data ?? [];
  },
  async claimNotifications() {
    const { data, error } = await supabase.rpc('claim_push_notifications');
    if (error) throw error;
    return data ?? [];
  },
  async claimDigests() {
    const { data, error } = await supabase.rpc('claim_due_digests');
    if (error) throw error;
    return data ?? [];
  },
  async subscriptions(userId) {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (error) throw error;
    return data ?? [];
  },
  async removeSubscription(endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  },
};

async function makePusher(): Promise<Pusher> {
  const { publicKey, privateKey } = await ensureVapid();
  webpush.setVapidDetails(appUrl, publicKey, privateKey);
  return {
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        );
        return 'ok';
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? 'gone' : 'error';
      }
    },
  };
}

Deno.serve((req) => handleRunRequest(req, store, makePusher, { appUrl }));
