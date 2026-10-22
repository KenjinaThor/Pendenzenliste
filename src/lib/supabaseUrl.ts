/** Reduziert die Adresse auf https://<projekt>.supabase.co (entfernt Zusätze wie /rest/v1/). */
export function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}
