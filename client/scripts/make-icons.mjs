// Generates the PWA PNG icons (a white water drop on a blue tile) without any image libraries.
// Run: npm run icons
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { maskable = false } = {}) {
  const S = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const radius = maskable ? 0 : size * 0.22;
  const scale = maskable ? 0.62 : 0.78; // keep drop inside the maskable safe zone
  const cx = size / 2;
  const dropR = size * 0.24 * scale / 0.78;
  const dropCy = size * 0.58 - (0.78 - scale) * size * 0.05;
  const tipY = dropCy - dropR * 2.1;

  const inTile = (x, y) => {
    if (!radius) return true;
    const dx = Math.max(radius - x, 0, x - (size - radius));
    const dy = Math.max(radius - y, 0, y - (size - radius));
    return dx * dx + dy * dy <= radius * radius;
  };
  const inDrop = (x, y) => {
    const dx = x - cx;
    const dy = y - dropCy;
    if (dx * dx + dy * dy <= dropR * dropR) return true;
    if (y < tipY || y > dropCy) return false;
    // tangent lines from tip to circle form the top of the drop
    const t = (y - tipY) / (dropCy - tipY);
    const half = dropR * Math.sqrt(t) * 0.98;
    return Math.abs(dx) <= half;
  };

  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let tile = 0;
      let drop = 0;
      for (let sy = 0; sy < S; sy++)
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          if (inTile(px, py)) {
            tile++;
            if (inDrop(px, py)) drop++;
          }
        }
      const n = S * S;
      const a = tile / n;
      const d = tile ? drop / tile : 0;
      // gradient blue background (#0369a1 → #0ea5e9)
      const g = y / size;
      const bg = [3 + (14 - 3) * g, 105 + (165 - 105) * g, 161 + (233 - 161) * g];
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = Math.round(bg[0] * (1 - d) + 255 * d);
      raw[i + 1] = Math.round(bg[1] * (1 - d) + 255 * d);
      raw[i + 2] = Math.round(bg[2] * (1 - d) + 255 * d);
      raw[i + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'pwa-192.png'), png(192));
fs.writeFileSync(path.join(out, 'pwa-512.png'), png(512));
fs.writeFileSync(path.join(out, 'pwa-maskable-512.png'), png(512, { maskable: true }));
fs.writeFileSync(path.join(out, 'apple-touch-icon.png'), png(180, { maskable: true }));
console.log('Icons written to', out);
