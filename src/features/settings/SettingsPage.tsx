import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { PushSettings } from './PushSettings';

export function SettingsPage() {
  const { session } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const user = session?.user;
  const name = (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? '';
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
          <p className="text-sm text-slate-500">{user?.email}</p>
        </div>
      </div>
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
        className="mt-3 h-12 w-full rounded-xl border border-red-300 font-medium text-red-700"
      >
        Konto und alle Daten löschen
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
