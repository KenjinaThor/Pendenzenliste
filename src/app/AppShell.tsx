import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { useLists, useSaveList, useTasks } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useRealtimeSync } from '../features/sharing/useRealtimeSync';
import { countFor } from '../lib/views';
import { useAuth } from '../features/auth/AuthProvider';
import { SyncBanner } from '../components/SyncBanner';
import { InstallHint } from '../features/onboarding/InstallHint';
import { Shortcuts, SHOW_SHORTCUTS_EVENT } from '../features/shortcuts/Shortcuts';
import { EditorProvider, useEditor } from '../features/tasks/EditorContext';
import { SelectionProvider } from '../features/tasks/SelectionContext';
import { WhatsNew } from '../components/WhatsNew';
import { NavContent } from './NavContent';
import { SnackbarProvider } from '../components/Snackbar';
import { toDateInput } from '../lib/dates';

const tab = ({ isActive }: { isActive: boolean }) =>
  `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'font-semibold text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`;

function Fab() {
  const { newTask } = useEditor();
  const listMatch = useMatch('/liste/:id');
  const viewMatch = useMatch('/:view');
  const today = viewMatch?.params.view === 'heute' ? toDateInput(new Date()) : undefined;
  return (
    <button
      aria-label="Neue Pendenz"
      onClick={() => newTask({ list_id: listMatch?.params.id, date: today })}
      className="fixed right-4 bottom-[calc(4.5rem+var(--safe-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-3xl text-white shadow-lg active:bg-brand-700 md:right-8 md:bottom-8"
    >
      +
    </button>
  );
}

/** Legt beim allerersten Start automatisch die Liste «Persönlich» an. */
function useEnsureDefaultList() {
  const { data: lists, isSuccess } = useLists();
  const save = useSaveList();
  const created = useRef(false);
  useEffect(() => {
    if (isSuccess && lists.length === 0 && !created.current) {
      created.current = true;
      save.mutate({ name: 'Persönlich', emoji: '🏠', color: '#6366f1' });
    }
  }, [isSuccess, lists, save]);
}

/** Offene Einladungen annehmen: per E-Mail-Adresse und per zwischengespeichertem Einladungslink. */
function useInvites() {
  const navigate = useNavigate();
  useEffect(() => {
    void supabase.rpc('claim_email_invites');
    let token: string | null = null;
    try {
      token = localStorage.getItem('pendingInvite');
    } catch {
      /* ignorieren */
    }
    if (token) navigate(`/einladung/${token}`, { replace: true });
  }, [navigate]);
}

export function AppShell() {
  useEnsureDefaultList();
  useRealtimeSync();
  useInvites();
  const { data: tasks = [] } = useTasks();
  const { session } = useAuth();
  const now = new Date();
  const todayCount = countFor('heute', tasks, now, session?.user.id);

  return (
    <SnackbarProvider>
      <EditorProvider>
        <SelectionProvider>
          <Shortcuts />
          <WhatsNew />
          <div className="flex h-full pt-[var(--safe-top)]">
            <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-slate-200 p-3 md:block dark:border-slate-700">
              <div className="mb-4 flex items-center gap-2 px-3 pt-2">
                <img
                  src={`${import.meta.env.BASE_URL}icon.svg`}
                  alt=""
                  className="h-8 w-8 rounded-lg"
                />
                <span className="text-lg font-bold">Pendenzen</span>
              </div>
              <NavContent />
              <button
                onClick={() => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT))}
                className="mt-4 w-full rounded-xl px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                ⌨️ Tastenkürzel (?)
              </button>
            </aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <SyncBanner />
              <InstallHint />
              <main className="flex-1 overflow-y-auto pb-28 md:pb-8">
                <Outlet />
              </main>
              <nav
                aria-label="Hauptmenü"
                className="flex border-t border-slate-200 bg-white pb-[var(--safe-bottom)] md:hidden dark:border-slate-700 dark:bg-slate-800"
              >
                <NavLink to="/heute" className={tab}>
                  <span aria-hidden className="text-xl">
                    ☀️
                  </span>
                  Heute
                  {todayCount > 0 && (
                    <span className="absolute top-1 right-1/4 rounded-full bg-indigo-600 px-1.5 text-[10px] text-white">
                      {todayCount}
                    </span>
                  )}
                </NavLink>
                <NavLink to="/demnaechst" className={tab}>
                  <span aria-hidden className="text-xl">
                    🗓️
                  </span>
                  Demnächst
                </NavLink>
                <NavLink to="/listen" className={tab}>
                  <span aria-hidden className="text-xl">
                    📋
                  </span>
                  Listen
                </NavLink>
                <NavLink to="/suche" className={tab}>
                  <span aria-hidden className="text-xl">
                    🔍
                  </span>
                  Suche
                </NavLink>
                <NavLink to="/einstellungen" className={tab}>
                  <span aria-hidden className="text-xl">
                    ⚙️
                  </span>
                  Mehr
                </NavLink>
              </nav>
            </div>
          </div>
          <Fab />
        </SelectionProvider>
      </EditorProvider>
    </SnackbarProvider>
  );
}
