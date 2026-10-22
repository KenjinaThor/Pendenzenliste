import { supabase } from './supabase';

/** Adresse des ICS-Feeds (https) für einen Token. */
export function feedUrl(token: string): string {
  // Die Projekt-Adresse steckt im Supabase-Client; so gilt dieselbe Normalisierung wie überall.
  const base = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
  return `${base}/functions/v1/calendar/${token}.ics`;
}

/** webcal://-Variante: öffnet auf dem iPhone direkt den Abo-Dialog. */
export const toWebcal = (url: string) => url.replace(/^https?:\/\//, 'webcal://');
