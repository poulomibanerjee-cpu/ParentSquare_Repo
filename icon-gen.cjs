/* ============================================================================
 * icon-gen.cjs — zero-dependency PNG app-icon generator
 * Renders the Success Academy "Family Connect" mark: orange tile + white
 * rounded square (iOS masks the outer corners). Run:  node icon-gen.cjs
 * ==========================================================================*/
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// --- CRC32 (PNG chunk checksum) ---
const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

const ORANGE = [224, 82, 28, 255], WHITE = [255, 255, 255, 255];
const inRoundRect = (x, y, lo, hi, r) => {
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
};

function makePng(size, fullBleed) {
  const rowBytes = size * 4;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  const lo = size * 0.30, hi = size * 0.70, r = size * 0.11;
  for (let y = 0; y < size; y++) {
    raw[y * (rowBytes + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const px = inRoundRect(x, y, lo, hi, r) ? WHITE : ORANGE;
      const o = y * (rowBytes + 1) + 1 + x * 4;
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = px[3];
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const pub = path.join(__dirname, 'public');
const targets = [['icon-1024.png', 1024], ['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]];
targets.forEach(([name, size]) => { fs.writeFileSync(path.join(pub, name), makePng(size)); });
console.log('✅ icons written: ' + targets.map((t) => t[0]).join(', '));
