// Asset generator — Together.ai (FLUX).
//
// Usage:
//   node gen-assets.mjs                 list batches, cost estimate, do nothing
//   node gen-assets.mjs bg              generate one batch
//   node gen-assets.mjs bg goods        several batches
//   node gen-assets.mjs bg --dev        final quality (FLUX.1-dev, ~9x the cost)
//   node gen-assets.mjs bg --n=4        four variations of each prompt
//
// Output lands in assets/gen/<batch>/ plus a contact sheet at assets/gen/index.html
// that shows every result AT ACTUAL BOARD SIZE. That last part matters more than it
// sounds: a sprite that looks superb at 1024px routinely turns to mush at 40px, and
// judging generated icons zoomed-in is how you end up with an unreadable board.
//
// Nothing here touches the game. Generated files are gitignored until a winner is
// picked and promoted into assets/ by hand.

import fs from 'node:fs';
import path from 'node:path';

const KEY = fs.readFileSync('.env', 'utf8').match(/TOGETHER_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) {
  console.error('No TOGETHER_API_KEY in .env');
  process.exit(1);
}

const MODELS = {
  schnell: { id: 'black-forest-labs/FLUX.1-schnell', steps: 4,  cost: 0.0027 },
  dev:     { id: 'black-forest-labs/FLUX.1-dev',     steps: 28, cost: 0.025  },
};

// ---------------------------------------------------------------- style
//
// The single most important thing in this file. Twenty icons generated from
// twenty unrelated prompts look like twenty different artists had a go; a shared
// style block is what makes them read as one set. Every prompt gets it appended.
//
// Derived from the reference: a printed euro-game board — painted, warm, aged
// paper — NOT a photograph of a table. Chasing photographic depth costs
// readability at the sizes we actually render at.
const STYLE = [
  'hand-painted board game art',
  'warm aged parchment palette, sepia ochre umber and muted teal',
  'flat top-down view, no perspective, no camera depth of field',
  'clean readable silhouette, strong shapes',
  'subtle paper grain texture',
  'pre-colonial Southeast Asian maritime aesthetic',
].join(', ');

const NEG = 'photograph, 3d render, glossy, neon, text, letters, words, writing, label, '
  + 'watermark, signature, ui, frame, border, compass rose, cartouche';

// A tight icon brief.
//
// "generous empty margin" in the first pass backfired badly: FLUX centred the
// subject at ~15% of the canvas, which is ~6 real pixels once the sprite is drawn
// at 40px on the board. Margin is something code can add precisely and models
// cannot, so ask for the subject to FILL the frame and trim in post if needed.
// "flat two-tone illustration" leads for a reason. Without it FLUX drifts to
// product photography on anything it has seen photographed a lot — the spyglass
// and the coin both came back as glossy 3D renders with invented lettering. Naming
// the medium first anchors the whole generation.
const ICON = (subject) =>
  `flat two-tone illustration of ${subject}, teal and gold on cream, `
  + `matte flat colour, not photorealistic, no shading gradients, `
  + `fills the entire frame, large and centered, cropped tight to the subject, `
  + `no scene, no background detail, no props, no text, ${STYLE}`;

// Backgrounds need their OWN style block. Sharing the icon one leaked 'maritime'
// into the subject and produced boats on a page when a seamless texture was asked
// for — and 'board game art' invited illustration onto something meant to sit
// UNDER the board's own linework.
const PAPER = [
  'flat scanned paper texture',
  'even diffuse lighting, no vignette, no shadows',
  'warm neutral cream and tan, low saturation, not yellow',
  'photographed flat from directly above',
].join(', ');

const BG = (subject) =>
  `${subject}, ${PAPER}, seamless, fills entire frame edge to edge, `
  + `no illustration, no drawing, no map, no text, no labels, no compass, `
  + `no border, no torn edges, no folds`;

// Seamless surface tile. Composited under the board and stretched along channels,
// so it must be flat-on with NO baked light source or perspective — either would
// break the moment a tile is rotated to follow a river, and would betray the
// illusion instantly on a printed board.
const TILE = (subject) =>
  `seamless tileable texture of ${subject}, painted board game illustration, `
  + `flat overhead view straight down, no perspective, no horizon, `
  + `even flat lighting, no shadows, no vignette, no light source, `
  + `fills the entire frame edge to edge, uniform density across the whole image, `
  + `no objects, no boats, no buildings, no people, no text, no border, `
  + `warm aged parchment palette, sepia ochre umber and muted teal, subtle paper grain`;

