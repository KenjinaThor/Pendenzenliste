import type { Page, Route } from '@playwright/test';

/** Minimaler In-Memory-Ersatz für die Supabase-REST-API (nur was die Tests brauchen). */
export const SUPABASE_URL = 'https://mock.supabase.co';
export const ANON_KEY = 'sb_publishable_mock';

type Row = Record<string, unknown> & { id: string };

export async function mockSupabase(page: Page) {
  const db: {
    lists: Row[];
    tasks: (Row & { subtasks: Row[] })[];
    calendar: Row | null;
  } = { lists: [], tasks: [], calendar: null };
  let counter = 0;
  const newId = () => `id-${++counter}`;
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route(`${SUPABASE_URL}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop()!;
    const eq = url.searchParams.get('id')?.replace('eq.', '');
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object');
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    const now = new Date().toISOString();

    if (url.pathname.endsWith('/rpc/rotate_calendar_token')) {
      const token = (++counter).toString(16).padStart(64, 'c');
      db.calendar = { id: 'user-1', token, list_ids: db.calendar?.list_ids ?? null };
      return json(route, token);
    }
    if (url.pathname.includes('/rpc/')) return json(route, 0);

    if (table === 'calendar_tokens') {
      if (req.method() === 'GET')
        return json(route, single || !db.calendar ? db.calendar : [db.calendar]);
      if (req.method() === 'PATCH' && db.calendar) {
        Object.assign(db.calendar, body);
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    if (table === 'lists') {
      if (req.method() === 'GET') return json(route, db.lists);
      if (req.method() === 'POST') {
        const row = { id: newId(), owner_id: 'user-1', position: 0, archived_at: null, ...body };
        db.lists.push(row);
        return json(route, single ? row : [row], 201);
      }
      if (req.method() === 'PATCH') {
        const row = db.lists.find((l) => l.id === eq)!;
        Object.assign(row, body);
        return json(route, single ? row : [row]);
      }
      if (req.method() === 'DELETE') {
        db.lists = db.lists.filter((l) => l.id !== eq);
        db.tasks = db.tasks.filter(
          (t) => t.list_id !== db.lists.find((l) => l.id === t.list_id)?.id,
        );
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    if (table === 'tasks') {
      if (req.method() === 'GET') {
        const trash =
          url.searchParams.has('deleted_at') &&
          url.searchParams.get('deleted_at')!.startsWith('gte');
        return json(
          route,
          db.tasks.filter((t) => (trash ? t.deleted_at : !t.deleted_at)),
        );
      }
      if (req.method() === 'POST') {
        const row = {
          id: newId(),
          notes_md: '',
          due_at: null,
          due_all_day: false,
          duration_min: null,
          priority: 'medium',
          status: 'open',
          assignee_id: null,
          rrule: null,
          completed_at: null,
          deleted_at: null,
          position: 0,
          created_at: now,
          updated_at: now,
          subtasks: [],
          ...body,
        };
        db.tasks.push(row);
        return json(route, single ? row : [row], 201);
      }
      if (req.method() === 'PATCH') {
        const row = db.tasks.find((t) => t.id === eq)!;
        Object.assign(row, body);
        return json(route, single ? row : [row]);
      }
      if (req.method() === 'DELETE') {
        db.tasks = db.tasks.filter((t) => t.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    if (table === 'subtasks') {
      if (req.method() === 'POST') {
        const rows = (body as Row[]).map((r) => ({ id: newId(), done: false, ...r }));
        for (const r of rows) db.tasks.find((t) => t.id === r.task_id)?.subtasks.push(r);
        return json(route, rows, 201);
      }
      const owner = db.tasks.find((t) => t.subtasks.some((s) => s.id === eq));
      if (req.method() === 'PATCH' && owner) {
        Object.assign(
          owner.subtasks.find((s) => s.id === eq)!,
          body,
        );
        return json(route, []);
      }
      if (req.method() === 'DELETE' && owner) {
        owner.subtasks = owner.subtasks.filter((s) => s.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }

    return json(route, { message: `nicht gemockt: ${req.method()} ${url.pathname}` }, 404);
  });

  // angemeldete Sitzung vorab im Browser ablegen
  await page.addInitScript(
    ([ref, user]) => {
      localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'a.b.c',
          refresh_token: 'r',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      );
      localStorage.setItem('installHintDismissed', '1');
    },
    [
      'mock',
      {
        id: 'user-1',
        aud: 'authenticated',
        email: 'a@x.ch',
        user_metadata: { full_name: 'Anna' },
        app_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    ] as const,
  );
  return db;
}
