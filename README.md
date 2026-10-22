# Pendenzen

Pendenzenliste als Progressive Web App für iPhone (zum Home-Bildschirm hinzugefügt) und PC-Browser. Läuft dauerhaft
**kostenlos**: GitHub Pages (Frontend) + Supabase Free Tier (Datenbank, Login, Live-Sync, Speicher, Edge Functions).

**Live:** https://kenjinathor.github.io/Pendenzenliste/

## Funktionen

- **Pendenzen** mit Notizen, Fälligkeit (ganztägig oder mit Uhrzeit und Dauer), Priorität, Status, Tags, Unteraufgaben,
  Wiederholung (täglich, wöchentlich an Wochentagen, monatlich, jährlich, «x Tage nach Erledigung»), Erinnerungen,
  Dateianhängen (Foto aufnehmen, PDF) und Papierkorb (30 Tage).
- **Schnelleingabe auf Deutsch:** «Steuererklärung morgen 14 Uhr #Privat !hoch @Anna +wichtig jeden Montag».
- **Ansichten:** Heute (mit Tagesfokus «Meine 3»), Demnächst, Überfällig, Alle, Mir zugewiesen, Erledigt, Kanban pro Liste,
  Kalender (Monat/Woche, Ziehen zum Verschieben, Schweizer Feiertage), Suche, Statistik. Filter und Sortierung lassen
  sich als **Intelligente Listen** speichern.
- **Zusammenarbeit:** Listen teilen (Besitzer/Bearbeiter/Leser) per Link oder E-Mail, Zuweisung, Kommentare mit @Erwähnung,
  Aktivitätsverlauf, Live-Synchronisierung auf allen Geräten.
- **Kalender-Abo:** persönlicher ICS-Feed für Apple Kalender, Google Kalender und Outlook; zusätzlich Einzel-Export pro Pendenz.
- **Benachrichtigungen:** Web-Push für Erinnerungen, Zuweisungen, Erwähnungen und eine tägliche Zusammenfassung.
- **Offline:** Die App öffnet sich ohne Verbindung; Änderungen werden vorgemerkt und später übertragen (neuester
  Zeitstempel gewinnt pro Feld).
- **Weiteres:** Vorlagen, Import/Export (CSV, JSON-Backup), Hell/Dunkel, Tastenkürzel am PC, Wischgesten auf dem iPhone.

## Architektur

```
iPhone / PC (React-PWA, Service Worker, IndexedDB-Zwischenspeicher)
        │  GitHub Pages (statisch, Deployment per GitHub Actions)
        ▼
   Supabase ─ Postgres + Row Level Security (alle Rechte in der Datenbank, getestet)
            ├ Auth (Google, E-Mail-Code)      ├ Realtime (Live-Sync)
            ├ Storage (Anhänge, privat)        ├ Edge Function «calendar»       → ICS-Feed (geheimer Link)
            └ pg_cron (jede Minute) ────────→  Edge Function «send-reminders»  → Web-Push (VAPID)
```

Sicherheit: Im öffentlichen Repository steht kein Geheimnis. Das Frontend kennt nur die öffentliche Projekt-URL und den
Publishable-Key; Zugriffe schützt Row Level Security. Geheimnisse (Zugriffs-Token für das Deployment, Push-Schlüssel,
Zeitplan-Geheimnis) liegen in GitHub-Secrets bzw. in der für App-Benutzer unlesbaren Tabelle `app_config`.

## Kosten und Gratis-Limits

