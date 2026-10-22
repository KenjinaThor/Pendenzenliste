// Dateianhänge: Regeln und Vorbereitung (Fotos vom iPhone werden vor dem Hochladen verkleinert).
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB, entspricht dem Limit des Storage-Buckets
const MAX_IMAGE_SIDE = 2000;
const ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
];

export const isAllowedType = (type: string) => ALLOWED.includes(type.toLowerCase());

/** Dateiname für den Speicherpfad: keine Pfadtrenner oder Sonderzeichen, Endung bleibt erhalten. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '');
  return (cleaned || 'datei').slice(-100);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Zielgrösse eines Bildes mit gleichem Seitenverhältnis, längste Seite höchstens `max`. */
export function fitWithin(
  width: number,
  height: number,
  max = MAX_IMAGE_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Grosse Fotos verkleinern (JPEG, Qualität 85 %). Andere Dateien bleiben unverändert. */
export async function prepareUpload(file: File): Promise<File> {
  const canResize =
    file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/heic';
  if (!canResize || file.size <= 1.2 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
