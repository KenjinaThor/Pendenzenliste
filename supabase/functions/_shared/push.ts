// Versandlogik für Erinnerungen, Mitteilungen und Tageszusammenfassungen.
// Datenzugriff und Push-Dienst werden über Schnittstellen übergeben und sind damit testbar
// (siehe src/lib/push.test.ts). Die eigentliche Fälligkeitslogik steckt in den SQL-Funktionen claim_*.
import { notificationText } from './texts.ts';

export interface PushPayload {
  title: string;
  body: string;
  /** Adresse, die beim Antippen geöffnet wird */
  url: string;
  /** gleiche Tags ersetzen sich gegenseitig */
  tag: string;
}

export interface ClaimedReminder {
  reminder_id: string;
  user_id: string;
  task_id: string;
  title: string;
  due_at: string;
  due_all_day: boolean;
  timezone: string;
}

export interface ClaimedNotification {
  notification_id: string;
  user_id: string;
  kind: string;
  task_id: string | null;
  payload: { task_title?: string; actor_name?: string; excerpt?: string };
}

export interface ClaimedDigest {
  user_id: string;
  due_today: number;
  overdue: number;
  timezone: string;
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushStore {
  cronSecret(): Promise<string | null>;
  claimReminders(): Promise<ClaimedReminder[]>;
  claimNotifications(): Promise<ClaimedNotification[]>;
  claimDigests(): Promise<ClaimedDigest[]>;
  subscriptions(userId: string): Promise<Subscription[]>;
  removeSubscription(endpoint: string): Promise<void>;
}

export type PushResult = 'ok' | 'gone' | 'error';

export interface Pusher {
  send(sub: Subscription, payload: PushPayload): Promise<PushResult>;
}

export interface RunStats {
  reminders: number;
  notifications: number;
  digests: number;
  sent: number;
  failed: number;
  removedSubscriptions: number;
}

// ---------------------------------------------------------------- Texte
/** Kalendertag als YYYY-MM-DD in der Zeitzone */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** «heute», «morgen», «gestern» oder «am Do 05.11.» */
export function dayWords(due: Date, now: Date, timeZone: string): string {
  const diff = dayNumber(dayKey(due, timeZone)) - dayNumber(dayKey(now, timeZone));
  if (diff === 0) return 'heute';
  if (diff === 1) return 'morgen';
  if (diff === -1) return 'gestern';
  const parts = new Intl.DateTimeFormat('de-CH', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(due);
  return `am ${parts.replace(',', '')}`;
}

export function timeText(due: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('de-CH', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(due);
}

export function taskUrl(appUrl: string, taskId: string): string {
  return `${appUrl.endsWith('/') ? appUrl : `${appUrl}/`}#/pendenz/${taskId}`;
}

export function reminderPayload(r: ClaimedReminder, now: Date, appUrl: string): PushPayload {
  const due = new Date(r.due_at);
  const day = dayWords(due, now, r.timezone);
  const body = r.due_all_day ? `Fällig ${day}` : `Fällig ${day} um ${timeText(due, r.timezone)}`;
  return { title: r.title, body, url: taskUrl(appUrl, r.task_id), tag: `reminder-${r.task_id}` };
}

export function notificationPayload(n: ClaimedNotification, appUrl: string): PushPayload {
  return {
    title: 'Pendenzen',
    body: notificationText(n),
    url: n.task_id ? taskUrl(appUrl, n.task_id) : appUrl,
    tag: `notification-${n.notification_id}`,
  };
}

export function digestPayload(d: ClaimedDigest, appUrl: string): PushPayload {
  const plural = (n: number) => `${n} ${n === 1 ? 'Pendenz' : 'Pendenzen'}`;
  const parts: string[] = [];
  if (d.due_today > 0) parts.push(`Heute fällig: ${plural(d.due_today)}`);
  if (d.overdue > 0) parts.push(`${d.overdue} überfällig`);
  const base = appUrl.endsWith('/') ? appUrl : `${appUrl}/`;
  return { title: 'Guten Morgen', body: parts.join(' · '), url: `${base}#/heute`, tag: 'digest' };
}

// ---------------------------------------------------------------- Ablauf
async function deliver(
  store: PushStore,
  pusher: Pusher,
  userId: string,
  payload: PushPayload,
  stats: RunStats,
) {
  for (const sub of await store.subscriptions(userId)) {
    const result = await pusher.send(sub, payload);
    if (result === 'ok') stats.sent++;
    else if (result === 'gone') {
      await store.removeSubscription(sub.endpoint); // Gerät hat die Berechtigung entzogen
      stats.removedSubscriptions++;
    } else stats.failed++;
  }
}

/** Ein Durchlauf (wird jede Minute vom Zeitplan ausgelöst). */
export async function runCycle(
  store: PushStore,
  pusher: Pusher,
  config: { appUrl: string },
  now = new Date(),
): Promise<RunStats> {
  const stats: RunStats = {
    reminders: 0,
    notifications: 0,
    digests: 0,
    sent: 0,
    failed: 0,
    removedSubscriptions: 0,
  };

  for (const r of await store.claimReminders()) {
    stats.reminders++;
    await deliver(store, pusher, r.user_id, reminderPayload(r, now, config.appUrl), stats);
  }
  for (const n of await store.claimNotifications()) {
    stats.notifications++;
    await deliver(store, pusher, n.user_id, notificationPayload(n, config.appUrl), stats);
  }
  for (const d of await store.claimDigests()) {
    stats.digests++;
    await deliver(store, pusher, d.user_id, digestPayload(d, config.appUrl), stats);
  }
  return stats;
}

/** Vergleich in konstanter Zeit (verhindert, dass man das Geheimnis über Antwortzeiten erraten kann). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleRunRequest(
  req: Request,
  store: PushStore,
  makePusher: () => Promise<Pusher>,
  config: { appUrl: string },
  now = new Date(),
): Promise<Response> {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = await store.cronSecret();
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || !safeEqual(secret, given)) return new Response('Unauthorized', { status: 401 });

  const stats = await runCycle(store, await makePusher(), config, now);
  return new Response(JSON.stringify(stats), { headers: { 'content-type': 'application/json' } });
}
