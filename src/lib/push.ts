import { supabase } from './supabase';

export type PushSupport = 'unsupported' | 'needs-install' | 'ready';

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Push funktioniert im Browser direkt, auf dem iPhone nur bei installierter App (ab iOS 16.4). */
export function pushSupport(): PushSupport {
  if (isIos && !isStandalone()) return 'needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return isIos ? 'needs-install' : 'unsupported';
  }
  return 'ready';
}

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration()).pushManager.getSubscription();
}

/** Fragt die Berechtigung an, abonniert Push und speichert das Gerät in der Datenbank. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt.');

  const { data: key, error } = await supabase.rpc('get_vapid_public_key');
  if (error) throw error;
  if (!key) {
    throw new Error(
      'Der Push-Dienst wird gerade vorbereitet. Bitte versuche es in einer Minute noch einmal.',
    );
  }

  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(key as string),
    }));
  const json = sub.toJSON();
  const { error: saveError } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'endpoint' },
  );
  if (saveError) throw saveError;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

export async function sendTestNotification(): Promise<void> {
  const { error } = await supabase.rpc('send_test_notification');
  if (error) throw error;
}
