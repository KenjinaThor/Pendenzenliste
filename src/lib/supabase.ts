import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** true, sobald gültige öffentliche Supabase-Werte gesetzt sind (siehe .env.example). */
export const isSupabaseConfigured = Boolean(url && /^https?:\/\//.test(url) && anonKey);

/** Öffentlicher Schlüssel (Publishable/anon Key). */
export const supabaseKey = anonKey ?? '';

// Der anon-Key ist öffentlich; geschützt sind die Daten durch Row Level Security.
// PKCE: Der Login-Code kommt als ?code=… zurück und kollidiert so nicht mit dem HashRouter.
export const supabase = createClient(
  isSupabaseConfigured ? url! : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey! : 'missing-anon-key',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Vollständige App-URL (inkl. GitHub-Pages-Unterpfad) als Rücksprungadresse nach dem Login. */
export const appUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
