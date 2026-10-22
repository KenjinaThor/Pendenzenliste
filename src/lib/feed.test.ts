import { describe, expect, it } from 'vitest';
import {
  handleFeedRequest,
  sha256Hex,
  type FeedStore,
} from '../../supabase/functions/_shared/feed.ts';

const TOKEN = 'a'.repeat(64);
const config = { appUrl: 'https://example.org/app/' };

function makeStore() {
  const calls: string[] = [];
  const store: FeedStore = {
    async findToken(hash) {
      calls.push(hash);
      return hash === (await sha256Hex(TOKEN)) ? { userId: 'u1', listIds: null } : null;
    },
    async loadFeed() {
      return {
        timezone: 'Europe/Zurich',
        tasks: [
          {
            id: 't1',
            title: 'Test',
            notes_md: '',
            due_at: '2026-10-23T12:00:00Z',
            due_all_day: false,
            duration_min: null,
            priority: 'medium',
            rrule: null,
            updated_at: '2026-10-22T08:00:00Z',
            subtasks: [],
          },
        ],
      };
    },
  };
  return { store, calls };
}

describe('handleFeedRequest', () => {
  it('liefert den Kalender für einen gültigen Token', async () => {
    const { store, calls } = makeStore();
    const res = await handleFeedRequest(
      new Request(`https://x.supabase.co/functions/v1/calendar/${TOKEN}.ics`),
      store,
      config,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const body = await res.text();
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('URL:https://example.org/app/#/pendenz/t1');
    expect(calls[0]).not.toContain(TOKEN); // nur der Hash wird nachgeschlagen
  });

  it('unbekannter Token → 404', async () => {
    const { store } = makeStore();
    const res = await handleFeedRequest(
      new Request(`https://x/calendar/${'b'.repeat(64)}.ics`),
      store,
      config,
    );
    expect(res.status).toBe(404);
  });

  it('ungültiges Token-Format → 404, ohne die Datenbank zu fragen', async () => {
    const { store, calls } = makeStore();
    for (const path of ['/calendar/abc.ics', '/calendar/', `/calendar/${'G'.repeat(64)}.ics`]) {
      expect((await handleFeedRequest(new Request(`https://x${path}`), store, config)).status).toBe(
        404,
      );
    }
    expect(calls).toHaveLength(0);
  });

  it('nur GET und HEAD', async () => {
    const { store } = makeStore();
    const res = await handleFeedRequest(
      new Request(`https://x/calendar/${TOKEN}.ics`, { method: 'POST' }),
      store,
      config,
    );
    expect(res.status).toBe(405);
    const head = await handleFeedRequest(
      new Request(`https://x/calendar/${TOKEN}.ics`, { method: 'HEAD' }),
      store,
      config,
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });
});