| Dienst                     | Limit (Free)                  | Hinweis                                                     |
| -------------------------- | ----------------------------- | ----------------------------------------------------------- |
| GitHub Pages / Actions     | öffentliches Repo: unbegrenzt | Repo muss öffentlich bleiben                                |
| Supabase Datenbank         | 500 MB                        | Text-Daten, reicht für Jahre                                |
| Supabase Storage           | 1 GB                          | Anhänge max. 5 MB pro Datei, Fotos werden verkleinert       |
| Supabase Edge Functions    | 500 000 Aufrufe/Monat         | Zeitplan: 43 200 Aufrufe/Monat (1 pro Minute)               |
| Supabase Pause             | nach 7 Tagen Inaktivität      | verhindert der Workflow «Supabase Keep-alive» (alle 3 Tage) |
| E-Mail (Supabase-Standard) | sehr wenige Mails/Stunde      | für mehr: eigener SMTP-Dienst (z. B. Brevo, gratis)         |

Nicht enthalten, weil kostenpflichtig: «Mit Apple anmelden» (Apple-Entwicklerkonto, 99 USD/Jahr). Die Anmeldung ist so
aufgebaut, dass Apple später ergänzt werden kann.

## Einrichtung (einmalig)

### 1. GitHub

1. Repository **öffentlich** halten. Unter **Settings → Pages → Source** den Eintrag **GitHub Actions** wählen.
2. Jeder Push auf `main` baut und veröffentlicht die App (`.github/workflows/deploy.yml`).

### 2. Supabase-Projekt und Datenbank

1. Auf https://supabase.com ein Projekt erstellen (Gratis-Plan).
2. Im **SQL Editor** die Dateien aus `supabase/migrations/` **in dieser Reihenfolge** einfügen und mit **Run** ausführen
   (Warnung «destruktiv» bestätigen):

   | Datei                                       | Inhalt                                             |
   | ------------------------------------------- | -------------------------------------------------- |
   | `20261022000001_core_schema.sql`            | Tabellen, Rechte (RLS), Einladungen, Konto löschen |
   | `20261022000002_calendar_token_visible.sql` | Kalender-Link                                      |
   | `20261023000003_sharing_realtime.sql`       | Live-Sync, Mitteilungen, Kommentare                |
   | `20261024000004_push_reminders.sql`         | Erinnerungen, Push, Zeitplan, Aufräumen            |
   | `20261025000005_recurring_tasks.sql`        | wiederkehrende Pendenzen                           |
   | `20261026000006_offline_attachments.sql`    | Offline-Synchronisierung, Anhänge                  |

3. Zeitplan aktivieren: Erscheint beim Ausführen von Datei 4 ein Hinweis zu `pg_cron`/`pg_net`, diese unter
   **Database → Extensions** einschalten und den Abschnitt «Zeitplan» am Ende der Datei erneut ausführen. Danach einmalig
   (eigene Projekt-Adresse einsetzen): `select public.configure_push('https://<projekt-id>.supabase.co');`

### 3. Anmeldung

1. **Authentication → URL Configuration:** Site URL `https://kenjinathor.github.io/Pendenzenliste/`; Redirect URLs
   `https://kenjinathor.github.io/Pendenzenliste/**` und `http://localhost:5173/**`.
2. **Google:** In der Google Cloud Console (Google Auth Platform) einen OAuth-Client vom Typ «Webanwendung» erstellen, als
   Weiterleitungs-URI `https://<projekt-id>.supabase.co/auth/v1/callback` eintragen, die Zielgruppe «Extern» (Testmodus mit
   eingetragenen Testnutzern genügt) wählen. Client-ID und Client-Secret in Supabase unter
   **Authentication → Sign In / Providers → Google** eintragen.
3. Optional E-Mail-Code: In Supabase **Authentication → Emails** die Vorlage «Magic link» um `{{ .Token }}` ergänzen (setzt
   einen eigenen SMTP-Dienst voraus, z. B. Brevo).

### 4. GitHub-Secrets (Repo → Settings → Secrets and variables → Actions)

| Secret                   | Wert                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | `https://<projekt-id>.supabase.co` (nur die Adresse, ohne Zusatz)                                                |
| `VITE_SUPABASE_ANON_KEY` | Publishable Key (`sb_publishable_…`), **nie** den Secret Key                                                     |
| `SUPABASE_ACCESS_TOKEN`  | Supabase → Account preferences → Access Tokens; beschränkt auf das Projekt, Berechtigung «Edge Functions: Write» |

