// Logik des Kalender-Feeds. Datenzugriff läuft über das Interface FeedStore, damit sich die
// Logik ohne Supabase testen lässt (siehe src/lib/feed.test.ts).
import { buildIcs, type IcsTask } from './ics.ts';

export interface TokenRecord {
  userId: string;
  /** null = alle Listen */
  listIds: string[] | null;
}

export interface FeedData {
  timezone: string;
  tasks: IcsTask[];
}

export interface FeedStore {
  findToken(tokenHash: string): Promise<TokenRecord | null>;
  loadFeed(record: TokenRecord): Promise<FeedData>;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const notFound = () => new Response('Not found', { status: 404 });

/** Behandelt GET /…/<token>.ics und liefert den Kalender oder 404. */
export async function handleFeedRequest(
  req: Request,
  store: FeedStore,
  config: { appUrl: string },
): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }
  const last = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const token = last.replace(/\.ics$/i, '');
  // Tokens sind 32 zufällige Bytes in Hex; alles andere gar nicht erst nachschlagen
  if (!/^[0-9a-f]{64}$/.test(token)) return notFound();

  const record = await store.findToken(await sha256Hex(token));
  if (!record) return notFound();

  const { timezone, tasks } = await store.loadFeed(record);
  const body = buildIcs(tasks, { timezone, appUrl: config.appUrl });
  return new Response(req.method === 'HEAD' ? null : body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="pendenzen.ics"',
      'cache-control': 'private, max-age=300',
    },
  });
}
