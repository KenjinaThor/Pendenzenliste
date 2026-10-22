// Erzeugt die PNG-Icons für PWA und iOS aus public/icon.svg
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url));
const out = (n) => new URL(`../public/${n}`, import.meta.url).pathname;

await sharp(svg).resize(192, 192).png().toFile(out('pwa-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('pwa-512.png'));
await sharp(svg).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
// Maskable: Motiv auf 70 % verkleinert, damit nichts abgeschnitten wird
const inner = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#4f6ee9' } })
  .composite([{ input: inner, gravity: 'center' }])
  .png()
  .toFile(out('pwa-maskable-512.png'));
console.log('Icons erzeugt.');
