/** Vorschläge für die Vorlaufzeit (Minuten vor der Fälligkeit). */
export const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 2880] as const;

export function offsetLabel(min: number, allDay: boolean): string {
  if (min === 0) return allDay ? 'Am Fälligkeitstag, 09:00 Uhr' : 'Zum Fälligkeitszeitpunkt';
  if (min % 1440 === 0) return min === 1440 ? '1 Tag vorher' : `${min / 1440} Tage vorher`;
  if (min % 60 === 0) return min === 60 ? '1 Std. vorher' : `${min / 60} Std. vorher`;
  return `${min} Min. vorher`;
}

export function reminderLabel(
  r: { at?: string | null; offset_min?: number | null },
  allDay: boolean,
): string {
  if (r.at)
    return new Date(r.at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' });
  return offsetLabel(r.offset_min ?? 0, allDay);
}