// ---------------------------------------------------------------- batches
const BATCHES = {
  // The biggest visual win by far, and the thing that answers "why is it gloomy".
  // Dropped 'parchment-map' and 'delta-map' from the first pass: a decorated map
  // fights the board's own channels and nodes, and both came back with garbled
  // invented text and stray compass roses. What the board actually needs is a
  // quiet surface to sit ON.
  bg: {
    size: [1024, 1024],
    prompts: {
      'paper-plain':  BG('uniform aged paper texture with fine fibers and gentle mottling'),
      'paper-linen':  BG('handmade laid paper with visible linen fiber grain, subtle tone variation'),
      'paper-washed': BG('aged paper with soft irregular water staining and faint tonal blotches'),
      'paper-tan':    BG('warm tan kraft paper, fine even grain, slightly darker than cream'),
    },
  },

  // Trade goods. Kept as painted wooden pieces rather than literal commodities:
  // a wooden token reads instantly at 40px, a photorealistic sack of rice does not.
  goods: {
    size: [768, 768],
    prompts: {
      'good-timber': ICON('three thick green bamboo poles bound with rope, painted wooden game token'),
      'good-grain':  ICON('dense sheaf of golden rice stalks, painted wooden game token'),
      'good-salt':   ICON('woven basket heaped with white salt, painted wooden game token'),
    },
  },

  // Action icons. These sit on buttons at ~28px, so they must survive brutal
  // downscaling — hence "bold simple silhouette" over any fine detail.
  actions: {
    size: [768, 768],
    prompts: {
      'act-ship':   ICON('outrigger boat with woven sail seen from the side, bold simple silhouette'),
      // Reworked: 'wooden shovel blade' put a whole arm in frame and bled off the
      // edge. Naming the object alone keeps the composition tight.
      'act-dredge': ICON('wooden paddle blade dipping into rippling water, teal and gold, '
        + 'bold simple silhouette, no hands, no arms, no people'),
      'act-build':  ICON('single stilt house with thatched roof, bold simple silhouette'),
      // Reworked: 'brass spyglass' pulled every variant into photorealistic product
      // photography with garbled map text. Flat-illustration words up front, and the
      // chart dropped entirely — anything map-shaped invites fake lettering.
      'act-survey': ICON('flat two-tone illustration of a simple spyglass, teal and gold, '
        + 'bold simple silhouette, no map, no paper, no text, matte flat colour, not photorealistic'),
    },
  },

  // Physical components. These are the pieces a printed edition would actually
  // have: water segments at each depth, land, tokens. Generated as tileable art
  // the renderer composites rather than one baked board image — a baked board
  // cannot be clicked, and any topology change would invalidate it. Sprites stay
  // true to graph.js AND could go to a print shop.
  //
  // Square, seamless, and flat-on: anything with perspective or a light source
  // baked in cannot tile or rotate to follow a channel.
  water: {
    size: [512, 512],
    prompts: {
      // The four states a channel can be in. Depth is the core read of the whole
      // game, so these have to differ at a glance, not on inspection.
      'water-deep':    TILE('deep clear river water, rich teal, gentle ripples'),
      'water-mid':     TILE('shallower river water, lighter teal green, visible ripple texture'),
      'water-shallow': TILE('very shallow murky water over a sandy bed, pale khaki green, '
        + 'sand showing through'),
      'water-silted':  TILE('cracked dried mud of a dead riverbed, ochre brown, deep cracks, '
        + 'no water at all'),
      // The moment of silting — used for the effect overlay when a channel dies.
      'water-choking': TILE('muddy silt-laden water, brown sediment swirling through green water'),
    },
  },

  land: {
    size: [512, 512],
    prompts: {
      'land-delta':  TILE('dry delta floodplain, warm tan earth with sparse scrub'),
      'land-marsh':  TILE('marshy ground with reeds and grass, muted green over wet earth'),
      'land-upland': TILE('drier upland ground, ochre earth with scattered vegetation'),
    },
  },

  // UI materials. The interface reused one paper scan for every surface, which is
  // why it still read flat: real board games are made of several materials, and
  // the difference between them is most of what makes a table look inviting.
  // Table under everything, wood for the frame, leather for cards.
  mat: {
    size: [512, 512],
    prompts: {
      'mat-wood':    TILE('dark walnut wood grain, straight fine grain, matte finish'),
      'mat-wood-old':TILE('worn oak board, visible grain and faint scratches, warm brown'),
      'mat-leather': TILE('dark brown tooled leather, fine pebbled grain'),
      'mat-felt':    TILE('deep green baize table felt, soft even fibre'),
      'mat-linen':   TILE('coarse natural linen weave, warm undyed fibre'),
    },
  },

  // Board furniture — the pieces that sit on the map itself.
  board: {
    size: [768, 768],
    prompts: {
      'node-settlement': ICON('a cluster of stilt houses seen from directly above'),
      'node-mouth':      ICON('a river mouth opening into open sea'),
      'marker-depth':    ICON('a carved wooden post standing in water'),
      // 'gold coin' fetched Greco-Roman numismatic photography with fake Latin.
      // Describing the SHAPE rather than naming the object avoids the association.
      'coin-gold':       ICON('a plain round gold bead with a smooth unmarked surface, '
        + 'no engraving, no face, no figure, no inscription'),
      'silt-blocked':    ICON('a cracked dry riverbed, ochre and brown'),
    },
  },
};

