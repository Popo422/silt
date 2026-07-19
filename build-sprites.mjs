// Convert downloaded game-icons SVGs into one inline <symbol> sprite sheet.
// Each source file is a 512x512 svg: a black background rect path + white shape paths.
// We drop the background and let the shape inherit currentColor so the UI can theme it.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAW = 'assets/raw';
const OUT = 'assets/sprites.svg';

// The background is always the first path: a full-canvas rect, e.g. "M0 0h512v512H0z".
const BG = /^M0 0h512v512H0z$/i;

function extract(src) {
  const paths = [...src.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?>/gi)];
  const keep = paths
    .map(m => m[1].trim())
    .filter(d => !BG.test(d.replace(/\s+/g, ' ')));
  if (!keep.length) throw new Error('no foreground paths');
  return keep;
}

const files = readdirSync(RAW).filter(f => f.endsWith('.svg')).sort();
const symbols = [];
const manifest = [];

for (const f of files) {
  const name = f.replace(/\.svg$/, '');
  const src = readFileSync(join(RAW, f), 'utf8');
  try {
    const ds = extract(src);
    symbols.push(
      `  <symbol id="ic-${name}" viewBox="0 0 512 512">\n` +
      ds.map(d => `    <path fill="currentColor" d="${d}"/>`).join('\n') +
      `\n  </symbol>`
    );
    manifest.push({ name, paths: ds.length });
  } catch (e) {
    console.warn(`skip ${name}: ${e.message}`);
  }
}

const sheet =
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n` +
  `<!-- Icons from game-icons.net (Lorc, Delapouite) — CC BY 3.0. See assets/CREDITS.md -->\n` +
  symbols.join('\n') + `\n</svg>\n`;

writeFileSync(OUT, sheet);
console.log(`${manifest.length} symbols -> ${OUT} (${sheet.length} bytes)`);
for (const m of manifest) console.log(`  ic-${m.name.padEnd(10)} ${m.paths} path(s)`);
