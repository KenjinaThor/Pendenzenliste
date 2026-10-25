import { useCallback, useState } from 'react';
import { useLists, useMyProfile, useUpdateProfile } from '../../lib/api';
import { usePermissions } from '../sharing/usePermissions';
import { useAuth } from '../auth/AuthProvider';

// Standard-Einstellungen. Sie liegen im Profil (gelten dann auf allen Geräten). Fehlt die Datenbank-Erweiterung
// noch (Migration 8), speichert die App sie ersatzweise auf diesem Gerät, damit nichts verloren geht.
const LOCAL = { calendar: 'pref.calendarDefault', list: 'pref.defaultList' } as const;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignorieren */
  }
}

export function useAppSettings() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useMyProfile(userId);
  const update = useUpdateProfile(userId);
  const { data: lists = [] } = useLists();
  const perms = usePermissions();
  // Zähler erzwingt ein neues Rendern nach dem Schreiben in den lokalen Speicher
  const [, bump] = useState(0);
  const [localOnly, setLocalOnly] = useState(false);

  const calendarDefault =
    profile?.calendar_default ??
    (readLocal(LOCAL.calendar) === null ? true : readLocal(LOCAL.calendar) === '1');

  const wantedList =
    profile?.default_list_id !== undefined ? profile.default_list_id : readLocal(LOCAL.list);
  // nur gültig, wenn die Liste existiert und man dort schreiben darf
  const defaultListId =
    wantedList && lists.some((l) => l.id === wantedList) && perms.canEdit(wantedList)
      ? wantedList
      : null;

  /** Speichert im Profil; klappt das nicht (Spalte fehlt), nur auf diesem Gerät. */
  const save = useCallback(
    (patch: { calendar_default?: boolean; default_list_id?: string | null }) => {
      if (patch.calendar_default !== undefined)
        writeLocal(LOCAL.calendar, patch.calendar_default ? '1' : '0');
      if (patch.default_list_id !== undefined) writeLocal(LOCAL.list, patch.default_list_id);
      bump((n) => n + 1);
      update.mutate(patch, {
        onSuccess: () => setLocalOnly(false),
        onError: () => setLocalOnly(true),
      });
    },
    [update],
  );

  return {
    ready: Boolean(profile) || !userId,
    calendarDefault,
    defaultListId,
    /** true, wenn die Einstellung nur auf diesem Gerät gespeichert werden konnte */
    localOnly,
    setCalendarDefault: (v: boolean) => save({ calendar_default: v }),
    setDefaultList: (id: string | null) => save({ default_list_id: id }),
  };
}
