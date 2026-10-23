// Texterkennung (OCR) direkt im Gerät mit Tesseract.js. Programm und Deutsch-Sprachpaket liegen unter /ocr
// auf derselben Seite (kein Fremdserver); das Bild verlässt das Gerät nicht.

const MAX_SIDE = 2200;

/** Verkleinert das Foto (Handyfotos sind riesig) und macht es kontrastreicher. */
async function prepare(file: File, maxSide = MAX_SIDE, filter = true): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Das Bild konnte nicht verarbeitet werden.');
  if (filter) ctx.filter = 'grayscale(1) contrast(1.25)';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/** Verkleinertes JPEG (Base64) für die KI-Erkennung: genug für Text, klein für den Versand. */
export async function toJpegBase64(file: File): Promise<string> {
  const canvas = await prepare(file, 1800, false);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

export async function recognizeText(
  file: File,
  onProgress: (status: string, fraction: number) => void,
): Promise<string> {
  const canvas = await prepare(file);
  const { createWorker } = await import('tesseract.js');
  const base = new URL(`${import.meta.env.BASE_URL}ocr`, window.location.href).href;
  const worker = await createWorker('deu', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    gzip: true,
    logger: (m: { status: string; progress: number }) => onProgress(m.status, m.progress),
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
