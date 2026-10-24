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
