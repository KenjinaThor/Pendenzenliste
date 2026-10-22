import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { InstallHint } from '../features/onboarding/InstallHint';
import { SettingsPage } from '../features/settings/SettingsPage';
import { isSupabaseConfigured } from '../lib/supabase';

function Home() {
  return (
    <div className="mx-auto max-w-xl p-4">
      <h2 className="text-xl font-semibold">Willkommen!</h2>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        Du bist angemeldet. Die Pendenzenliste folgt in der nächsten Phase.
      </p>
    </div>
  );
}

function Shell() {
  return (
    <div className="flex h-full flex-col pt-[var(--safe-top)]">
      <InstallHint />
      <div className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <nav className="flex border-t border-slate-200 bg-white pb-[var(--safe-bottom)] dark:border-slate-700 dark:bg-slate-800">
        <a href="#/" className="flex-1 py-3 text-center text-sm font-medium">
          Start
        </a>
        <a href="#/einstellungen" className="flex-1 py-3 text-center text-sm font-medium">
          Einstellungen
        </a>
      </nav>
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (!isSupabaseConfigured) {
    return (
      <main className="flex h-full items-center justify-center p-6 text-center">
        <p>
          Supabase ist noch nicht eingerichtet (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen).
        </p>
      </main>
    );
  }
  if (loading) return <main className="flex h-full items-center justify-center">Lade …</main>;
  return session ? <Shell /> : <LoginPage />;
}

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
