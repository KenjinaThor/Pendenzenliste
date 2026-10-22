# Pendenzen

Pendenzenliste als Progressive Web App (iPhone und PC), kostenlos betrieben über GitHub Pages und Supabase.

**Live:** https://kenjinathor.github.io/Pendenzenliste/

## Entwicklung

```bash
npm install
npm run dev      # lokal starten
npm run lint && npm test && npm run build
npm run icons    # PNG-Icons aus public/icon.svg neu erzeugen
```

## Deployment

Jeder Push auf `main` baut die App und veröffentlicht sie über GitHub Actions auf GitHub Pages.
Einmalig nötig: Repository → **Settings → Pages → Source: GitHub Actions**.

Die vollständige Einrichtungsanleitung (Supabase, Google-Login, Push) folgt in den nächsten Phasen.
