/// <reference lib="webworker" />
// Service Worker: Offline-Cache der App und Web-Push (Erinnerungen, Mitteilungen).
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('install', () => void self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

interface PushData {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  const fallback: PushData = { title: 'Pendenzen', body: '', url: self.registration.scope };
  const data = ((): PushData => {
    try {
      return { ...fallback, ...(event.data?.json() as Partial<PushData>) };
    } catch {
      return { ...fallback, body: event.data?.text() ?? '' };
    }
  })();
  // iOS verlangt, dass jede Push-Nachricht eine sichtbare Benachrichtigung auslöst
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: `${self.registration.scope}pwa-192.png`,
      badge: `${self.registration.scope}pwa-192.png`,
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string =
    (event.notification.data as { url?: string } | undefined)?.url ?? self.registration.scope;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', url });
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
