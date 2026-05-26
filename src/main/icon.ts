import { nativeImage } from "electron";
import { deflateSync } from "zlib";
import * as fs from "fs";
import * as path from "path";

// Minimal CRC32 implementation (PNG chunk checksum)
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, typeB, data, crcB]);
}

function createPng(width: number, height: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter byte = None
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = deflateSync(raw);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // RGBA color type
  header[10] = 0; // default compression
  header[11] = 0; // default filter
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function drawIconPixels(size: number): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = x - (size - 1) / 2;
      const cy = y - (size - 1) / 2;
      const dist = Math.sqrt(cx * cx + cy * cy);
      const maxR = (size - 1) / 2;

      if (dist < maxR - 0.5) {
        // Inner circle: bright blue with slight gradient
        const t = dist / maxR;
        pixels[idx] = Math.round(37 + t * 30);      // R
        pixels[idx + 1] = Math.round(99 + t * 40);  // G
        pixels[idx + 2] = Math.round(235 + t * 15); // B
        pixels[idx + 3] = 255;
      } else if (dist < maxR + 0.5) {
        // Antialiased edge
        const alpha = Math.round((maxR + 0.5 - dist) * 255);
        pixels[idx] = 59;
        pixels[idx + 1] = 130;
        pixels[idx + 2] = 246;
        pixels[idx + 3] = alpha;
      }
      // else transparent (already zero)
    }
  }

  // Draw a white "B" letter at center
  // 16px: center at (7,7), letter ~5x7
  const letter: [number, number][] = [
    // Vertical bar of B
    [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [5, 11],
    // Top curve
    [6, 3], [7, 3], [8, 3],
    [9, 4],
    // Middle curve
    [6, 7], [7, 7], [8, 7],
    [9, 6], [9, 8],
    // Bottom curve
    [6, 11], [7, 11], [8, 11],
    [9, 10],
  ];

  // Adjust for 32px size
  if (size === 32) {
    letter.length = 0;
    // Simplified 32px "B"
    for (let yy = 6; yy <= 25; yy++) {
      letter.push([9, yy]); // vertical bar
    }
    for (let xx = 10; xx <= 20; xx++) {
      letter.push([xx, 6]); // top horizontal
    }
    for (let xx = 10; xx <= 20; xx++) {
      letter.push([xx, 15]); // middle horizontal
    }
    for (let xx = 10; xx <= 20; xx++) {
      letter.push([xx, 25]); // bottom horizontal
    }
    for (let yy = 7; yy <= 14; yy++) {
      if (yy !== 10 && yy !== 11) letter.push([21, yy]);
    }
    for (let yy = 16; yy <= 24; yy++) {
      if (yy !== 19 && yy !== 20) letter.push([21, yy]);
    }
  }

  for (const [lx, ly] of letter) {
    if (lx >= 0 && lx < size && ly >= 0 && ly < size) {
      const idx = (ly * size + lx) * 4;
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = 255;
    }
  }

  return pixels;
}

let cachedIcon: Electron.NativeImage | null = null;

export function getAppIconPath(): string {
  const p = path.join(__dirname, "../../resources/icon.png");
  if (!fs.existsSync(p)) {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const png = createPng(32, 32, drawIconPixels(32));
    fs.writeFileSync(p, png);
  }
  return p;
}

export function getTrayIcon(): Electron.NativeImage {
  if (cachedIcon) return cachedIcon;
  const png = createPng(16, 16, drawIconPixels(16));
  cachedIcon = nativeImage.createFromBuffer(png, { width: 16, height: 16 });
  return cachedIcon;
}
