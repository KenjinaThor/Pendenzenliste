import { useMyProfile } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';

/** Standard aus den Einstellungen: Neue Pendenzen im Kalender-Abo anzeigen? (ohne Angabe: ja) */
export function useCalendarDefault(): boolean {
  const { session } = useAuth();
  const { data: profile } = useMyProfile(session?.user.id);
  return profile?.calendar_default ?? true;
}
