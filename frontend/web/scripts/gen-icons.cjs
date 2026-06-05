// Generates placeholder PWA icons (no external deps — built-in zlib only).
// A white rounded-square "frame" mark on the brand indigo. These are intentional
// placeholders; drop real brand icons into public/icons/ with the same names to
// replace them. Re-run with: node scripts/gen-icons.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [43, 78, 167];     // brand indigo ≈ oklch(0.45 0.15 265) / #2b4ea7
const FG = [255, 255, 255];   // white mark

// --- minimal PNG (8-bit RGB) encoder ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
};
const pngFromRGB = (w, h, rgb) => {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit depth, color type 2 (RGB)
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
};

// inside a centered rounded square of half-size `h` and corner radius `r`?
const inRounded = (px, py, cx, cy, h, r) => {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  if (dx > h || dy > h) return false;
  if (dx <= h - r || dy <= h - r) return true;
  const ex = dx - (h - r), ey = dy - (h - r);
  return ex * ex + ey * ey <= r * r;
};

const draw = (size, { maskable = false } = {}) => {
  const rgb = Buffer.alloc(size * size * 3);
  const cx = size / 2, cy = size / 2;
  // Smaller mark for maskable so it survives the safe-zone crop (central ~80%).
  const outer = (size * (maskable ? 0.46 : 0.58)) / 2;
  const inner = (size * (maskable ? 0.2 : 0.26)) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5, py = y + 0.5;
      const mark = inRounded(px, py, cx, cy, outer, outer * 0.32) && !inRounded(px, py, cx, cy, inner, inner * 0.32);
      const c = mark ? FG : BG;
      const o = (y * size + x) * 3; rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  }
  return pngFromRGB(size, size, rgb);
};

const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), draw(192));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), draw(512));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), draw(512, { maskable: true }));
console.log('Wrote public/icons/{icon-192,icon-512,icon-maskable-512}.png');
