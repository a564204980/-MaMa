// Preserve generated source sheets; remove only border-connected neutral backgrounds per view.
import fs from 'node:fs';
import { readPNG, writePNG, cut } from './pack-characters.mjs';

for (const name of process.argv.slice(2)) {
  if (!/^(father|mother)-(sleepy|angry)-triview-v1$/.test(name)) throw new Error('Unexpected asset name');
  const source = readPNG(`assets/characters/${name}.png`);
  const backSource = name.includes('-angry-') ? readPNG(`assets/characters/${name.replace('-angry-', '-sleepy-')}.png`) : source;
  if (backSource.w !== source.w || backSource.h !== source.h) throw new Error('Sheet sizes must match for shared back view');
  const pixels = Buffer.alloc(source.w * source.h * 4);
  // The mother's side bun crosses an equal-third boundary; split in the actual empty gaps.
  const edges = name.startsWith('mother-') ? [0, 800, 1370, source.w] : [0, Math.floor(source.w / 3), Math.floor(source.w * 2 / 3), source.w];
  for (let col = 0; col < 3; col++) {
    const input = col === 2 ? backSource : source;
    const x = edges[col], width = edges[col + 1] - x;
    const data = Buffer.alloc(width * source.h * 4);
    for (let y = 0; y < source.h; y++) input.data.copy(data, y * width * 4, (y * source.w + x) * 4, (y * source.w + x + width) * 4);
    const part = cut({ w: width, h: source.h, data }, 0, 0, 1, 1);
    for (let y = 0; y < part.h; y++) {
      part.data.copy(pixels, (y * source.w + x) * 4, y * part.w * 4, (y + 1) * part.w * 4);
    }
  }
  let transparent = 0;
  for (let p = 3; p < pixels.length; p += 4) if (pixels[p] === 0) transparent++;
  if (!transparent || transparent === source.w * source.h) throw new Error('Invalid alpha');
  const output = `assets/characters/${name}-transparent.png`;
  writePNG(output, source.w, source.h, pixels);
  const review = Buffer.from(pixels);
  for (let p = 0; p < review.length; p += 4) {
    const alpha = review[p + 3] / 255;
    for (let c = 0; c < 3; c++) review[p + c] = Math.round(review[p + c] * alpha + [31, 48, 66][c] * (1 - alpha));
    review[p + 3] = 255;
  }
  fs.mkdirSync('.work', { recursive: true });
  writePNG(`.work/${name}-review.png`, source.w, source.h, review);
  console.log(JSON.stringify({ output, width: source.w, height: source.h, transparent }));
}
