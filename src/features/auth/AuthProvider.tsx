import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface AuthState {
  session: Session | null;
  loading: boolean;
  /** Fehler beim Anmelden (z. B. von Google/Supabase zurückgemeldet) */
  authError: string | null;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, authError: null });

// Ein Login-Code darf nur einmal eingelöst werden (React StrictMode startet Effekte doppelt).
let callbackPromise: Promise<string | null> | null = null;

/** Verarbeitet die Rückkehr vom Login (?code=… oder ?error=…) und räumt die Adresse auf. */
function handleAuthCallback(): Promise<string | null> {
  callbackPromise ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorText = params.get('error_description') ?? params.get('error');
    if (!code && !errorText) return null;

    // Adresse bereinigen, damit der Code nicht erneut verwendet wird
    const clean = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(null, '', clean);

    if (errorText) return errorText;
    const { error } = await supabase.auth.exchangeCodeForSession(code!);
    return error ? `${error.message}` : null;
  })();
  return callbackPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    session: null,
    loading: isSupabaseConfigured,
    authError: null,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    handleAuthCallback()
      .then(async (authError) => {
        const { data } = await supabase.auth.getSession();
        if (active) setState({ session: data.session, loading: false, authError });
      })
      .catch((e: unknown) => {
        if (active)
          setState({
            session: null,
            loading: false,
            authError: e instanceof Error ? e.message : String(e),
          });
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState((prev) => ({ ...prev, session, loading: false }));
      // Offene Einladungen auf meine E-Mail-Adresse automatisch annehmen
      if (event === 'SIGNED_IN' && session) void supabase.rpc('claim_email_invites');
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
