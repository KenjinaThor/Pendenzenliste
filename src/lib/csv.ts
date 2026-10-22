// Minimaler CSV-Leser/-Schreiber (RFC 4180): Anführungszeichen, Trennzeichen und Zeilenumbrüche in Feldern.

/** Das Byte-Order-Mark, mit dem Excel UTF-8-Dateien beginnt. */
export const BOM = String.fromCharCode(0xfeff);

export const stripBom = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text);

/** Erkennt das Trennzeichen anhand der ersten Zeile (Excel in der Schweiz/Deutschland schreibt «;»). */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  let inQuotes = false;
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch as keyof typeof counts]++;
  }
  const best = (Object.entries(counts) as [';' | ',' | '\t', number][]).sort(
    (a, b) => b[1] - a[1],
  )[0];
  return best[1] > 0 ? best[0] : ';';
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const src = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows: string[][], delimiter = ';'): string {
  const cell = (v: string) =>
    /["\r\n]/.test(v) || v.includes(delimiter) ? `"${v.replace(/"/g, '""')}"` : v;
  return rows.map((r) => r.map(cell).join(delimiter)).join('\r\n') + '\r\n';
}
