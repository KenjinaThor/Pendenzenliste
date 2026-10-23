// Edge Function «scan-document»: Termine aus einem Foto per KI (Google Gemini, Gratis-Kontingent) erkennen.
// Benötigt das Supabase-Geheimnis GEMINI_API_KEY (siehe README). Optional: GEMINI_MODEL.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleScanRequest } from '../_shared/scan.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

Deno.serve((req) =>
  handleScanRequest(req, {
    apiKey: Deno.env.get('GEMINI_API_KEY'),
    model: Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash',
    async verifyUser(jwt) {
      const { data, error } = await supabase.auth.getUser(jwt);
      return error ? null : (data.user?.id ?? null);
    },
  }),
);
