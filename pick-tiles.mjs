// Pick the best tile from each generated set, and crop it to a clean square.
//
// Tiles have a property icons do not: they must be UNIFORM. A tile with a feature
// in it — a boat, a well, a bright corner — repeats that feature across the board
// and reads instantly as wallpaper. "Uniform" is measurable, so this measures it
// rather than making me squint at 24 images.
//
// Score = block-variance (how much the image differs from region to region) plus
// an edge-continuity term (how well the left edge would meet the right if tiled).
// Lower is better on both.
//
//   node pick-tiles.mjs           score every candidate, promote the winners
//   node pick-tiles.mjs --dry     score only, change nothing

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const DRY = process.argv.includes('--dry');
const SETS = ['water', 'land', 'mat'];
const OUT = 'assets/art';

const browser = await chromium.launch();
const page = await browser.newPage();

async function score(file) {
  const b64 = fs.readFileSync(file).toString('base64');
  return page.evaluate(async ({ b64 }) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = 'data:image/jpeg;base64,' + b64; });
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data;
    const at = (px, py) => { const i = (py * S + px) * 4; return [d[i], d[i+1], d[i+2]]; };

    // 1. Block uniformity: split into an 8x8 grid, compare each block's mean
    //    colour to the image mean. A boat or a well makes one block an outlier.
    const G = 8, bs = S / G;
    const blocks = [];
    for (let by = 0; by < G; by++) {
      for (let bx = 0; bx < G; bx++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = by * bs; y < (by + 1) * bs; y += 4) {
          for (let px = bx * bs; px < (bx + 1) * bs; px += 4) {
            const p = at(px, y); r += p[0]; g += p[1]; b += p[2]; n++;
          }
        }
        blocks.push([r / n, g / n, b / n]);
      }
    }
    const mean = [0, 1, 2].map(k => blocks.reduce((s, q) => s + q[k], 0) / blocks.length);
    const blockVar = Math.sqrt(blocks.reduce((s, q) =>
      s + (q[0]-mean[0])**2 + (q[1]-mean[1])**2 + (q[2]-mean[2])**2, 0) / blocks.length);

    // 2. Edge continuity: how different is the left column from the right, and the
    //    top row from the bottom. A seamless tile has near-zero mismatch.
    let seamX = 0, seamY = 0;
    for (let i = 0; i < S; i += 2) {
      const l = at(0, i), r = at(S - 1, i);
      seamX += Math.abs(l[0]-r[0]) + Math.abs(l[1]-r[1]) + Math.abs(l[2]-r[2]);
      const t = at(i, 0), bo = at(i, S - 1);
      seamY += Math.abs(t[0]-bo[0]) + Math.abs(t[1]-bo[1]) + Math.abs(t[2]-bo[2]);
    }
    const seam = (seamX + seamY) / (S / 2) / 6;

    // 3. Worst single block — catches one bright object on an otherwise calm tile,
    //    which the average would smooth away.
    const worst = Math.max(...blocks.map(q =>
      Math.sqrt((q[0]-mean[0])**2 + (q[1]-mean[1])**2 + (q[2]-mean[2])**2)));

    return { blockVar, seam, worst, total: blockVar + seam * 0.6 + worst * 0.8 };
  }, { b64 });
}

const results = {};
for (const set of SETS) {
  const dir = path.join('assets/gen', set);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  const groups = {};
  for (const f of files) (groups[f.replace(/-\d+\.png$/, '')] ??= []).push(f);

  console.log(`\n=== ${set} ===`);
  for (const [key, variants] of Object.entries(groups)) {
    const scored = [];
    for (const v of variants) {
      const s = await score(path.join(dir, v));
      scored.push({ v, ...s });
    }
    scored.sort((a, b) => a.total - b.total);
    for (const s of scored) {
      const mark = s === scored[0] ? '->' : '  ';
      console.log(`  ${mark} ${s.v.padEnd(22)} uniform ${s.blockVar.toFixed(1).padStart(5)}  `
        + `seam ${s.seam.toFixed(1).padStart(5)}  worst ${s.worst.toFixed(1).padStart(5)}  `
        + `= ${s.total.toFixed(1)}`);
    }
    results[key] = path.join(dir, scored[0].v);
  }
}

if (!DRY) {
  fs.mkdirSync(OUT, { recursive: true });
  console.log('\npromoting:');
  for (const [key, src] of Object.entries(results)) {
    const dst = path.join(OUT, key + '.png');
    // Re-encode as real PNG. Together serves JPEG regardless of extension, and a
    // JPEG named .png works in a browser but confuses everything else.
    const b64 = fs.readFileSync(src).toString('base64');
    const png = await page.evaluate(async ({ b64 }) => {
      const img = new Image();
      await new Promise(ok => { img.onload = ok; img.src = 'data:image/jpeg;base64,' + b64; });
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      c.getContext('2d').drawImage(img, 0, 0, 512, 512);
      return c.toDataURL('image/png').split(',')[1];
    }, { b64 });
    fs.writeFileSync(dst, Buffer.from(png, 'base64'));
    console.log(`  ${key.padEnd(16)} <- ${path.basename(src)}`);
  }
}

await browser.close();
console.log('\ndone');
