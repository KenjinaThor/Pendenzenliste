// Logik der Funktion «scan-document»: ein Foto (Brief, Einladung, Aufgebot) wird an das kostenlose
// Gemini-Modell von Google geschickt, das die Termine als JSON zurückgibt. Der API-Schlüssel liegt nur
// als Geheimnis in Supabase, nie in der App. Zugriff haben nur angemeldete Personen.

export interface ScanConfig {
  apiKey: string | undefined;
  model: string;
  /** Prüft das Login-Token und liefert die Benutzer-ID (oder null). */
  verifyUser(jwt: string): Promise<string | null>;
  fetch?: typeof fetch;
}

export interface ScannedAppointment {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM oder null */
  time: string | null;
  note: string;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });

// Gemini-Antwortschema
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    appointments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          date: { type: 'STRING' },
          time: { type: 'STRING', nullable: true },
          note: { type: 'STRING' },
        },
        required: ['title', 'date'],
      },
    },
  },
  required: ['appointments'],
};

const MAX_BASE64 = 6_000_000; // ca. 4,5 MB Bild

export function buildPrompt(today: string, timezone: string): string {
  return [
    'Du liest ein fotografiertes oder gescanntes Dokument (meist Deutsch, Schweiz) und suchst darin Termine,',
    'die man sich in einer Pendenzenliste merken möchte: Arzttermine, Einladungen, Vorladungen, Fristen,',
    'Abgabetermine, Veranstaltungen, Sitzungen.',
    `Heute ist der ${today} (Zeitzone ${timezone}). Datumsangaben ohne Jahr beziehen sich auf das nächste Vorkommen.`,
    'Regeln:',
    '- Gib nur Termine zurück, die in der Zukunft liegen oder als Frist wichtig sind. Ignoriere das Briefdatum,',
    '  Geburtsdaten, Rechnungs- und Ausstellungsdaten.',
    '- «title»: kurzer, verständlicher Titel auf Deutsch (z. B. «Zahnarzt Dr. Meier», «Elternabend Schule»),',
    '  höchstens 60 Zeichen, ohne Datum und Uhrzeit.',
    '- «date»: Format YYYY-MM-DD.',
    '- «time»: Beginn im Format HH:MM (24 Stunden) oder null, wenn keine Uhrzeit genannt ist.',
    '- «note»: wichtige Zusatzinfos in einem Satz (Ort, was mitzubringen ist, Telefonnummer zum Absagen), sonst leer.',
    '- Erfinde nichts. Wenn kein Termin erkennbar ist, gib eine leere Liste zurück.',
  ].join('\n');
}

function sanitize(raw: unknown): ScannedAppointment[] {
  const list = (raw as { appointments?: unknown })?.appointments;
  if (!Array.isArray(list)) return [];
  const out: ScannedAppointment[] = [];
  for (const a of list.slice(0, 20)) {
    const r = a as Record<string, unknown>;
    const date = typeof r.date === 'string' ? r.date.trim() : '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) continue;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) continue;
    const t = typeof r.time === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)/.exec(r.time.trim()) : null;
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 120) : '';
    out.push({
      title: title || 'Termin',
      date,
      time: t ? `${t[1].padStart(2, '0')}:${t[2]}` : null,
      note: typeof r.note === 'string' ? r.note.trim().slice(0, 300) : '',
    });
  }
  return out;
}

export async function handleScanRequest(req: Request, cfg: ScanConfig): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt || !(await cfg.verifyUser(jwt))) return json({ error: 'Nicht angemeldet' }, 401);
  if (!cfg.apiKey) return json({ error: 'KI nicht eingerichtet', code: 'not_configured' }, 503);

  let body: { image?: string; mime?: string; today?: string; timezone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Ungültige Anfrage' }, 400);
  }
  const mime = body.mime ?? '';
  if (!body.image || !/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) {
    return json({ error: 'Bild fehlt oder hat ein ungültiges Format' }, 400);
  }
  if (body.image.length > MAX_BASE64) return json({ error: 'Bild ist zu gross' }, 413);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today ?? '')
    ? body.today!
    : new Date().toISOString().slice(0, 10);
  const timezone = (body.timezone ?? 'Europe/Zurich').slice(0, 64);

  const doFetch = cfg.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildPrompt(today, timezone) },
                { inline_data: { mime_type: mime, data: body.image } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: SCHEMA,
            temperature: 0,
          },
        }),
      },
    );
  } catch {
    return json({ error: 'KI nicht erreichbar', code: 'upstream' }, 502);
  }
  if (res.status === 429) return json({ error: 'KI-Limit erreicht', code: 'rate_limit' }, 429);
  if (!res.ok) return json({ error: 'KI-Fehler', code: 'upstream', status: res.status }, 502);

  try {
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return json({ appointments: sanitize(JSON.parse(text)) });
  } catch {
    return json({ error: 'Antwort der KI nicht lesbar', code: 'upstream' }, 502);
  }
}
