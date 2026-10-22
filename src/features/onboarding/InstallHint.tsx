import { useState } from 'react';

const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function wasDismissed() {
  try {
    return localStorage.getItem('installHintDismissed') === '1';
  } catch {
    return false;
  }
}

/** Zeigt auf dem iPhone in Safari eine Anleitung «Zum Home-Bildschirm hinzufügen». */
export function InstallHint() {
  const [hidden, setHidden] = useState(wasDismissed);
  if (!isIos || isStandalone || hidden) return null;

  return (
    <div className="m-4 rounded-2xl bg-indigo-50 p-4 text-sm text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">
      <p className="font-semibold">App auf dem Home-Bildschirm installieren</p>
      <p className="mt-1">
        Tippe unten in Safari auf <strong>Teilen</strong> (Quadrat mit Pfeil) und dann auf{' '}
        <strong>«Zum Home-Bildschirm»</strong>. So fühlt sich Pendenzen wie eine App an und
        Erinnerungen funktionieren später.
      </p>
      <button
        className="mt-3 font-medium underline"
        onClick={() => {
          try {
            localStorage.setItem('installHintDismissed', '1');
          } catch {
            /* ignorieren */
          }
          setHidden(true);
        }}
      >
        Verstanden
      </button>
    </div>
  );
}
