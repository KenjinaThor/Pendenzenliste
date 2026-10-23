// Automatische Updates: Die App sucht beim Öffnen, beim Zurückkehren und stündlich nach einer neuen Version.
// Ist sie geladen, wird sie übernommen, sobald das gefahrlos geht (nichts in Bearbeitung, keine offenen
// Änderungen in der Warteschlange und kurz keine Eingabe) – ohne dass jemand «neu laden» drücken muss.
import { Workbox } from 'workbox-window';
import { queryClient } from './queryClient';

const IDLE_MS = 20_000;
const CHECK_MS = 60 * 60 * 1000;

let lastInput = Date.now();
let updateReady = false;

/** true, wenn ein Neuladen niemandem etwas wegnimmt. */
export function isSafeToReload(now = Date.now()): boolean {
  if (queryClient.isMutating() > 0) return false;
  if (document.querySelector('[role="dialog"]')) return false;
  const a = document.activeElement;
  if (
    a instanceof HTMLInputElement ||
    a instanceof HTMLTextAreaElement ||
    a instanceof HTMLSelectElement
  ) {
    return false;
  }
  return document.visibilityState === 'hidden' || now - lastInput >= IDLE_MS;
}

function tryReload() {
  if (updateReady && isSafeToReload()) window.location.reload();
}

export function setupUpdates() {
  // Alte Dateien einer früheren Version sind nach einem Update weg: dann einfach neu laden
  window.addEventListener('vite:preloadError', () => window.location.reload());

  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const wb = new Workbox(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });

  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, () => (lastInput = Date.now()), { passive: true });
  }

  // Der neue Service Worker übernimmt sofort (skipWaiting); die Seite lädt danach die neuen Dateien.
  const hadController = Boolean(navigator.serviceWorker.controller);
  wb.addEventListener('controlling', () => {
    if (!hadController) return; // erste Installation: nichts zu ersetzen
    updateReady = true;
    // Gleich nach dem Öffnen ist noch nichts eingegeben: sofort übernehmen
    if (performance.now() < 15_000 && isSafeToReload(Number.MAX_SAFE_INTEGER)) {
      window.location.reload();
    } else tryReload();
  });

  const check = () => void wb.update().catch(() => undefined);
  void wb.register().then(check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
    tryReload();
  });
  window.addEventListener('online', check);
  setInterval(check, CHECK_MS);
  setInterval(tryReload, 5_000);
}
