# Pendenzen

Pendenzenliste als Progressive Web App (iPhone und PC), kostenlos betrieben über GitHub Pages und Supabase.

**Live:** https://kenjinathor.github.io/Pendenzenliste/

## Entwicklung

```bash
npm install
npm run dev      # lokal starten
npm run lint && npm test && npm run build
npm run test:e2e # Playwright-Tests (Supabase wird gemockt)
npm run icons    # PNG-Icons aus public/icon.svg neu erzeugen
```

## Deployment

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Actions auf GitHub Pages.
Einmalig nötig: Repository → **Settings → Pages → Source: GitHub Actions**.

Die vollständige Einrichtungsanleitung (Supabase, Google-Login, Push) folgt in den nächsten Phasen.

## Einrichtung Supabase und Login (Phase 3)

1. **Supabase-Projekt:** auf https://supabase.com ein neues Projekt erstellen (Region: Frankfurt/Zürich, Gratis-Plan).
2. **Datenbank:** im Supabase-Dashboard → **SQL Editor** den Inhalt von
   `supabase/migrations/20261022000001_core_schema.sql` einfügen und ausführen.
3. **Schlüssel:** **Project Settings → API**: `Project URL` und `anon public`-Key kopieren.
4. **GitHub-Secrets:** Repo → Settings → Secrets and variables → Actions → _New repository secret_:
   `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
5. **Auth-URLs:** Supabase → **Authentication → URL Configuration**
   - Site URL: `https://kenjinathor.github.io/Pendenzenliste/`
   - Redirect URLs: `https://kenjinathor.github.io/Pendenzenliste/**` und `http://localhost:5173/**`
6. **Google-Login:** Google Cloud Console → OAuth-Client (Webanwendung) erstellen, als Redirect-URI
   `https://<PROJEKT-ID>.supabase.co/auth/v1/callback` eintragen; Client-ID und Secret in Supabase unter
   **Authentication → Providers → Google** eintragen.
7. **E-Mail-Code:** Supabase → **Authentication → Email Templates → Magic Link**: den Text um
   `Dein Code: {{ .Token }}` ergänzen (so funktioniert die Anmeldung auch in der installierten iPhone-App).
8. Deployment neu starten (Actions → _Deploy auf GitHub Pages_ → Run workflow).

Tests der Zugriffsregeln: `supabase/tests/rls_smoketest.sql` (gegen eine lokale Postgres-Instanz mit Supabase-Stubs).
