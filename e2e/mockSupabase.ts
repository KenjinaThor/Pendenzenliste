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
    /** weitere Mitglieder (neben der angemeldeten Person) */
    extraMembers: Row[];
    myRole: 'owner' | 'editor' | 'viewer';
    comments: Row[];
    invites: Row[];
    notifications: Row[];
    activity: Row[];
    rpcCalls: { name: string; args: unknown }[];
    /** true = alle Anfragen schlagen fehl (Verbindung getrennt) */
    offline: boolean;
    /** true = Datenbank-Funktion update_task_fields fehlt (Migration nicht ausgeführt) */
    noUpdateFunction: boolean;
    reminders: Row[];
    savedFilters: Row[];
    templates: Row[];
    attachments: Row[];
    storage: string[];
    tags: Row[];
    taskTags: { task_id: string; tag_id: string }[];
    pushSubscriptions: Row[];
    profile: Row;
  } = {
    lists: [],
    tasks: [],
    calendar: null,
    extraMembers: [],
    myRole: 'owner',
    comments: [],
    invites: [],
    notifications: [],
    activity: [],
    rpcCalls: [],
    offline: false,
    noUpdateFunction: false,
    reminders: [],
    savedFilters: [],
    templates: [],
    attachments: [],
    storage: [],
    tags: [],
    taskTags: [],
    pushSubscriptions: [],
    profile: {
      id: 'user-1',
      name: 'Anna',
      avatar_url: null,
      email: 'a@x.ch',
      timezone: 'Europe/Zurich',
      daily_digest_time: null,
      canton: 'SG',
      theme: 'system',
    },
  };
  /** Aufgaben wie PostgREST ausliefern (Tags als verschachtelte task_tags) */
  const withTags = (t: Row & { subtasks: Row[] }) => ({
    ...t,
    task_tags: db.taskTags
      .filter((x) => x.task_id === t.id)
      .map((x) => ({ tags: db.tags.find((g) => g.id === x.tag_id) ?? null })),
  });
  const me = { id: 'user-1', name: 'Anna', avatar_url: null, email: 'a@x.ch' };
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
    if (db.offline) return route.abort('internetdisconnected');
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop()!;
    const eq = url.searchParams.get('id')?.replace('eq.', '');
    const single = (req.headers()['accept'] ?? '').includes('pgrst.object');
    const body = (() => {
      try {
        return req.postData() ? JSON.parse(req.postData()!) : null;
      } catch {
        return null; // z. B. mehrteilige Datei-Uploads
      }
    })();
    const now = new Date().toISOString();

    if (url.pathname.endsWith('/rpc/rotate_calendar_token')) {
      const token = (++counter).toString(16).padStart(64, 'c');
      db.calendar = { id: 'user-1', token, list_ids: db.calendar?.list_ids ?? null };
      return json(route, token);
    }
    if (url.pathname.includes('/rpc/')) {
      const name = url.pathname.split('/').pop()!;
      db.rpcCalls.push({ name, args: body });
      if (name === 'create_invite') {
        const token = 'ab'.repeat(24);
        db.invites.push({
          id: newId(),
          list_id: body.p_list,
          email: body.p_email,
          role: body.p_role,
          expires_at: '2099-01-01T00:00:00Z',
          created_at: now,
        });
        return json(route, token);
      }
      if (name === 'get_vapid_public_key')
        return json(
          route,
          'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
        );
      if (name === 'update_task_fields' && db.noUpdateFunction) {
        return json(
          route,
          { code: 'PGRST202', message: 'Could not find the function public.update_task_fields' },
          404,
        );
      }
      if (name === 'update_task_fields') {
        const task = db.tasks.find((t) => t.id === body.p_task);
        if (!task) return json(route, { message: 'Keine Berechtigung', code: 'P0001' }, 400);
        const ts = body.p_ts as string;
        const stamps = ((task.field_updated_at as Record<string, string> | undefined) ??= {});
        for (const [key, value] of Object.entries(body.p_patch as Record<string, unknown>)) {
          if (stamps[key] && stamps[key] > ts) continue; // neuere Änderung gewinnt, pro Feld
          task[key] = value;
          stamps[key] = ts;
          if (key === 'status') task.completed_at = value === 'done' ? now : null;
        }
        return route.fulfill({ status: 204, headers: cors });
      }
      if (name === 'complete_recurring_task') {
        const task = db.tasks.find((t) => t.id === body.p_task)!;
        const clone = {
          ...task,
          id: newId(),
          due_at: body.p_next_due,
          status: 'open',
          completed_at: null,
          subtasks: task.subtasks.map((s) => ({ ...s, id: newId(), done: false })),
        };
        db.tasks.push(clone);
        Object.assign(task, {
          status: 'done',
          rrule: null,
          repeat_after_days: null,
          completed_at: now,
        });
        return json(route, clone.id);
      }
      if (name === 'undo_recurring_completion') {
        db.tasks = db.tasks.filter((t) => t.id !== body.p_clone);
        Object.assign(
          db.tasks.find((t) => t.id === body.p_task)!,
          {
            status: 'open',
            completed_at: null,
            rrule: body.p_rrule,
            repeat_mode: body.p_mode,
            repeat_after_days: body.p_after,
          },
        );
        return json(route, null);
      }
      if (name === 'accept_invite') return json(route, db.lists[0]?.id ?? 'id-1');
      return json(route, 0);
    }

    if (table === 'list_members' && req.method() === 'GET') {
      const own = db.lists.map((l) => ({
        list_id: l.id,
        user_id: me.id,
        role: db.myRole,
        profiles: me,
      }));
      return json(route, [...own, ...db.extraMembers]);
    }
    if (url.pathname.includes('/storage/v1/')) {
      const path = decodeURIComponent(url.pathname.split('/attachments/')[1] ?? '');
      if (url.pathname.includes('/object/sign/')) {
        return json(route, { signedURL: `/object/sign/attachments/${path}?token=abc` });
      }
      if (req.method() === 'POST') {
        db.storage.push(path);
        return json(route, { Key: `attachments/${path}` });
      }
      if (req.method() === 'DELETE') {
        db.storage = db.storage.filter((p) => !(body.prefixes as string[]).includes(p));
        return json(route, []);
      }
    }
    if (table === 'attachments') {
      if (req.method() === 'GET') {
        const task = url.searchParams.get('task_id')?.replace('eq.', '');
        return json(
          route,
          db.attachments.filter((a) => a.task_id === task),
        );
      }
      if (req.method() === 'POST') {
        const row = { id: newId(), created_at: now, ...body };
        db.attachments.push(row);
        return route.fulfill({ status: 201, headers: cors });
      }
      if (req.method() === 'DELETE') {
        db.attachments = db.attachments.filter((a) => a.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'templates') {
      if (req.method() === 'GET') return json(route, db.templates);
      if (req.method() === 'POST') {
        db.templates.push({ id: newId(), ...body });
        return route.fulfill({ status: 201, headers: cors });
      }
      if (req.method() === 'PATCH') {
        Object.assign(
          db.templates.find((t) => t.id === eq)!,
          body,
        );
        return route.fulfill({ status: 204, headers: cors });
      }
      if (req.method() === 'DELETE') {
        db.templates = db.templates.filter((t) => t.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'saved_filters') {
      if (req.method() === 'GET') return json(route, db.savedFilters);
      if (req.method() === 'POST') {
        const row = { id: newId(), ...body };
        db.savedFilters.push(row);
        return json(route, single ? row : [row], 201);
      }
      if (req.method() === 'PATCH') {
        const row = db.savedFilters.find((f) => f.id === eq)!;
        Object.assign(row, body);
        return json(route, single ? row : [row]);
      }
      if (req.method() === 'DELETE') {
        db.savedFilters = db.savedFilters.filter((f) => f.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'tags') {
      if (req.method() === 'GET') {
        const list = url.searchParams.get('list_id')?.replace('eq.', '');
        return json(
          route,
          db.tags.filter((t) => t.list_id === list),
        );
      }
      if (req.method() === 'POST') {
        const rows = (body as Row[]).map((r) => ({ id: newId(), color: '#94a3b8', ...r }));
        db.tags.push(...rows);
        return json(route, rows, 201);
      }
    }
    if (table === 'task_tags') {
      const task = url.searchParams.get('task_id')?.replace('eq.', '');
      if (req.method() === 'GET')
        return json(
          route,
          db.taskTags.filter((x) => x.task_id === task),
        );
      if (req.method() === 'POST') {
        db.taskTags.push(...(body as { task_id: string; tag_id: string }[]));
        return route.fulfill({ status: 201, headers: cors });
      }
      if (req.method() === 'DELETE') {
        const ids = (url.searchParams.get('tag_id') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
        db.taskTags = db.taskTags.filter((x) => !(x.task_id === task && ids.includes(x.tag_id)));
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'profiles') {
      if (req.method() === 'PATCH') {
        Object.assign(db.profile, body);
        return route.fulfill({ status: 204, headers: cors });
      }
      return json(route, single ? db.profile : [db.profile]);
    }
    if (table === 'reminders') {
      const task = url.searchParams.get('task_id')?.replace('eq.', '');
      if (req.method() === 'GET')
        return json(
          route,
          db.reminders.filter((r) => r.task_id === task),
        );
      if (req.method() === 'POST') {
        const rows = (Array.isArray(body) ? body : [body]).map((r: Row) => ({
          id: newId(),
          offset_min: null,
          at: null,
          sent_at: null,
          fire_at: now,
          ...r,
        }));
        db.reminders.push(...rows);
        return route.fulfill({ status: 201, headers: cors });
      }
      if (req.method() === 'DELETE') {
        db.reminders = db.reminders.filter((r) => r.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'push_subscriptions') {
      if (req.method() === 'POST') {
        db.pushSubscriptions.push(body);
        return route.fulfill({ status: 201, headers: cors });
      }
      if (req.method() === 'DELETE') {
        db.pushSubscriptions = [];
        return route.fulfill({ status: 204, headers: cors });
      }
    }
    if (table === 'notifications') return json(route, db.notifications);
    if (table === 'list_invites') {
      if (req.method() === 'DELETE') {
        db.invites = db.invites.filter((i) => i.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
      return json(route, db.invites);
    }
    if (table === 'activity_log') {
      const task = url.searchParams.get('task_id')?.replace('eq.', '');
      return json(
        route,
        db.activity.filter((a) => a.task_id === task),
      );
    }
    if (table === 'comments') {
      const task = url.searchParams.get('task_id')?.replace('eq.', '');
      if (req.method() === 'GET')
        return json(
          route,
          db.comments.filter((c) => c.task_id === task),
        );
      if (req.method() === 'POST') {
        const row = {
          id: newId(),
          author_id: me.id,
          created_at: now,
          profiles: { name: me.name, avatar_url: null },
          ...body,
        };
        db.comments.push(row);
        return json(route, [row], 201);
      }
      if (req.method() === 'DELETE') {
        db.comments = db.comments.filter((c) => c.id !== eq);
        return route.fulfill({ status: 204, headers: cors });
      }
    }

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
          db.tasks.filter((t) => (trash ? t.deleted_at : !t.deleted_at)).map(withTags),
        );
      }
      if (req.method() === 'POST' && Array.isArray(body)) {
        for (const r of body)
          db.tasks.push({
            notes_md: '',
            subtasks: [],
            created_at: now,
            updated_at: now,
            deleted_at: null,
            focus_date: null,
            assignee_id: null,
            ...r,
          });
        return route.fulfill({ status: 201, headers: cors });
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
          repeat_mode: 'fixed',
          repeat_after_days: null,
          focus_date: null,
          completed_at: null,
          deleted_at: null,
          position: 0,
          created_at: now,
          updated_at: now,
          subtasks: [],
          ...body,
        };
        db.tasks.push(row);
        return json(route, single ? withTags(row) : [withTags(row)], 201);
      }
      if (req.method() === 'PATCH') {
        const row = db.tasks.find((t) => t.id === eq)!;
        Object.assign(row, body);
        return json(route, single ? withTags(row) : [withTags(row)]);
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
