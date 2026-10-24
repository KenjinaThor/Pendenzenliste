import { useState } from 'react';
import { useMyProfile, useUpdateProfile } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { PushSettings } from './PushSettings';
import { storedTheme, type ThemeChoice } from './ThemeProvider';

export function SettingsPage() {
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const user = session?.user;
  const { data: profile } = useMyProfile(user?.id);
  const updateProfile = useUpdateProfile(user?.id);
  const name =
    profile?.name || ((user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '');
  const [draftName, setDraftName] = useState<string | null>(null);
  const theme: ThemeChoice = profile?.theme ?? storedTheme();
  const avatar = user?.user_metadata?.avatar_url as string | undefined;

  async function deleteAccount() {
    const ok = window.confirm(
      'Konto wirklich löschen? Alle deine Daten und von dir besessenen Listen werden unwiderruflich gelöscht.',
    );
    if (!ok) return;
    const { error } = await supabase.rpc('delete_my_account');
    if (error) setError(error.message);
    else await supabase.auth.signOut();
  }

  return (
    <section className="mx-auto max-w-xl p-4">
      <h2 className="mb-4 text-xl font-semibold">Einstellungen</h2>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800">
        {avatar ? (
          <img
            src={avatar}
            alt=""
            className="h-12 w-12 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-lg font-bold text-white">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{user?.email}</p>
        </div>
      </div>
      <section
        aria-label="Profil und Darstellung"
        className="mt-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800"
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            value={draftName ?? name}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              const next = (draftName ?? '').trim();
              if (next && next !== profile?.name) updateProfile.mutate({ name: next });
              setDraftName(null);
            }}
            maxLength={80}
            className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
          />
        </label>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          So sehen dich andere in geteilten Listen.
        </p>
        <div className="mt-4" role="group" aria-label="Darstellung">
          <p className="mb-2 text-sm font-medium">Darstellung</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['system', 'System'],
                ['light', 'Hell'],
                ['dark', 'Dunkel'],
              ] as [ThemeChoice, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={theme === value}
                onClick={() => updateProfile.mutate({ theme: value })}
                className={`h-11 rounded-xl text-sm font-medium ${theme === value ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section
        aria-label="Kalender-Abo"
        className="mt-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800"
      >
        <label className="flex items-start gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={profile?.calendar_default ?? true}
            disabled={!profile}
            onChange={(e) => updateProfile.mutate({ calendar_default: e.target.checked })}
            className="mt-0.5 h-5 w-5 accent-indigo-600"
          />
          <span>
            Neue Pendenzen standardmässig im Kalender anzeigen
            <span className="mt-1 block text-xs font-normal text-slate-600 dark:text-slate-400">
              Gilt für das Kalender-Abo (iPhone, Google, Outlook). Beim Erfassen kannst du es pro
              Pendenz ändern. Bereits erfasste Pendenzen bleiben unverändert.
            </span>
          </span>
        </label>
      </section>
      <PushSettings />
      <a
        href="#/kalender"
        className="mt-4 flex h-12 items-center justify-center rounded-xl bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
      >
        📆 Kalender verbinden
      </a>
      <a
        href="#/papierkorb"
        className="mt-3 flex h-12 items-center justify-center rounded-xl bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
      >
        🗑️ Papierkorb
      </a>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-4 h-12 w-full rounded-xl bg-slate-200 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
      >
        Abmelden
      </button>
      <button
        onClick={deleteAccount}
        className="mt-3 h-12 w-full rounded-xl border border-red-300 font-medium text-red-700 dark:text-red-300"
      >
        Konto und alle Daten löschen
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <p className="mt-6 text-center text-xs text-slate-600 dark:text-slate-400">
        Version vom {new Date(__BUILD_TIME__).toLocaleString('de-CH')} · Updates werden automatisch
        übernommen
      </p>
    </section>
  );
}
