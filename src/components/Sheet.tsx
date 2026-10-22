import { useEffect, type ReactNode } from 'react';

/** Modales Fenster: auf dem iPhone von unten, am PC zentriert. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl md:rounded-3xl dark:bg-slate-800"
      >
        <header className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            aria-label="Schliessen"
            onClick={onClose}
            className="h-9 w-9 rounded-full text-xl text-slate-600 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-700"
          >
            ×
          </button>
        </header>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,var(--safe-bottom))]">{children}</div>
      </div>
    </div>
  );
}
