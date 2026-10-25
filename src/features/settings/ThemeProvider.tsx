import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useMyProfile } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'theme';

export function storedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Farbe der Browserleiste im Hellmodus: Rosa am PC, Grau auf Touch-Geräten (siehe styles/index.css) */
const lightColor = () =>
  window.matchMedia('(hover: hover) and (pointer: fine)').matches ? '#f8cddf' : '#e6e7ec';

export function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* ignorieren */
  }
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0f172a' : lightColor());
}

/** Wendet die Darstellung an (Profil-Einstellung hat Vorrang) und folgt dem System, solange «System» gewählt ist. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { data: profile } = useMyProfile(session?.user.id);
  const choice = profile?.theme ?? storedTheme();

  useLayoutEffect(() => applyTheme(choice), [choice]);

  useEffect(() => {
    if (choice !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  return <>{children}</>;
}
