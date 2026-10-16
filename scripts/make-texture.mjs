import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

// A tiny, deterministic grayscale grain tile, stored locally with the instrument.
const width = 180,
  height = 180;
let seed = 712;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const raw = Buffer.alloc((width + 1) * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++)
    raw[y * (width + 1) + x + 1] = Math.floor(100 + random() * 155);
}
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width);
header.writeUInt32BE(height, 4);
header[8] = 8;
writeFileSync(
  new URL("../public/grain.png", import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);

// Keep browser chrome free of the scaffold's branding, too.
const iconHeader = Buffer.alloc(13);
iconHeader.writeUInt32BE(32);
iconHeader.writeUInt32BE(32, 4);
iconHeader[8] = 8;
iconHeader[9] = 6;
writeFileSync(
  new URL("../public/icon.png", import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", iconHeader),
    chunk("IDAT", deflateSync(Buffer.alloc(32 * (1 + 32 * 4)))),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