### 5. Edge Functions veröffentlichen

Actions → **Edge Functions deployen** → _Run workflow_. Danach geschieht das bei jeder Änderung unter `supabase/functions`
automatisch. Die Funktionen `calendar` (ICS-Feed) und `send-reminders` (Push) sind danach online; die Push-Schlüssel erzeugt
`send-reminders` beim ersten Lauf selbst.

### 6. iPhone

In Safari die Seite öffnen → **Teilen → Zum Home-Bildschirm**, die App von dort starten, anmelden und unter
**Einstellungen → Benachrichtigungen aktivieren** (Push funktioniert auf dem iPhone nur bei installierter App, ab iOS 16.4).
Kalender: **Einstellungen → Kalender verbinden → In Apple Kalender abonnieren**.

## Bedienung

**Schnelleingabe** (Feld oben in «Heute», «Alle» und jeder Liste; unter dem Feld steht, was erkannt wurde):

| Eingabe                                                                                                              | Bedeutung                   |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `heute`, `morgen`, `übermorgen`, `Freitag`, `nächsten Montag`, `in 3 Tagen`, `nächste Woche`, `Ende Monat`, `15.11.` | Datum                       |
| `14 Uhr`, `14:30`, `um 9`                                                                                            | Uhrzeit                     |
| `#Privat`, `#"Mein Haushalt"`                                                                                        | Liste                       |
| `!hoch`, `!mittel`, `!tief`                                                                                          | Priorität                   |
| `@Anna`, `@ich`                                                                                                      | Person (Mitglied der Liste) |
| `+wichtig`                                                                                                           | Tag                         |
| `jeden Tag`, `alle 2 Wochen`, `jeden Montag und Mittwoch`, `werktags`, `monatlich`, `3 Tage nach Erledigung`         | Wiederholung                |

**PC:** `N` neue Pendenz · `/` Suche · `J`/`K` auswählen · `E` erledigen · `Enter` öffnen · `?` Übersicht.
**iPhone:** Zeile nach rechts wischen = erledigt, nach links = «Morgen» oder löschen.

## Entwicklung

```bash
npm install
npm run dev          # lokal starten (.env.example nach .env kopieren)
npm run lint && npm run typecheck && npm test
npm run test:e2e     # Playwright (Supabase wird nachgebildet); einmalig: npx playwright install chromium
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres supabase/tests/run.sh   # Datenbank-Tests
npm run icons        # PNG-Icons aus public/icon.svg neu erzeugen
```

Tests: Vitest (Logik: Datums-Parser, Wiederholungen, ICS, Filter, Import/Export …), Playwright (Abläufe, Offline,
Barrierefreiheit mit axe in Hell und Dunkel) und SQL-Tests der Zugriffsregeln, Trigger und Funktionen (laufen auch in der CI).

Struktur: `src/features/*` (Oberfläche je Funktion), `src/lib/*` (reine Logik und Datenzugriff), `src/sw.ts` (Service Worker),
`supabase/migrations` (Datenbank), `supabase/functions` (Edge Functions), `supabase/tests`, `e2e/`.

## Bekannte Grenzen

- Nur mit Internetverbindung: wiederkehrende Pendenzen abhaken, Kommentare, Einladungen, Listen anlegen, Anhänge.
- Beim endgültigen Löschen einer Pendenz bleibt die Datei im Speicher liegen (nicht mehr abrufbar, belegt aber Platz).
- Feiertage: nationale und Hauptfeiertage ausgewählter Kantone, ohne Gewähr; Halbtags- und Gemeindefeiertage fehlen.
- Apple aktualisiert abonnierte Kalender mit Verzögerung (einstellbar unter iPhone-Einstellungen → Kalender → Accounts).
