// Neuigkeiten für die Update-Info beim Öffnen der App («Neu in der App»).
// REGEL: Bei jedem Update, das Nutzer bemerken, kommt hier OBEN ein neuer Eintrag dazu (siehe CLAUDE.md).
// Die id ist «JJJJ-MM-TT» (bei mehreren am selben Tag «JJJJ-MM-TT-2» usw.) und muss absteigend sortiert sein.

export interface ChangelogEntry {
  id: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-25',
    title: 'Daily-Shuffle, Standardliste und neue Hintergrundfarben',
    items: [
      'Neuer Reiter «Shuffle» (🎰): Das Glück entscheidet, welche Pendenz als Nächstes dran ist. Du wählst zwischen Spielautomat, Glücksrad und Rubbellos. Wahlweise aus «Heute & überfällig» oder allen offenen Pendenzen, auf Wunsch mit Bevorzugung wichtiger Pendenzen.',
      'Neu in den Einstellungen: eine Standardliste für neue Pendenzen. Beim Erfassen lässt sie sich pro Pendenz ändern.',
      'Die Kalender-Auswahl lässt sich jetzt zuverlässig speichern; fehlt noch die Datenbank-Erweiterung, merkt sich die App die Einstellung auf dem Gerät und sagt dir Bescheid.',
      'Hellmodus: am PC bleibt der Hintergrund rosa, auf dem iPhone ist er ein sanftes Grau.',
      'Fehlt die Datenbank-Erweiterung noch, erscheint keine Fehlermeldung mehr beim Ändern der Standards; die App merkt sie sich auf dem Gerät.',
    ],
  },
  {
    id: '2026-10-24-2',
    title: 'Kalender: du bestimmst, was im Kalender erscheint',
    items: [
      'Neu in den Einstellungen: «Neue Pendenzen standardmässig im Kalender anzeigen» (ein/aus).',
      'Beim Erfassen gibt es die Auswahl «📆 Im Kalender anzeigen». Sie startet mit deinem Standard und lässt sich pro Pendenz ändern.',
      'Gilt für das Kalender-Abo (iPhone, Google, Outlook). Bereits erfasste Pendenzen bleiben im Kalender.',
    ],
  },
  {
    id: '2026-10-24',
    title: 'Foto-Scan: du wählst, ob die KI mitliest',
    items: [
      'Beim Dokument-Scan wählst du jetzt selbst: «Mit KI lesen» (genauer) oder «Nur auf diesem Gerät lesen» (das Foto bleibt auf dem Gerät).',
      'Neu: Diese Info zu den letzten Änderungen erscheint nach jedem Update beim Öffnen der App.',
    ],
  },
  {
    id: '2026-10-23',
    title: 'Updates, Farbe und KI-Scan',
    items: [
      'Updates werden automatisch übernommen, ohne dass du die App neu laden musst.',
      'Der Hellmodus hat einen rosa Hintergrund (kräftiger als zuerst).',
      'Dokumente und Briefe lassen sich per Kamera scannen (📷 neben der Schnelleingabe); Termine werden erkannt und als Pendenz angeboten.',
      'Erledigte Pendenzen verschwinden schneller aus dem Kalender-Abo.',
      'Bei «Wiederholen alle …» lässt sich die Zahl jetzt löschen und neu eingeben.',
    ],
  },
];

export const LATEST_CHANGELOG_ID = CHANGELOG[0].id;

/** Einträge, die neuer sind als der zuletzt gesehene (ohne Angabe: alle). */
export function unseenEntries(lastSeen: string | null, entries = CHANGELOG): ChangelogEntry[] {
  if (!lastSeen) return entries;
  return entries.filter((e) => e.id > lastSeen);
}
