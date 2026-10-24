# Hinweise für Claude (Projekt «Pendenzen»)

- Sprache der App, Texte und Erklärungen an die Nutzerin/den Nutzer: **Deutsch**. Nutzer ist kein Profi: jeden manuellen Schritt genau erklären.
- Kosten: dauerhaft 0 CHF (GitHub Pages + Supabase Free + Gratis-KI). Nichts einbauen, was Geld kostet.
- Entwicklung auf dem vorgegebenen Branch; auf ausdrücklichen Wunsch direkt nach `main` (löst Deploy aus).

## Update-Info (Pflicht bei jedem Update)

Der Nutzer will, dass beim Öffnen der App nach jedem Update ein Fenster «Neu in der App» zeigt, was sich geändert hat.
**Bei jeder Änderung, die Nutzer bemerken (neue Funktion, Änderung am Aussehen oder Verhalten, wichtiger Fehler behoben):**

1. In `src/lib/changelog.ts` OBEN einen neuen Eintrag in `CHANGELOG` einfügen (id `JJJJ-MM-TT`, am selben Tag `-2`, `-3` …; Titel + kurze, verständliche Stichpunkte auf Deutsch). Ist der Tag schon vorhanden, den Eintrag ergänzen statt einen neuen anlegen, solange er noch nicht ausgeliefert wurde.
2. Danach `npm test` laufen lassen (`src/lib/changelog.test.ts` prüft Format und Reihenfolge).
3. In der Antwort an den Nutzer das Update ebenfalls kurz zusammenfassen.

## Vor jedem Push

`npx eslint . && npx tsc -b && npx vitest run && npx playwright test` (Playwright baut die App selbst).
