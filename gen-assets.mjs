// Asset generator — Together.ai (FLUX).
//
// Usage:
//   node gen-assets.mjs                 list batches, cost estimate, do nothing
//   node gen-assets.mjs bg              generate one batch (schnell — fast, cheap draft)
//   node gen-assets.mjs bg goods        several batches
//   node gen-assets.mjs bg --pro        higher quality (FLUX.1.1-pro, serverless)
//   node gen-assets.mjs bg --pro2       best quality (FLUX.2-pro, slower, serverless)
//   node gen-assets.mjs bg --n=4        four variations of each prompt
//
// Note: FLUX.1-dev is NOT serverless on this account — it needs a paid dedicated
// endpoint spun up by hand, so it is not wired here. FLUX.1.1-pro and FLUX.2-pro
// ARE serverless and are a big step up from schnell, so they are the quality tiers.
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

// steps is only sent when set: the pro models run their own schedule and reject an
// explicit steps outside their range, whereas schnell needs its 4. cost is a rough
// per-image estimate for the run summary, not billed here.
const MODELS = {
  schnell: { id: 'black-forest-labs/FLUX.1-schnell', steps: 4, cost: 0.0027 },
  pro:     { id: 'black-forest-labs/FLUX.1.1-pro',   cost: 0.04 },
  // FLUX.2 folds negatives into the main prompt and 400s on a negative_prompt
  // param, so noNeg drops it for this tier. Say what you DON'T want in the prompt
  // itself instead (the batch prompts already do — "no boats, no text, ...").
  pro2:    { id: 'black-forest-labs/FLUX.2-pro',     cost: 0.06, noNeg: true },
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

// Silhouette brief for player pieces. Note it does NOT append STYLE: everything
// that makes the other batches look good here — parchment grain, warm palette,
// painterly edges — is noise when the output is going to be traced into a vector
// path. What we want is one solid black shape on white with a hard edge.
// A painted player token, one per seat colour.
//
// Deliberately NOT the ICON brief: an icon may be an illustration of a thing,
// but a piece has to look like an OBJECT you could pick up, because that is what
// it will be in a physical edition. So: a carved wooden token, lit from above,
// with a flat base — and painted in the seat colour rather than the shared teal
// and gold, which is the whole point of having four of them.
//
// Bold and simple is a hard requirement, not a style note. This renders at about
// 41px on the board, where anything finer than a thick shape turns to mush.
const TOKEN = (colourName) =>
  `a carved wooden board game piece of a bahay kubo, a traditional Filipino `
  + `nipa hut: a very steep tall thatched roof shaped like a wide triangle, `
  + `sitting high on bamboo stilts with an open platform underneath, `
  + `painted in ${colourName}, `
  + `bold simple chunky form, thick heavy shapes, no fine detail, `
  + `strong readable triangular silhouette, symmetrical, straight from the front, `
  + `flat base, soft light from above, matte painted wood, `
  + `centred and filling the frame, plain white background, no shadow on the `
  + `ground, no scene, no text, hand-painted board game art`;

// The other candidate. A balangay is the boat AND the settlement — same word —
// which is exactly the kind of detail worth putting on the board rather than in
// a glossary nobody opens.
const BOAT = (colourName) =>
  `a carved wooden board game piece of a balangay, a pre-colonial Filipino `
  + `plank boat: a low curved hull sweeping up at both ends, a single square `
  + `sail, outrigger floats along the side, `
  + `painted in ${colourName}, `
  + `bold simple chunky form, thick heavy shapes, no fine detail, `
  + `strong readable silhouette, seen from the side, `
  + `flat base, soft light from above, matte painted wood, `
  + `centred and filling the frame, plain white background, no shadow on the `
  + `ground, no water, no scene, no text, hand-painted board game art`;

// The first pass asked for "a stilt house with a peaked roof" and got suburban
// cottages — pitched roof, front door, little square windows. Wrong continent
// and wrong millennium for a game about pre-colonial datus.
//
// The negatives matter more than the positives here: FLUX's default "house" is
// Western, so the shape has to be named (bahay kubo, nipa hut, steep thatched
// triangle on stilts) AND the default actively pushed away.
const TOKEN_NEG = 'western house, cottage, cabin, suburban house, gable roof, '
  + 'chimney, front door, square windows, shutters, brick, birdhouse, dollhouse, '
  + 'photograph, 3d render, glossy, reflective, text, letters, watermark, '
  + 'signature, frame, border, drop shadow, scene, landscape, multiple objects';

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

// The painted board base — the single biggest visual win left. A top-down
// painting of the whole delta floodplain that the live SVG channels run OVER
// (see drawTerrain in board.js). It replaces flat parchment with real ground:
// dry upland across the top where the source sits, floodplain and marsh through
// the middle, and open sea along the bottom where the three bays are.
//
// This is specifically the Pasig–Pampanga delta into Manila Bay, c. 1400s, before
// Spanish contact (see theme.js) — NOT a generic tropical delta. So the brief asks
// for the things that place actually is: nipa palm and mangrove marsh, warm
// estuary mud, the muted light of Manila Bay. Getting the setting into the ground
// is what makes the board feel like ANOD and not a stock river map.
//
// The hard requirement is that it must NOT paint its own rivers. The channels are
// game state — they change depth, silt up, and die every turn — so they're drawn
// live on top; a baked river would fight them and lie about the board. So the
// brief asks for a floodplain with the water LEFT OUT, and pushes channels,
// rivers, and streams into the negatives hard. Muted so it sits UNDER linework and
// never competes with it.
// Framed as a "painted surface / ground texture", NOT an "aerial map": the map
// framing is what pulled in place labels, a compass rose, and inked rivers in the
// first pass (exactly what PICKS.md warns about — FLUX draws the furniture of a
// map when you say "map"). Asking for a soft painted TEXTURE with a sea band keeps
// the setting without the cartography that fights the live channels.
const BASEMAP =
  `a soft muted painted ground texture of a tropical estuary floodplain, `
  + `pre-colonial Philippines, seen straight down from above: `
  + `warm ochre and tan earth filling the top two thirds, patches of dusty green `
  + `nipa palm and mangrove scrub, giving way to dark wet mudflats and a pale sandy `
  + `shore, then calm shallow teal-green sea filling the bottom edge, `
  + `smooth blurred painterly wash, very soft edges, hazy, low saturation, low `
  + `contrast, dim and atmospheric, out of focus, a quiet background surface, `
  + `even flat overhead lighting, no light source, no shadows, no vignette, `
  + `absolutely no rivers, no channels, no streams, no water lines cutting through `
  + `the land, no boats, no buildings, no people, no islands, no roads, no text, `
  + `no labels, no map grid, no compass, no border, ${STYLE}`;

const BASEMAP_NEG =
  'river, rivers, channel, channels, stream, streams, creek, blue water lines, '
  + 'winding water, waterway, tributary, boats, ships, canoe, buildings, houses, '
  + 'huts, roads, islands, grid lines, map grid, compass rose, cartouche, '
  + 'text, letters, words, labels, place names, sharp focus, crisp detail, '
  + 'high contrast, vivid, saturated, neon, photograph, 3d render, glossy, '
  + 'frame, border, vignette';

// ---------------------------------------------------------------- batches
const BATCHES = {
  // The painted delta ground. Wide-ish to match the board's shape. Several
  // variations because the winner is judged composited under the real channels,
  // not on its own — pick the one that stays quiet behind the linework.
  basemap: {
    size: [1024, 1024],
    neg: BASEMAP_NEG,
    prompts: { 'basemap': BASEMAP },
  },

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

  // Player pieces, generated as SILHOUETTES to be traced into an SVG path.
  //
  // Deliberately not painted art. A piece has to take the owner's colour at
  // runtime and stay readable at about 40px, and a baked-in PNG fails both: one
  // file per seat colour, and painted detail turns to mush at board scale — the
  // same reason ART excludes board markers.
  //
  // So the brief is inverted from every other batch here: pure black on pure
  // white, no shading, no texture, no palette. What we want from the model is
  // the SHAPE — the thing a manufacturer would cut from wood — and a hard
  // two-tone image is what traces cleanly into a single path.
  //
  // This is a game meant to port to a physical edition, so the shape should look
  // like a piece you could hold, not an icon.
  // Player pieces, one painted token per seat colour.
  //
  // Tried as a traced SVG first, so that one asset could take any colour at
  // runtime. It failed on the thing that matters: FLUX draws a stilt house with
  // windows and gaps between the legs, and traced into a path those holes turn
  // to speckle. Rendered at the ~37px the board actually uses, the piece read as
  // a smudge with a face. Four painted files cost a regeneration if the palette
  // moves, which is a far smaller problem than an unreadable piece.
  //
  // Colours match --p0..--p3 in index.html; keep them in step.
  // Two candidate forms, because the theme supports both. A `balangay` is
  // literally the plank-built boat a datu's community sailed and settled from —
  // the settlement and the vessel share one word — so the boat is arguably the
  // truer piece. The hut is the more legible silhouette at 41px. Generate both
  // and judge at board size.
  pieces: {
    size: [768, 768],
    neg: TOKEN_NEG,
    prompts: {
      'piece-p0': TOKEN('warm amber gold'),
      'piece-p1': TOKEN('pale cyan blue'),
      'piece-p2': TOKEN('soft leaf green'),
      'piece-p3': TOKEN('warm coral pink'),
    },
  },

  boats: {
    size: [768, 768],
    neg: TOKEN_NEG,
    prompts: {
      'boat-p0': BOAT('warm amber gold'),
      'boat-p1': BOAT('pale cyan blue'),
    },
  },

  // The three bays are the goal of the entire game and the biggest icon on the
  // board at ~49px — comfortably above the size where painted art beats a glyph.
  // Currently a generic lighthouse from the sprite sheet.
  //
  // The menu logo and backdrop are here too because they are the first thing
  // anyone sees, and the backdrop is the one surface with real room for artwork
  // rather than a 40px token.
  scene: {
    size: [768, 768],
    prompts: {
      'mouth-bay': ICON('a river mouth opening into the open sea, a simple stone '
        + 'lighthouse on a headland with calm water around it'),
      'logo-delta': ICON('a river delta seen from above, one channel splitting '
        + 'into three that reach the sea, bold simple shapes'),
    },
  },

  // App icon / favicon. Renders as small as 16px in a browser tab, so this is the
  // most brutal downscale in the whole file — finer than a board sprite. The brief
  // is pushed harder than ICON toward a single bold mark: one channel splitting to
  // the sea, filling a rounded square, on a solid delta-green field rather than
  // cream (a favicon sits on the browser chrome, not the parchment board). Several
  // variations because at this size the winner is a coin toss and you judge at 16px.
  favicon: {
    size: [512, 512],
    neg: 'photograph, 3d render, glossy, gradient, fine detail, thin lines, small '
      + 'elements, busy, cluttered, text, letters, words, watermark, signature, '
      + 'realistic, noisy, map, compass',
    prompts: {
      'icon-delta': 'a bold minimal app icon of a river delta seen from directly '
        + 'above, one thick teal channel splitting into three that fan out to the '
        + 'sea, flat two-tone teal and gold, on a solid dark delta-green rounded '
        + 'square, chunky heavy shapes, no fine detail, strong readable silhouette, '
        + 'fills the frame, centered, matte flat colour, not photorealistic, '
        + 'hand-painted board game emblem, no text',
      'icon-channel': 'a bold minimal app icon: a single thick gold river channel '
        + 'branching into a delta on a solid teal rounded square, flat two-tone, '
        + 'chunky heavy shapes, no fine detail, strong silhouette, fills the frame, '
        + 'centered, matte flat colour, not photorealistic, board game emblem, no text',
      'icon-mark':    'a bold minimal circular emblem of a braided river delta, '
        + 'three teal channels reaching a gold sea, flat two-tone on dark green, '
        + 'thick simple shapes, no fine detail, fills the frame, centered, matte '
        + 'flat colour, not photorealistic, hand-painted board game seal, no text',
    },
  },

  menu: {
    size: [1024, 768],
    prompts: {
      'menu-delta': 'wide painted landscape of a tropical river delta at golden '
        + 'hour seen from a high vantage point, calm braided channels reaching '
        + 'toward the sea, stilt houses on the banks, distant mountains, '
        + `muted and atmospheric, low contrast, nothing in sharp focus, `
        + `painted backdrop meant to sit BEHIND text, no people, no boats in the `
        + `foreground, no text, ${STYLE}`,
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

  // Two-season art (Amihan dry / Habagat wet). These sit in the season banner and
  // the flood/cascade beats. Same flat two-tone ICON brief as the board icons so they
  // read at small size and match the parchment palette. Judge at banner size on the
  // contact sheet before promoting into assets/.
  seasons: {
    size: [768, 768],
    prompts: {
      // Amihan — the dry NE monsoon. A low sun and a dry wind over cracked ground.
      'season-amihan':  ICON('a low sun over a dry cracked delta with a thin curling '
        + 'wind line, calm and parched, ochre and gold'),
      // Habagat — the wet SW monsoon. Heavy diagonal rain and a swollen river.
      'season-habagat': ICON('heavy diagonal monsoon rain falling on a swollen river, '
        + 'storm clouds and rising water, teal and grey'),
      // The flood beat — water surging back up the channels.
      'flood-surge':    ICON('a surge of water flooding up a braided river delta, '
        + 'curved flow lines spreading outward, teal on cream'),
      // Cascading Anod — sediment rolling downstream, the wet-season silt.
      'anod-cascade':   ICON('plumes of brown silt drifting downstream through a river '
        + 'channel, sediment clouds carried by the current, ochre and brown'),
    },
  },
};

// ---------------------------------------------------------------- generate
const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const want = args.filter(a => !a.startsWith('--'));
const model = flags.includes('--pro2') ? MODELS.pro2
  : flags.includes('--pro') ? MODELS.pro
  : MODELS.schnell;
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
  console.log(`  schnell $${(total * MODELS.schnell.cost).toFixed(2)}   `
    + `--pro $${(total * MODELS.pro.cost).toFixed(2)}   `
    + `--pro2 $${(total * MODELS.pro2.cost).toFixed(2)}`);
  console.log('\n  node gen-assets.mjs bg          # start here (schnell draft)\n');
  process.exit(0);
}

const OUT = 'assets/gen';
fs.mkdirSync(OUT, { recursive: true });

// One image. Retries on 429/5xx: the free-ish tiers rate limit hard and a whole
// batch failing because of one blip is a waste of both money and patience.
async function generate(prompt, w, h, seed, tries = 3, neg = NEG) {
  for (let t = 0; t < tries; t++) {
    const res = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id, prompt,
        width: w, height: h, n: 1, seed,
        // FLUX.2 has no negative_prompt param; everything else takes one.
        ...(model.noNeg ? {} : { negative_prompt: neg }),
        // Only schnell takes an explicit step count; the pro models run their own
        // schedule and 400 on a steps value outside their range.
        ...(model.steps ? { steps: model.steps } : {}),
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
        const buf = await generate(prompt, w, h, seed, 3, batch.neg ?? NEG);
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