// ---------------------------------------------------------------- generate
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const want = args.filter(a => !a.startsWith('--'));
const model = flags.includes('--dev') ? MODELS.dev : MODELS.schnell;
const variations = Number(flags.find(f => f.startsWith('--n='))?.slice(4) ?? 1);

if (!want.length) {
  console.log('\nBatches:');
  let total = 0;
  for (const [name, b] of Object.entries(BATCHES)) {
    const n = Object.keys(b.prompts).length;
    total += n;
    console.log(`  ${name.padEnd(9)} ${String(n).padStart(2)} prompts  ${Object.keys(b.prompts).join(', ')}`);
  }
  console.log(`\n  all ${total} prompts x ${variations} = ${total * variations} images`);
  console.log(`  schnell $${(total * MODELS.schnell.cost).toFixed(2)}   dev $${(total * MODELS.dev.cost).toFixed(2)}`);
  console.log('\n  node gen-assets.mjs bg          # start here\n');
  process.exit(0);
}

const OUT = 'assets/gen';
fs.mkdirSync(OUT, { recursive: true });

// One image. Retries on 429/5xx: the free-ish tiers rate limit hard and a whole
// batch failing because of one blip is a waste of both money and patience.
async function generate(prompt, w, h, seed, tries = 3) {
  for (let t = 0; t < tries; t++) {
    const res = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id, prompt, negative_prompt: NEG,
        width: w, height: h, steps: model.steps, n: 1, seed,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      const url = j.data?.[0]?.url;
      if (!url) throw new Error('no url in response: ' + JSON.stringify(j).slice(0, 200));
      const img = await fetch(url);
      return Buffer.from(await img.arrayBuffer());
    }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const back = 2000 * (t + 1);
      console.log(`    ${res.status}, retrying in ${back / 1000}s`);
      await new Promise(r => { setTimeout(r, back); });
      continue;
    }
    throw new Error(`${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error('gave up after retries');
}

let made = 0, failed = 0;
for (const name of want) {
  const batch = BATCHES[name];
  if (!batch) { console.error(`unknown batch: ${name}`); continue; }
  const dir = path.join(OUT, name);
  fs.mkdirSync(dir, { recursive: true });
  const [w, h] = batch.size;

  console.log(`\n=== ${name} (${model.id.split('/')[1]}) ===`);
  for (const [key, prompt] of Object.entries(batch.prompts)) {
    for (let v = 0; v < variations; v++) {
      // Deterministic seed per (prompt, variation) so a rerun reproduces the same
      // image and we can iterate on wording without chasing random noise.
      const seed = 1000 + v * 97;
      const file = path.join(dir, variations > 1 ? `${key}-${v + 1}.png` : `${key}.png`);
      process.stdout.write(`  ${path.basename(file).padEnd(26)}`);
      try {
        const buf = await generate(prompt, w, h, seed);
        fs.writeFileSync(file, buf);
        console.log(`ok  ${(buf.length / 1024).toFixed(0)}kb`);
        made++;
      } catch (e) {
        console.log(`FAIL ${e.message.slice(0, 90)}`);
        failed++;
      }
    }
  }
}

// ---------------------------------------------------------------- contact sheet
// Shows each result full-size AND at the sizes it will really be used at. The
// small previews are the point — that is where generated art usually falls apart.
const dirs = fs.readdirSync(OUT).filter(d => fs.statSync(path.join(OUT, d)).isDirectory());
const sections = dirs.map(d => {
  const files = fs.readdirSync(path.join(OUT, d)).filter(f => f.endsWith('.png'));
  const cards = files.map(f => `
    <figure>
      <img src="${d}/${f}" alt="${f}">
      <figcaption>${f.replace('.png', '')}</figcaption>
      <div class="sizes">
        <img src="${d}/${f}" class="s64"><img src="${d}/${f}" class="s40"><img src="${d}/${f}" class="s28">
        <span class="cov" data-src="${d}/${f}">measuring…</span>
      </div>
    </figure>`).join('');
  return `<h2>${d} <small>${files.length}</small></h2><div class="grid">${cards}</div>`;
}).join('');

fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>
<meta charset="utf-8"><title>SILT — generated assets</title>
<style>
  body{margin:0;padding:28px;background:#232e28;color:#f4f1e8;
    font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
  h1{font-weight:600;letter-spacing:.2em;margin:0 0 4px}
  p.note{color:#93a394;margin:0 0 26px;max-width:60ch}
  h2{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#f2c56f;
    margin:30px 0 12px;border-bottom:1px solid #3e5046;padding-bottom:7px}
  h2 small{color:#93a394;letter-spacing:0;text-transform:none}
  .grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
  figure{margin:0;background:#2b3830;border:1px solid #3e5046;border-radius:9px;overflow:hidden}
  figure>img{width:100%;display:block;aspect-ratio:1;object-fit:cover;background:#26322b}
  figcaption{padding:8px 11px 0;font-size:12px;color:#bcc8bb}
  .sizes{display:flex;align-items:center;gap:9px;padding:9px 11px 11px}
  .sizes img{object-fit:contain;background:#26322b;border-radius:3px}
  .s64{width:64px;height:64px}.s40{width:40px;height:40px}.s28{width:28px;height:28px}
  .sizes span{font-size:10px;color:#93a394;margin-left:auto;text-align:right;line-height:1.3}
</style>
<h1>SILT — generated assets</h1>
<p class="note">Judge these at the small sizes, not the big ones. An icon that looks
great at full size and unreadable at 40px is useless — that is the size it ships at.
<b>Coverage</b> is how much of the frame the subject fills; under ~35% means the sprite
will be mostly empty space and tiny on the board.</p>
${sections}
<script>
// Measure subject coverage rather than eyeballing it. The first pass produced
// icons sitting at ~15% of frame, which is ~6 real pixels at board size — obvious
// in hindsight, invisible when judging a 230px thumbnail.
for (const el of document.querySelectorAll('.cov')) {
  const img = new Image();
  img.onload = () => {
    const N = 96, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data;
    // Background is the modal corner colour; anything far from it is subject.
    const bg = [d[0], d[1], d[2]];
    let on = 0;
    for (let i = 0; i < d.length; i += 4) {
      const dist = Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]);
      if (dist > 60) on++;
    }
    const pct = Math.round(on / (N*N) * 100);
    el.textContent = pct + '% coverage';
    el.style.color = pct < 35 ? '#f08a72' : pct > 92 ? '#f0b95e' : '#8fe0ac';
  };
  img.src = el.dataset.src;
}
</script>
`);

const spent = made * model.cost;
console.log(`\n${made} made, ${failed} failed  ~$${spent.toFixed(3)} this run`);
console.log(`open assets/gen/index.html\n`);
