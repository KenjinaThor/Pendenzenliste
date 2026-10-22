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

## Kalender-Abo (Phase 5)

Die App liefert einen persönlichen ICS-Feed (Edge Function `calendar`). Einrichtung:

1. **Migration:** im Supabase **SQL Editor** den Inhalt von
   `supabase/migrations/20261022000002_calendar_token_visible.sql` ausführen.
2. **Zugriffs-Token:** Supabase → Konto-Symbol unten links → **Account preferences → Access Tokens →
   Generate new token** (Name z. B. `github-deploy`). Den Token als GitHub-Secret `SUPABASE_ACCESS_TOKEN`
   speichern (Repo → Settings → Secrets and variables → Actions).
3. **Function veröffentlichen:** Actions → _Edge Functions deployen_ → **Run workflow**. Danach wird sie bei jeder
   Änderung automatisch veröffentlicht.
4. In der App: **Einstellungen → Kalender verbinden → Kalender-Link erzeugen**.

Der Feed enthält alle offenen Pendenzen mit Fälligkeit aus den gewählten Listen (ganztägig oder mit Uhrzeit und
Dauer, Notizen, Unteraufgaben, Rück-Link und Erinnerung). Auf demselben Link funktionieren auch Google Kalender und
Outlook. Optional kann in Supabase (Edge Functions → Secrets) `APP_URL` gesetzt werden, falls sich die App-Adresse ändert.

## Teilen und Zusammenarbeit (Phase 6)

1. **Migration:** im Supabase **SQL Editor** den Inhalt von `supabase/migrations/20261023000003_sharing_realtime.sql`
   ausführen (aktiviert Echtzeit-Updates und die Benachrichtigungen bei Zuweisung und @Erwähnung).
2. Liste öffnen → **👥 Teilen**: Mitglieder sehen, Rollen setzen (Bearbeiter / Leser), Einladungslink erstellen.
   Mit E-Mail-Adresse erhält die Person automatisch Zugriff, sobald sie sich mit dieser Adresse anmeldet.
3. Pendenzen lassen sich Mitgliedern zuweisen («Mir zugewiesen»), kommentieren (`@Name` erwähnt jemanden) und der
   Verlauf zeigt alle Änderungen. Änderungen erscheinen live auf allen Geräten.

**Tests der Zugriffsregeln:** `supabase/tests/run.sh` führt alle Migrationen und `supabase/tests/rls.test.sql`
gegen eine leere Postgres-Datenbank aus (läuft auch in der CI). Lokal z. B. mit
`DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh`.
