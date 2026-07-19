// Prepare generated art for the board: knock out the cream background, trim to the
// subject, and emit a square transparent PNG.
//
// WHY: FLUX bakes a flat cream backdrop into every image. Composited onto the board
// that reads as an opaque beige square around each sprite — worse than the flat SVG
// it replaces. Subjects also float with uneven margin, so identical nominal sizes
// render at visibly different scales.
//
// Together returns JPEG (verified: files start ff d8 ff, whatever extension you save
// them under), so a hand-rolled PNG reader is useless here. Rather than pull in a
// JPEG decoder, this drives the Chromium that Playwright already installs: canvas
// decodes anything, does the keying on the GPU, and re-encodes real PNG with alpha.
// No new dependency, and the decode is battle-tested.
//
//   node prep-art.mjs                 process assets/art/*.png -> *-cut.png
//   node prep-art.mjs --pad=0.08      border as a fraction of the trimmed size
//   node prep-art.mjs --tol=55        background keying tolerance

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const PAD = Number(process.argv.find(a => a.startsWith('--pad='))?.slice(6) ?? 0.05);
const TOL = Number(process.argv.find(a => a.startsWith('--tol='))?.slice(6) ?? 42);

const DIR = 'assets/art';
const files = fs.readdirSync(DIR).filter(f => /\.(png|jpg|jpeg)$/i.test(f) && !f.includes('-cut'));

const browser = await chromium.launch();
const page = await browser.newPage();

console.log(`prepping ${files.length} files (pad ${PAD}, tol ${TOL})\n`);

for (const f of files) {
  const b64 = fs.readFileSync(path.join(DIR, f)).toString('base64');
  const res = await page.evaluate(async ({ b64, PAD, TOL }) => {
    const img = new Image();
    await new Promise((ok, err) => {
      img.onload = ok; img.onerror = () => err(new Error('decode failed'));
      // Content-sniffed by the browser, so the declared mime does not matter.
      img.src = 'data:image/jpeg;base64,' + b64;
    });
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, w, h);
    const p = d.data;

    // Background = median of the four corners. One corner is fragile when a
    // subject's drop shadow happens to reach an edge.
    const corner = (cx, cy) => { const i = (cy * w + cx) * 4; return [p[i], p[i+1], p[i+2]]; };
    const cs = [corner(2, 2), corner(w-3, 2), corner(2, h-3), corner(w-3, h-3)];
    const bg = [0, 1, 2].map(k => {
      const v = cs.map(q => q[k]).sort((a, b) => a - b);
      return (v[1] + v[2]) / 2;
    });

    // Ramp alpha across the tolerance band rather than hard-thresholding, which
    // leaves stair-stepped edges on every diagonal.
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < w * h; i++) {
      const dist = Math.abs(p[i*4] - bg[0]) + Math.abs(p[i*4+1] - bg[1]) + Math.abs(p[i*4+2] - bg[2]);
      let a = 255;
      if (dist < TOL) a = 0;
      else if (dist < TOL * 2.2) a = Math.round(((dist - TOL) / (TOL * 1.2)) * 255);
      p[i*4+3] = a;
      if (a > 24) {
        const px = i % w, py = (i / w) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    if (maxX < 0) return null;
    x.putImageData(d, 0, 0);

    // Square crop centred on the subject, so every sprite lands at the same
    // visual scale regardless of how the model framed it.
    const cw = maxX - minX + 1, chh = maxY - minY + 1;
    const side = Math.round(Math.max(cw, chh) * (1 + PAD * 2));
    const ox = Math.round(minX + cw / 2 - side / 2);
    const oy = Math.round(minY + chh / 2 - side / 2);

    const o = document.createElement('canvas');
    o.width = o.height = side;
    o.getContext('2d').drawImage(c, ox, oy, side, side, 0, 0, side, side);
    return {
      png: o.toDataURL('image/png').split(',')[1],
      side, w, h,
      coverage: Math.round((cw * chh) / (w * h) * 100),
    };
  }, { b64, PAD, TOL });

  if (!res) { console.log(`  ${f.padEnd(20)} all background, skipped`); continue; }
  const dst = path.join(DIR, f.replace(/\.(png|jpg|jpeg)$/i, '-cut.png'));
  fs.writeFileSync(dst, Buffer.from(res.png, 'base64'));
  const kb = (fs.statSync(dst).size / 1024).toFixed(0);
  console.log(`  ${f.padEnd(20)} ${res.w}x${res.h} -> ${res.side}px square, subject ${res.coverage}% of frame, ${kb}kb`);
}

await browser.close();
console.log('\ndone');
