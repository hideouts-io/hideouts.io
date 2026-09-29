/**
 * App icons, drawn from the same mark as public/favicon.svg. The output is
 * committed; rerun `npm run icons` after changing the mark.
 *
 *   public/apple-touch-icon.png      180×180, full-bleed (iOS rounds the corners)
 *   public/favicon-32.png            32×32 fallback for browsers without SVG favicons
 *   public/icons/icon-192.png        rounded, for the web app manifest
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png  full-bleed, mark inside the maskable safe zone
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

const BG = '#0a0c0f';
const INK = '#5eead4';
// The mark on a 32-unit grid, as in favicon.svg.
const MARK = `<path d="M9 25V14.5a7 7 0 0 1 14 0V25" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16.5" r="2.3" fill="${INK}"/><path d="M16 18.5v3.2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;

/** The mark centered on a 32-unit square, scaled to `scale` of its favicon size. */
function svg({ rounded, scale }: { rounded: boolean; scale: number }) {
  const offset = 16 - 16 * scale;
  // Visually center the arch (its box is y 7.5–25, slightly low of center).
  const nudge = -0.25 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" ${rounded ? 'rx="8"' : ''} fill="${BG}"/>
  <g transform="translate(${offset} ${offset + nudge}) scale(${scale})">${MARK}</g>
</svg>`;
}

async function png(file: string, size: number, opts: { rounded: boolean; scale: number }) {
  await sharp(Buffer.from(svg(opts)), { density: Math.ceil((size / 32) * 72) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, file));
  console.log(`  ✓ ${file}`);
}

await mkdir(join(PUBLIC, 'icons'), { recursive: true });
await png('apple-touch-icon.png', 180, { rounded: false, scale: 0.9 });
await png('favicon-32.png', 32, { rounded: true, scale: 1 });
await png('icons/icon-192.png', 192, { rounded: true, scale: 1 });
await png('icons/icon-512.png', 512, { rounded: true, scale: 1 });
// Maskable icons may be cropped to a circle of 80% diameter; keep the mark well inside it.
await png('icons/icon-maskable-512.png', 512, { rounded: false, scale: 0.75 });
console.log('✓ Icons written to public/');
