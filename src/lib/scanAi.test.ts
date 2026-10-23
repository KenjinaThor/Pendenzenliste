import { describe, expect, it } from 'vitest';
import { handleScanRequest, type ScanConfig } from '../../supabase/functions/_shared/scan.ts';

const post = (body: unknown, jwt: string | null = 'jwt') =>
  new Request('https://x/functions/v1/scan-document', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });

const gemini = (text: string, status = 200) =>
  (async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status,
    })) as unknown as typeof fetch;

const cfg = (over: Partial<ScanConfig> = {}): ScanConfig => ({
  apiKey: 'key',
  model: 'm',
  verifyUser: async (j) => (j === 'jwt' ? 'u1' : null),
  ...over,
});
const img = { image: 'AAAA', mime: 'image/jpeg', today: '2026-10-23' };

describe('handleScanRequest', () => {
  it('verlangt ein gültiges Login', async () => {
    expect((await handleScanRequest(post(img, null), cfg())).status).toBe(401);
    expect((await handleScanRequest(post(img, 'falsch'), cfg())).status).toBe(401);
  });
  it('meldet fehlenden Schlüssel', async () => {
    const res = await handleScanRequest(post(img), cfg({ apiKey: undefined }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('not_configured');
  });
  it('beantwortet CORS-Vorabfragen', async () => {
    const res = await handleScanRequest(new Request('https://x', { method: 'OPTIONS' }), cfg());
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('lehnt ungültige Bilder ab', async () => {
    expect((await handleScanRequest(post({ ...img, mime: 'text/html' }), cfg())).status).toBe(400);
    expect((await handleScanRequest(post({ mime: 'image/png' }), cfg())).status).toBe(400);
  });
  it('liefert bereinigte Termine und schickt Schlüssel nur im Header', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return gemini(
        JSON.stringify({
          appointments: [
            { title: ' Zahnarzt ', date: '2026-11-12', time: '9:30', note: 'Karte mitnehmen' },
            { title: 'Kaputt', date: '2026-02-31', time: null, note: '' },
            { title: '', date: '2026-12-01', time: 'abends', note: '' },
          ],
        }),
      )(...([] as unknown as Parameters<typeof fetch>));
    }) as unknown as typeof fetch;
    const res = await handleScanRequest(post(img), cfg({ fetch: f }));
    expect(res.status).toBe(200);
    expect((await res.json()).appointments).toEqual([
      { title: 'Zahnarzt', date: '2026-11-12', time: '09:30', note: 'Karte mitnehmen' },
      { title: 'Termin', date: '2026-12-01', time: null, note: '' },
    ]);
    expect(seen!.url).not.toContain('key');
    expect((seen!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('key');
    expect(String(seen!.init.body)).toContain('2026-10-23');
  });
  it('übersetzt Limit- und Fehlerantworten', async () => {
    const limit = await handleScanRequest(post(img), cfg({ fetch: gemini('', 429) }));
    expect(limit.status).toBe(429);
    const bad = await handleScanRequest(post(img), cfg({ fetch: gemini('kein json') }));
    expect(bad.status).toBe(502);
  });
});
