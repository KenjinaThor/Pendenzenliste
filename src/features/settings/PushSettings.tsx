import { useEffect, useState } from 'react';
import { useMyProfile, useUpdateProfile } from '../../lib/api';
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  sendTestNotification,
} from '../../lib/push';
import { useAuth } from '../auth/AuthProvider';

const card = 'mt-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-800';
const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

const BASE_ZONES = [
  'Europe/Zurich',
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Rome',
  'Europe/Paris',
  'Europe/London',
];

export function PushSettings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useMyProfile(userId);
  const updateProfile = useUpdateProfile(userId);
  const support = pushSupport();

  const [active, setActive] = useState<boolean | null>(null);
  const [permission, setPermission] = useState(
    typeof Notification === 'undefined' ? 'default' : Notification.permission,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (support !== 'ready') return;
    let cancelled = false;
    currentSubscription().then(
      (s) => !cancelled && setActive(Boolean(s)),
      () => !cancelled && setActive(false),
    );
    return () => {
      cancelled = true;
    };
  }, [support]);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'ok', text: success });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      if (typeof Notification !== 'undefined') setPermission(Notification.permission);
      if (support === 'ready')
        currentSubscription().then(
          (s) => setActive(Boolean(s)),
          () => {},
        );
    }
  }

  const zones = [...new Set([...(profile ? [profile.timezone] : []), ...BASE_ZONES])];
  const digest = profile?.daily_digest_time?.slice(0, 5) ?? '';

  return (
    <section aria-label="Erinnerungen" className={card}>
      <h2 className="mb-2 font-semibold">🔔 Erinnerungen</h2>

      {support === 'needs-install' && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Zuerst die App installieren</p>
          <p className="mt-1">
            Auf dem iPhone funktionieren Benachrichtigungen nur, wenn die App auf dem
            Home-Bildschirm liegt (ab iOS 16.4): In Safari auf <strong>Teilen</strong> tippen,{' '}
            <strong>«Zum Home-Bildschirm»</strong> wählen, die App von dort öffnen und diese Seite
            erneut aufrufen.
          </p>
        </div>
      )}
      {support === 'unsupported' && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Dieser Browser unterstützt keine Push-Benachrichtigungen.
        </p>
      )}

      {support === 'ready' && (
        <>
          {permission === 'denied' ? (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              Benachrichtigungen sind für diese App blockiert. Erlaube sie in den Einstellungen des
              Geräts oder Browsers und lade die Seite neu.
            </p>
          ) : active ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                ✓ Auf diesem Gerät aktiv
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    sendTestNotification,
                    'Test gesendet – die Nachricht kommt innerhalb einer Minute.',
                  )
                }
                className="h-11 rounded-xl bg-slate-100 font-medium text-slate-900 dark:bg-slate-700 dark:text-white"
              >
                Test-Benachrichtigung senden
              </button>
              <button
                disabled={busy}
                onClick={() => run(disablePush, 'Auf diesem Gerät ausgeschaltet.')}
                className="h-11 rounded-xl border border-slate-300 font-medium dark:border-slate-600"
              >
                Auf diesem Gerät ausschalten
              </button>
            </div>
          ) : (
            <button
              disabled={busy || active === null}
              onClick={() => run(enablePush, 'Benachrichtigungen sind aktiv.')}
              className="h-12 w-full rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
            >
              Benachrichtigungen aktivieren
            </button>
          )}
        </>
      )}

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-3 rounded-lg p-3 text-sm ${message.kind === 'error' ? 'bg-red-100 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}
        >
          {message.text}
        </p>
      )}

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h3 className="mb-2 text-sm font-semibold">Tägliche Zusammenfassung</h3>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={Boolean(digest)}
            disabled={!profile}
            onChange={(e) =>
              updateProfile.mutate({ daily_digest_time: e.target.checked ? '07:30' : null })
            }
          />
          Jeden Tag eine Übersicht erhalten («Heute fällig: 4 Pendenzen»)
        </label>
        {digest && (
          <label className="mt-2 flex flex-col gap-1 text-sm font-medium">
            Uhrzeit
            <input
              type="time"
              value={digest}
              onChange={(e) =>
                e.target.value && updateProfile.mutate({ daily_digest_time: e.target.value })
              }
              className={`${field} w-32`}
            />
          </label>
        )}
        <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
          Zeitzone
          <select
            value={profile?.timezone ?? 'Europe/Zurich'}
            disabled={!profile}
            className={field}
            onChange={(e) => updateProfile.mutate({ timezone: e.target.value })}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Ganztägige Pendenzen erinnern um 09:00 Uhr in dieser Zeitzone.
        </p>
        {updateProfile.error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {(updateProfile.error as Error).message}
          </p>
        )}
      </div>
    </section>
  );
}
