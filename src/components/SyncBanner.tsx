import { onlineManager, useMutationState } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/** Zeigt, wenn die App offline ist oder noch Änderungen auf die Übertragung warten. */
export function SyncBanner() {
  const online = useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
  );
  const waiting = useMutationState({
    filters: { status: 'pending' },
    select: (m) => m.state.isPaused,
  }).filter(Boolean).length;

  if (online && waiting === 0) return null;
  return (
    <div
      role="status"
      className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      {online
        ? '🔄 Änderungen werden übertragen …'
        : `📴 Offline${waiting ? ` – ${waiting} ${waiting === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf die Übertragung` : ' – du kannst weiterarbeiten, Änderungen werden später übertragen'}`}
    </div>
  );
}
