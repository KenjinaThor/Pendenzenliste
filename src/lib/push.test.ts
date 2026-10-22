import { describe, expect, it } from 'vitest';
import {
  digestPayload,
  dayWords,
  handleRunRequest,
  notificationPayload,
  reminderPayload,
  runCycle,
  safeEqual,
  type ClaimedReminder,
  type PushPayload,
  type PushStore,
  type Pusher,
  type Subscription,
} from '../../supabase/functions/_shared/push.ts';

const APP = 'https://example.org/app/';
const now = new Date('2026-12-09T10:00:00Z'); // 11:00 in Zürich

const reminder: ClaimedReminder = {
  reminder_id: 'r1',
  user_id: 'u1',
  task_id: 't1',
  title: 'Zahnarzt',
  timezone: 'Europe/Zurich',
  due_at: '2026-12-09T13:30:00Z',
  due_all_day: false,
};

describe('Texte', () => {
  it('Tage in Worten (Zeitzone beachten)', () => {
    // 22:30 UTC = 23:30 in Zürich → noch heute; 23:30 UTC = 00:30 am Folgetag → morgen
    expect(dayWords(new Date('2026-12-09T22:30:00Z'), now, 'Europe/Zurich')).toBe('heute');
    expect(dayWords(new Date('2026-12-09T23:30:00Z'), now, 'Europe/Zurich')).toBe('morgen');
    expect(dayWords(new Date('2026-12-09T08:00:00Z'), now, 'Europe/Zurich')).toBe('heute');
    expect(dayWords(new Date('2026-12-08T08:00:00Z'), now, 'Europe/Zurich')).toBe('gestern');
    expect(dayWords(new Date('2026-12-15T08:00:00Z'), now, 'Europe/Zurich')).toMatch(
      /^am \S+ 15\.12\./,
    );
  });

  it('Erinnerung mit Uhrzeit und ganztägig', () => {
    expect(reminderPayload(reminder, now, APP)).toEqual({
      title: 'Zahnarzt',
      body: 'Fällig heute um 14:30',
      url: `${APP}#/pendenz/t1`,
      tag: 'reminder-t1',
    });
    const allDay = { ...reminder, due_all_day: true, due_at: '2026-12-09T23:00:00Z' }; // 10.12. in Zürich
    expect(reminderPayload(allDay, now, APP).body).toBe('Fällig morgen');
  });

  it('Mitteilungen und Zusammenfassung', () => {
    const n = {
      notification_id: 'n1',
      user_id: 'u1',
      kind: 'mention',
      task_id: 't9',
      payload: { task_title: 'Steuern', actor_name: 'Ben' },
    };
    expect(notificationPayload(n, APP).body).toBe('Ben hat dich in «Steuern» erwähnt');
    expect(notificationPayload({ ...n, kind: 'test', task_id: null }, APP).url).toBe(APP);
    expect(digestPayload({ user_id: 'u', due_today: 1, overdue: 0, timezone: 'x' }, APP).body).toBe(
      'Heute fällig: 1 Pendenz',
    );
    expect(digestPayload({ user_id: 'u', due_today: 4, overdue: 2, timezone: 'x' }, APP).body).toBe(
      'Heute fällig: 4 Pendenzen · 2 überfällig',
    );
    expect(digestPayload({ user_id: 'u', due_today: 0, overdue: 3, timezone: 'x' }, APP).body).toBe(
      '3 überfällig',
    );
  });
});

function fakes(results: Record<string, 'ok' | 'gone' | 'error'> = {}) {
  const sent: { to: string; payload: PushPayload }[] = [];
  const removed: string[] = [];
  const subs: Record<string, Subscription[]> = {
    u1: [
      { endpoint: 'https://push/a', p256dh: 'k', auth: 'a' },
      { endpoint: 'https://push/b', p256dh: 'k', auth: 'a' },
    ],
  };
  const store: PushStore = {
    cronSecret: async () => 'geheim',
    claimReminders: async () => [reminder],
    claimNotifications: async () => [
      {
        notification_id: 'n1',
        user_id: 'u1',
        kind: 'assigned',
        task_id: 't2',
        payload: { task_title: 'X', actor_name: 'Ben' },
      },
    ],
    claimDigests: async () => [
      { user_id: 'u2', due_today: 2, overdue: 0, timezone: 'Europe/Zurich' },
    ],
    subscriptions: async (id) => subs[id] ?? [],
    removeSubscription: async (e) => void removed.push(e),
  };
  const pusher: Pusher = {
    send: async (sub, payload) => {
      sent.push({ to: sub.endpoint, payload });
      return results[sub.endpoint] ?? 'ok';
    },
  };
  return { store, pusher, sent, removed };
}

describe('runCycle', () => {
  it('verschickt an alle Geräte der Person', async () => {
    const f = fakes();
    const stats = await runCycle(f.store, f.pusher, { appUrl: APP }, now);
    expect(stats).toMatchObject({ reminders: 1, notifications: 1, digests: 1, sent: 4, failed: 0 });
    expect(f.sent.filter((s) => s.payload.tag === 'reminder-t1')).toHaveLength(2);
    // u2 hat kein Gerät → nichts gesendet, aber kein Fehler
  });

  it('entfernt Geräte, die nicht mehr existieren (410/404), und zählt Fehler', async () => {
    const f = fakes({ 'https://push/a': 'gone', 'https://push/b': 'error' });
    const stats = await runCycle(f.store, f.pusher, { appUrl: APP }, now);
    expect(f.removed).toEqual(['https://push/a', 'https://push/a']);
    expect(stats.removedSubscriptions).toBe(2);
    expect(stats.failed).toBe(2);
  });
});

describe('handleRunRequest', () => {
  const call = (headers: Record<string, string>, method = 'POST') =>
    handleRunRequest(
      new Request('https://x/functions/v1/send-reminders', { method, headers }),
      fakes().store,
      async () => fakes().pusher,
      { appUrl: APP },
      now,
    );

  it('ohne oder mit falschem Geheimnis → 401', async () => {
    expect((await call({})).status).toBe(401);
    expect((await call({ 'x-cron-secret': 'falsch' })).status).toBe(401);
  });
  it('nur POST', async () => {
    expect((await call({ 'x-cron-secret': 'geheim' }, 'GET')).status).toBe(405);
  });
  it('mit richtigem Geheimnis → Statistik', async () => {
    const res = await call({ 'x-cron-secret': 'geheim' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reminders: 1 });
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});
