import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { MutationCache, QueryClient, onlineManager } from '@tanstack/react-query';
import { del, get, set } from 'idb-keyval';
import { SYNC_ERROR_EVENT } from './events';
import { registerMutationDefaults } from './mutations';

/** Fehler beim Speichern (z. B. keine Berechtigung mehr) sichtbar machen – auch für Änderungen aus der Warteschlange. */
const mutationCache = new MutationCache({
  onError: (error) => {
    window.dispatchEvent(new CustomEvent(SYNC_ERROR_EVENT, { detail: (error as Error).message }));
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
      gcTime: 24 * 60 * 60 * 1000,
    },
    // Nicht in der Warteschlange geführte Schreibzugriffe (Kommentare, Einladungen …) schlagen ohne Verbindung sofort
    // fehl, statt unbemerkt zu warten.
    mutations: { networkMode: 'always' },
  },
});
registerMutationDefaults(queryClient);

// React Query nimmt anfangs «online» an; nach einem Neuladen ohne Verbindung tritt aber kein «offline»-Ereignis auf.
// Ohne diese Zeile würden vorgemerkte Änderungen sofort versucht, scheitern und verloren gehen.
onlineManager.setOnline(navigator.onLine);

// Lokaler Zwischenspeicher: Die App öffnet sich auch offline mit den zuletzt geladenen Daten.
const noStorage = typeof indexedDB === 'undefined';
export const persister = createAsyncStoragePersister({
  key: 'pendenzen-cache',
  throttleTime: 500,
  storage: noStorage
    ? { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
    : {
        getItem: async (k) => (await get<string>(k)) ?? null,
        setItem: (k, v) => set(k, v),
        removeItem: (k) => del(k),
      },
});

/** Beim Abmelden alle lokal gespeicherten Daten entfernen. */
export async function clearLocalData() {
  queryClient.clear();
  await persister.removeClient();
}
