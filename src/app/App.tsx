import { onlineManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '../features/settings/ThemeProvider';
import { AuthProvider, useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { AcceptInvitePage } from '../features/sharing/AcceptInvitePage';
import { TaskDeepLink } from '../features/tasks/TaskDeepLink';
import { ListPage } from '../features/lists/ListPage';
import { ListsPage } from '../features/lists/ListsPage';
import { SearchPage } from '../features/search/SearchPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TrashPage } from '../features/trash/TrashPage';
import { ViewPage } from '../features/views/ViewPage';
import { clearLocalData, persister, queryClient } from '../lib/queryClient';
import { isSupabaseConfigured } from '../lib/supabase';
import { VIEWS } from '../lib/views';
import { AppShell } from './AppShell';

// Selten genutzte Seiten werden erst bei Bedarf geladen (schnellerer Start)
const CalendarViewPage = lazy(() =>
  import('../features/calendarview/CalendarViewPage').then((m) => ({
    default: m.CalendarViewPage,
  })),
);
const StatsPage = lazy(() =>
  import('../features/stats/StatsPage').then((m) => ({ default: m.StatsPage })),
);
const DataPage = lazy(() =>
  import('../features/data/DataPage').then((m) => ({ default: m.DataPage })),
);
const TemplatesPage = lazy(() =>
  import('../features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
);
const CalendarPage = lazy(() =>
  import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })),
);
const SmartListPage = lazy(() =>
  import('../features/filters/SmartListPage').then((m) => ({ default: m.SmartListPage })),
);

function Authenticated() {
  return (
    <Suspense
      fallback={<p className="px-4 py-12 text-center text-slate-600 dark:text-slate-400">Lade …</p>}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/heute" replace />} />
          {VIEWS.map((v) => (
            <Route key={v.key} path={`/${v.key}`} element={<ViewPage view={v.key} />} />
          ))}
          <Route path="/liste/:id" element={<ListPage />} />
          <Route path="/filter/:id" element={<SmartListPage />} />
          <Route path="/kalenderansicht" element={<CalendarViewPage />} />
          <Route path="/statistik" element={<StatsPage />} />
          <Route path="/listen" element={<ListsPage />} />
          <Route path="/suche" element={<SearchPage />} />
          <Route path="/daten" element={<DataPage />} />
          <Route path="/vorlagen" element={<TemplatesPage />} />
          <Route path="/papierkorb" element={<TrashPage />} />
          <Route path="/mitteilungen" element={<NotificationsPage />} />
          <Route path="/einladung/:token" element={<AcceptInvitePage />} />
          <Route path="/kalender" element={<CalendarPage />} />
          <Route path="/pendenz/:id" element={<TaskDeepLink />} />
          <Route path="/einstellungen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/heute" replace />} />
        </Route>
      </Routes>
    </Suspense>
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
  return session ? <Authenticated /> : <LoginPage />;
}

/** Beim Abmelden den lokalen Zwischenspeicher leeren (keine Daten für die nächste Person auf demselben Gerät). */
function CacheGuard() {
  const { session, loading } = useAuth();
  useEffect(() => {
    if (!loading && !session) void clearLocalData();
  }, [session, loading]);
  return null;
}

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

export function App() {
  return (
    <AuthProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: ONE_WEEK, buster: 'v1' }}
        // gespeicherte, noch nicht übertragene Änderungen nach dem Neuladen fortsetzen
        onSuccess={() => {
          // Ohne Verbindung bleiben die Änderungen vorgemerkt; sobald sie zurückkehrt, setzt React Query sie selbst fort.
          if (onlineManager.isOnline()) {
            void queryClient.resumePausedMutations().then(() => queryClient.invalidateQueries());
          }
        }}
      >
        <ThemeProvider>
          <CacheGuard />
          <Gate />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </AuthProvider>
  );
}
