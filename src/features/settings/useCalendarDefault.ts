import { useAppSettings } from './useAppSettings';

/** Standard aus den Einstellungen: Neue Pendenzen im Kalender-Abo anzeigen? (ohne Angabe: ja) */
export function useCalendarDefault(): boolean {
  return useAppSettings().calendarDefault;
}
