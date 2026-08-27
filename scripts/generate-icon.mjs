import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Windows 图标：暖白底上的「时间 + 握拳」线稿。纯代码生成，方便以后统一修改颜色和比例。
const size = 64;
const pixels = new Uint8Array(size * size * 4);
const paper = [247, 244, 237, 255];
const ink = [70, 65, 59, 255];
const warm = [143, 132, 116, 255];
const put = (x, y, color = ink) => {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels.set(color, offset);
};
const fill = (color) => { for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) put(x, y, color); };
const disc = (cx, cy, radius, color = ink) => {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) put(x, y, color);
};
const line = (x0, y0, x1, y1, width = 2, color = ink) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let step = 0; step <= steps; step += 1) disc(Math.round(x0 + ((x1 - x0) * step) / steps), Math.round(y0 + ((y1 - y0) * step) / steps), width / 2, color);
};
const ring = (cx, cy, outer, inner, color = ink) => {
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y += 1) for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x += 1) {
    const distance = (x - cx) ** 2 + (y - cy) ** 2;
    if (distance <= outer ** 2 && distance >= inner ** 2) put(x, y, color);
  }
};

fill(paper);
ring(32, 32, 27, 23, ink);
line(32, 32, 32, 15, 2, ink);
line(32, 32, 19, 37, 2, ink);
disc(32, 32, 2.5, ink);
// 四指与拳心：用克制的线段嵌入表盘右下方。
line(37, 29, 47, 29, 2, warm); line(37, 34, 48, 34, 2, warm);
line(36, 39, 46, 39, 2, warm); line(38, 44, 44, 44, 2, warm);
line(47, 29, 50, 34, 2, warm); line(50, 34, 46, 45, 2, warm);
line(39, 44, 35, 40, 2, warm);

const dibBytes = 40 + size * size * 4 + size * 8;
const icon = Buffer.alloc(22 + dibBytes);
icon.writeUInt16LE(0, 0); icon.writeUInt16LE(1, 2); icon.writeUInt16LE(1, 4);
icon.writeUInt8(size, 6); icon.writeUInt8(size, 7); icon.writeUInt8(0, 8); icon.writeUInt8(0, 9);
icon.writeUInt16LE(1, 10); icon.writeUInt16LE(32, 12); icon.writeUInt32LE(dibBytes, 14); icon.writeUInt32LE(22, 18);
const dib = 22;
icon.writeUInt32LE(40, dib); icon.writeInt32LE(size, dib + 4); icon.writeInt32LE(size * 2, dib + 8);
icon.writeUInt16LE(1, dib + 12); icon.writeUInt16LE(32, dib + 14); icon.writeUInt32LE(0, dib + 16);
for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
  const source = ((size - 1 - y) * size + x) * 4;
  const target = dib + 40 + (y * size + x) * 4;
  icon[target] = pixels[source + 2]; icon[target + 1] = pixels[source + 1]; icon[target + 2] = pixels[source]; icon[target + 3] = pixels[source + 3];
}
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'app-icon.ico');
fs.writeFileSync(output, icon);
