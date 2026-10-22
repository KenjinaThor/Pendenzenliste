import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true, sobald die öffentlichen Supabase-Werte gesetzt sind (siehe .env.example). */
export const isSupabaseConfigured = Boolean(url && anonKey);

// Der anon-Key ist öffentlich; geschützt sind die Daten durch Row Level Security.
// PKCE: Der Login-Code kommt als ?code=… zurück und kollidiert so nicht mit dem HashRouter.
export const supabase = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
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
