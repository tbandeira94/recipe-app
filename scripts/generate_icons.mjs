import { resolve } from 'node:path';
import sharp from 'sharp';

const icons = resolve('public/icons');
const source = resolve(icons, 'recipe-app-icon.png');

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const queue = [];
const visited = new Uint8Array(info.width * info.height);

const isOuterWhite = (x, y) => {
  const offset = (y * info.width + x) * 4;
  return data[offset] >= 250 && data[offset + 1] >= 250 && data[offset + 2] >= 250;
};

for (let x = 0; x < info.width; x += 1) queue.push([x, 0], [x, info.height - 1]);
for (let y = 0; y < info.height; y += 1) queue.push([0, y], [info.width - 1, y]);

for (let index = 0; index < queue.length; index += 1) {
  const [x, y] = queue[index];
  const pixel = y * info.width + x;
  if (visited[pixel] || !isOuterWhite(x, y)) continue;
  visited[pixel] = 1;
  data[pixel * 4 + 3] = 0;
  if (x > 0) queue.push([x - 1, y]);
  if (x + 1 < info.width) queue.push([x + 1, y]);
  if (y > 0) queue.push([x, y - 1]);
  if (y + 1 < info.height) queue.push([x, y + 1]);
}

const cleaned = sharp(data, { raw: info });
await Promise.all([
  cleaned.clone().resize(192, 192).png().toFile(resolve(icons, 'icon-192.png')),
  cleaned.clone().resize(512, 512).png().toFile(resolve(icons, 'icon-512.png')),
  cleaned.clone().resize(180, 180).png().toFile(resolve(icons, 'apple-touch-icon.png')),
]);
