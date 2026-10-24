// Termine per KI aus einem Foto lesen (Edge Function «scan-document», siehe supabase/functions).
import { supabase } from './supabase';
import { toDateInput } from './dates';
import { toJpegBase64 } from './ocr';
import type { FoundAppointment } from './docScan';

export class ScanAiError extends Error {
  constructor(
    message: string,
    readonly code: 'not_configured' | 'rate_limit' | 'offline' | 'failed' | 'declined',
  ) {
    super(message);
  }
}

export async function scanWithAi(file: File): Promise<FoundAppointment[]> {
  if (!navigator.onLine) throw new ScanAiError('Keine Internetverbindung', 'offline');
  const image = await toJpegBase64(file);
  const { data, error } = await supabase.functions.invoke<{
    appointments: { title: string; date: string; time: string | null; note: string }[];
  }>('scan-document', {
    body: {
      image,
      mime: 'image/jpeg',
      today: toDateInput(new Date()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  if (error) {
    let code: ScanAiError['code'] = 'failed';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json().catch(() => null)) as { code?: string } | null;
      if (body?.code === 'not_configured') code = 'not_configured';
      else if (body?.code === 'rate_limit') code = 'rate_limit';
    }
    // 404: Funktion noch nicht veröffentlicht
    if (ctx?.status === 404) code = 'not_configured';
    throw new ScanAiError(error.message, code);
  }
  return (data?.appointments ?? []).map((a) => ({
    date: a.date,
    time: a.time,
    title: a.title,
    snippet: a.note,
  }));
}
