import { SYNC_ERROR_EVENT } from '../lib/events';
import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface SnackbarMessage {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

const SnackbarContext = createContext<(m: SnackbarMessage) => void>(() => {});

/** Kurze Meldung unten, optional mit Aktion (z. B. «Rückgängig»). */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<SnackbarMessage | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((m: SnackbarMessage) => {
    window.clearTimeout(timer.current);
    setMessage(m);
    timer.current = window.setTimeout(() => setMessage(null), 5000);
  }, []);

  // Fehler beim Speichern (auch von Änderungen aus der Warteschlange) melden
  useEffect(() => {
    const onError = (e: Event) =>
      show({ text: `Speichern fehlgeschlagen: ${(e as CustomEvent<string>).detail}` });
    window.addEventListener(SYNC_ERROR_EVENT, onError);
    return () => window.removeEventListener(SYNC_ERROR_EVENT, onError);
  }, [show]);

  return (
    <SnackbarContext.Provider value={show}>
      {children}
      {message && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-[calc(4.5rem+var(--safe-bottom))] z-[60] mx-auto flex w-[calc(100%-2rem)] max-w-md items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg md:bottom-6 dark:bg-slate-100 dark:text-slate-900"
        >
          <span>{message.text}</span>
          {message.onAction && (
            <button
              className="font-semibold text-indigo-300 dark:text-indigo-600"
              onClick={() => {
                message.onAction?.();
                setMessage(null);
              }}
            >
              {message.actionLabel ?? 'Rückgängig'}
            </button>
          )}
        </div>
      )}
    </SnackbarContext.Provider>
  );
}

export const useSnackbar = () => useContext(SnackbarContext);
