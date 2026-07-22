// Board renderer. Turns game state into the SVG delta.
//
// Split out of ui.js, which had grown to 1300 lines doing six unrelated jobs.
// This file owns exactly one: given a game state and a little presentation
// context, paint the board. It never mutates game state and never reads UI
// globals — everything it needs arrives in the ctx argument, which is what makes
// it testable and keeps the dependency pointing one way.

import { NODES, MOUTHS, CHANNELS, chKey, NODE_BY_ID } from './graph.js';
import { buildTargets, buildStepCost, shipOptions, canReachMouth, TUNING } from './engine.js';
import { nodeName } from './theme.js';
import { drawBayTrack } from './bays.js';
import { el, use } from './svg.js';

export { el, use } from './svg.js';

export const depthColor = (d) =>
  d === 0 ? 'var(--dead)' : ['', 'var(--water1)', 'var(--water2)', 'var(--water3)'][d];

// Route health of a single settlement, read the way final scoring reads it. A
// station scores vpLiveStation only if it still reaches the sea at liveDepthMin
// — so this classifies "is that +2 safe, at risk, or already lost", which is the
// one thing about a settlement you cannot see on the board until the game ends.
//
//   'live'     — a route survives one more shipment: every path found at the next
//                depth up still reaches the sea, so a single silt cannot cut it.
//   'fragile'  — a route exists but only through a channel one trip from dying;
//                ship through it and the settlement goes dark. The warning state.
//   'cut'      — no navigable route to any bay right now: scoring 0 and, if a dead
//                channel touches it, paying the silt penalty.
//
// Exported so a test can pin the boundaries against canReachMouth rather than
// against a pixel. Pure — reads depth, mutates nothing.
export function routeStatus(g, from) {
  if (!canReachMouth(g, from, TUNING.liveDepthMin)) return 'cut';
  // A route that also survives at the next depth up cannot be severed by one silt,
  // because that silt drops each used channel to still-navigable depth. Capped at
  // maxDepth so a game tuned to liveDepthMin === maxDepth never asks for depth+1.
  const safeDepth = Math.min(TUNING.liveDepthMin + 1, TUNING.maxDepth);
  return canReachMouth(g, from, safeDepth) ? 'live' : 'fragile';
}

// Water textures by depth — the components a printed edition would have. Depth is
// the core read of the game, so the four states must differ at a glance rather
// than on inspection.
const TILES = {
  3: './assets/art/water-deep.png',
  2: './assets/art/water-mid.png',
  1: './assets/art/water-shallow.png',
  0: './assets/art/water-silted.png',
};

// Node radii. Exported because the FX layer insets its strokes by the same amount
// — if these two ever disagree, effects draw an X through every node.
export const nodeRadius = (id) => (MOUTHS.includes(id) ? 4.2 : 3.3);
const INSET = 0.35;                                    // tuck under the ring
export const insetRadius = (id) => nodeRadius(id) - INSET;

// Deterministic jitter. A river that meanders differently on every repaint is
// nauseating, so the wobble is a pure function of the channel key — same channel,
// same curve, forever. There is a test asserting the path is byte-identical
// across renders.
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// A channel as a curved ribbon rather than a straight stroke. Straight lines
// between grid-aligned nodes is what made the board read as a node graph; rivers
// meander, and the meander is most of the difference.
export function channelPath(A, B, key) {
  const { P0, P1, P2, P3 } = channelCurve(A, B, key);
  return `M${P0.x},${P0.y} C${P1.x},${P1.y} ${P2.x},${P2.y} ${P3.x},${P3.y}`;
}

// The centreline control points of a channel, shared by the stroke path and the
// tapered ribbon so both trace the exact same meander. Pulled out of channelPath
// so the ribbon can sample the curve without re-deriving the wobble.
function channelCurve(A, B, key) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                 // perpendicular
  const a = (hash01(key) - 0.5) * 2;
  const b = (hash01(key + 'b') - 0.5) * 2;
  const amp = Math.min(2.6, len * 0.16);
  return {
    P0: { x: A.x, y: A.y },
    P1: { x: A.x + dx * 0.30 + nx * amp * a, y: A.y + dy * 0.30 + ny * amp * a },
    P2: { x: A.x + dx * 0.70 + nx * amp * b, y: A.y + dy * 0.70 + ny * amp * b },
    P3: { x: B.x, y: B.y },
    nx, ny, len,
  };
}

// A point on the cubic Bézier at parameter t, and the unit normal there. Used to
// walk the two banks of a tapered channel.
function bezierAt(c, t) {
  const u = 1 - t, tt = t * t, uu = u * u;
  const w0 = uu * u, w1 = 3 * uu * t, w2 = 3 * u * tt, w3 = tt * t;
  const x = w0 * c.P0.x + w1 * c.P1.x + w2 * c.P2.x + w3 * c.P3.x;
  const y = w0 * c.P0.y + w1 * c.P1.y + w2 * c.P2.y + w3 * c.P3.y;
  // Derivative for the tangent → normal. Falls back to the chord normal at the
  // degenerate ends where the derivative can vanish.
  const d0 = 3 * uu, d1 = 6 * u * t, d2 = 3 * tt;
  let dxv = d0 * (c.P1.x - c.P0.x) + d1 * (c.P2.x - c.P1.x) + d2 * (c.P3.x - c.P2.x);
  let dyv = d0 * (c.P1.y - c.P0.y) + d1 * (c.P2.y - c.P1.y) + d2 * (c.P3.y - c.P2.y);
  let dl = Math.hypot(dxv, dyv);
  if (dl < 1e-4) { dxv = c.nx; dyv = c.ny; dl = 1; }
  return { x, y, nx: -dyv / dl, ny: dxv / dl };
}

// A channel as a TAPERED WATERWAY rather than a constant-width stroke. This is
// what makes it read as a river instead of a pipe: a real distributary is narrow
// upstream and fans wider as it nears the sea, and its banks are ragged, not
// parallel rails. So the ribbon walks the same meander channelPath draws, but the
// half-width grows from wUp at the upstream node to wDown at the downstream one,
// and a deterministic per-station wobble (seeded off the key, so it never jitters
// on repaint — same rule as the meander) roughens each bank independently.
//
// Returns a closed path string: down one bank, across the mouth, back up the
// other. Filled with the depth texture, so depth still carries the core read via
// the overall width while the SHAPE finally looks like moving water.
export function channelRibbon(A, B, key, wUp, wDown, steps = 14) {
  const c = channelCurve(A, B, key);
  const left = [], right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = bezierAt(c, t);
    // Half-width eased downstream. smootherstep keeps the banks from kinking at
    // the ends where a linear ramp would show a corner.
    const e = t * t * t * (t * (t * 6 - 15) + 10);
    const hw = wUp + (wDown - wUp) * e;
    // Ragged banks: a small deterministic wobble per side, damped to zero at both
    // node ends so the ribbon still meets each node cleanly and the hit-target
    // (which follows the centreline) stays under the water.
    const taper = Math.sin(Math.PI * t);              // 0 at ends, 1 mid-channel
    // Raggedness scales with the channel's own width, so a wide deep channel gets
    // a wide meandering bank and a thread stays tight — a fixed wobble made the
    // narrow channels look torn. Each bank wobbles independently.
    const rag = (0.5 + hw) * 0.75;
    const wob = (hash01(`${key}~${i}`) - 0.5) * rag * taper;
    const wobR = (hash01(`${key}=${i}`) - 0.5) * rag * taper;
    left.push({ x: p.x + p.nx * (hw + wob),  y: p.y + p.ny * (hw + wob) });
    right.push({ x: p.x - p.nx * (hw + wobR), y: p.y - p.ny * (hw + wobR) });
  }
  const pts = left.concat(right.reverse());
  return 'M' + pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('L') + 'Z';
}

// Stop a channel at the edge of each node instead of running to its centre.
// Centre-to-centre was invisible while node fills were opaque; once they went
// semi-transparent over the parchment, every node had a visible X drawn through
// it. Channels are water BETWEEN settlements — they should not cross one.
export function insetEnds(P, Q, rP, rQ) {
  const dx = Q.x - P.x, dy = Q.y - P.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  return [
    { x: P.x + ux * rP, y: P.y + uy * rP },
    { x: Q.x - ux * rQ, y: Q.y - uy * rQ },
  ];
}

// SVG cannot stroke with an image directly, so each depth gets a <pattern> that
// strokes reference by id.
function ensureDefs(svg) {
  const defs = el('defs');
  for (const [depth, href] of Object.entries(TILES)) {
    const pat = el('pattern', {
      id: `tile${depth}`, patternUnits: 'userSpaceOnUse',
      width: 26, height: 26, patternContentUnits: 'userSpaceOnUse',
    });
    pat.appendChild(el('image', { href, x: 0, y: 0, width: 26, height: 26,
      preserveAspectRatio: 'xMidYMid slice' }));
    defs.appendChild(pat);
  }

  // Soft edge for the landmass and the channel banks. A hard vector outline read
  // as cut paper; a little blur turns it into a silty shoreline where water and
  // ground meet. stdDeviation is in user units (the 0..100 board space).
  const soft = el('filter', { id: 'bankSoft', x: '-8%', y: '-8%', width: '116%', height: '116%' });
  soft.appendChild(el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '0.7' }));
  defs.appendChild(soft);

  // Vertical wash over the terrain: cooler and darker toward the sea, warm and dry
  // toward the source. Multiplied over the land texture so the whole delta has a
  // sense of descending into water rather than being one flat sheet.
  const damp = el('linearGradient', { id: 'deltaDamp', x1: '0', y1: '0', x2: '0', y2: '1' });
  damp.appendChild(el('stop', { offset: '0%',  'stop-color': '#6b5c3e', 'stop-opacity': '0' }));
  damp.appendChild(el('stop', { offset: '55%', 'stop-color': '#3f4a3f', 'stop-opacity': '0.16' }));
  damp.appendChild(el('stop', { offset: '100%', 'stop-color': '#20302f', 'stop-opacity': '0.4' }));
  defs.appendChild(damp);

  // Deep-water glow, laid along a channel to give the deepest routes a lit,
  // navigable-water feel instead of flat teal.
  const glow = el('linearGradient', { id: 'deepGlow', x1: '0', y1: '0', x2: '0', y2: '1' });
  glow.appendChild(el('stop', { offset: '0%',  'stop-color': '#7fe4d6', 'stop-opacity': '0' }));
  glow.appendChild(el('stop', { offset: '100%', 'stop-color': '#7fe4d6', 'stop-opacity': '0.5' }));
  defs.appendChild(glow);

  // An empty node is a printed depression in the board — a space waiting for a
  // piece — not another filled circle. A radial gradient darkening toward the
  // rim does the job of an inset shadow at a fraction of the cost of an SVG
  // filter, which would run on every one of twenty nodes per repaint.
  const well = el('radialGradient', { id: 'nodeWell', cx: '50%', cy: '42%', r: '62%' });
  well.appendChild(el('stop', { offset: '0%', 'stop-color': '#3b3426' }));
  well.appendChild(el('stop', { offset: '72%', 'stop-color': '#332c20' }));
  well.appendChild(el('stop', { offset: '100%', 'stop-color': '#241e15' }));
  defs.appendChild(well);

  svg.appendChild(defs);
}

// The painted delta floodplain the channels run over. This is a single generated
// board-base image (gen-assets.mjs, batch `basemap`) — a top-down painting of the
// whole delta: dry upland high, floodplain and marsh low, dissolving into the sea
// along the bottom coast. Before this the channels floated on flat parchment and
// the board read as a node graph on paper; a painted ground under them is what
// turns it into a map.
//
// It's a PNG rather than hand-drawn SVG on purpose: a floodplain is exactly the
// kind of organic, painterly surface a generator does far better than a bezier
// hull, and it costs one image, not a page of path data. The channels stay SVG —
// they change depth, die, and light up on click every turn, which a baked image
// cannot do — so the split is "painted ground, live water".
//
// Non-interactive and at the very back (pointer-events off), so every existing
// click target — nodes, channels, cubes — still lands exactly as before. If the
// image is missing the board simply falls back to the parchment underneath, which
// is what shipped before, so this can never leave the board unplayable.
const BASEMAP = './assets/art/basemap.png';

function drawTerrain(svg) {
  const g = el('g', { class: 'terrain', 'pointer-events': 'none' });

  // Drawn slightly past the 0..100 layout box so the painted coast bleeds off the
  // edges instead of showing a seam. preserveAspectRatio slice keeps it filling
  // the frame at any board aspect.
  const img = el('image', {
    href: BASEMAP, x: -8, y: -8, width: 116, height: 116,
    preserveAspectRatio: 'xMidYMid slice',
  });
  // If the base image 404s, drop it so the parchment ground shows through rather
  // than a broken-image glyph.
  img.addEventListener('error', () => img.remove(), { once: true });
  g.appendChild(img);

  // Coast vignette: pull the eye to the delta and seat the edge nodes on darker
  // ground. Cheap, and it survives a missing base image.
  g.appendChild(el('rect', {
    x: -8, y: -8, width: 116, height: 116, fill: 'url(#deltaDamp)',
  }));

  svg.appendChild(g);
}

// ctx carries everything this renderer needs from the UI, so it reads no globals:
//   { svg, g, human, playerColors, theme, pendingAction, highlight,
//     artImage, ico, nodeLabel, ART }
export function drawBoard(ctx) {
  const { svg, g, human: HUMAN, playerColors: PC, theme: T,
          pendingAction, aimNode, highlight: hl, shipRoutes: routes, artImage, ico, nodeLabel, ART } = ctx;
  svg.innerHTML = '';
  ensureDefs(svg);
  drawTerrain(svg);                                    // land first, everything sits on it
  // Crosshair while aiming so the board reads as "click a target", not "drag me".
  svg.classList.toggle('aiming', !!pendingAction);
  const owner = {};
  g.players.forEach((p, i) => p.stations.forEach(s => { owner[s] = i; }));

  // Build targets, filtered to what the player can actually afford (base + distance
  // premium) — lighting a node you cannot pay for just invites a fizzle. Distance
  // cost is captured alongside so the tooltip can show it.
  const bstep = {};
  const btargets = new Set();
  if (pendingAction === 'build') {
    const hp = g.players[HUMAN];
    const base = TUNING.buildBase + hp.stations.length;
    for (const id of buildTargets(g, hp)) {
      const step = buildStepCost(g, hp, id);
      if (hp.coins >= base + step) { btargets.add(id); bstep[id] = step; }
    }
  }
  // Stage one of shipping: the settlements you can send from. Suppressed once one
  // is picked (routes set), so the board switches from "choose an origin" to
  // "choose a destination" rather than showing both at once.
  const sfrom = (pendingAction === 'ship' && !routes)
    ? new Set(shipOptions(g, g.players[HUMAN]).map(o => o.from)) : new Set();
  // Stage two: the bays the selected origin can reach, and the channels on the
  // way. Drawn as bright routes so you can see exactly what each choice ships
  // through — and therefore what each choice will silt.
  const destMouths = new Set((routes ?? []).map(r => r.mouth));

  // With a hukay token in hand and Dredge pending, DEAD channels become dredge targets
  // (the token can revive them) — highlight them so the player sees what the shovel can
  // reach. Normal dredge can only touch living, non-full channels.
  const humanHukay = g.players[HUMAN]?.hukay > 0;
  const reviveArmed = pendingAction === 'dredge' && humanHukay;

  // --- channels
  const tolls = [];
  // Channel click-targets are collected and appended LAST. Drawn inline they sat
  // beneath the node circles, which paint later and swallowed the clicks — dredge
  // became unresolvable and the round hung.
  const hitLayer = [];


  for (const [a, b] of CHANNELS) {
    const k = chKey(a, b), d = g.depth[k];
    const A0 = NODE_BY_ID[a], B0 = NODE_BY_ID[b];
    const [A, B] = insetEnds(A0, B0, insetRadius(a), insetRadius(b));
    // Normal dredge: living, not-yet-full channel. With a hukay token, a DEAD channel is
    // dredgeable too — the token revives it.
    const dredgeable = pendingAction === 'dredge'
      && ((d > 0 && d < TUNING.maxDepth) || (d === 0 && reviveArmed));
    const reviveTarget = d === 0 && reviveArmed;

    // Channels are TAPERED waterways, not constant-width strokes: narrow where they
    // leave the upstream node and wider as they near the sea, so the delta reads as
    // water fanning out to the bay instead of a lattice of equal pipes. Depth still
    // carries the core read — a deeper channel is wider at both ends — but the taper
    // is what makes it look like a river. See channelRibbon.
    //
    // Half-widths, not full: the ribbon is built from a centreline. Downstream end
    // runs ~1.5x the upstream so the fan is visible without the deep channels
    // touching the node rings.
    const base = d === 0 ? 0.5 : 0.52 + d * 0.31;      // depth still spans ~2.4x
    // Strong taper: downstream runs nearly double the upstream width, so each
    // channel visibly widens toward the sea and the board reads as a fanning delta
    // rather than a lattice of equal bands.
    const wUp = base * 0.55, wDown = base * 1.35;
    const pathD = channelPath(A, B, k);                 // centreline: hit-target, routes, tolls
    const ribbon = channelRibbon(A, B, k, wUp, wDown);  // the painted water body

    // Dark bed under every channel: an eroded bank shadow that gives the water an
    // edge against the ground and keeps a dead channel visible as a scar. Softened
    // and slightly wider than the water so it reads as a shoreline, not an outline.
    svg.appendChild(el('path', {
      d: channelRibbon(A, B, k, wUp + 0.35, wDown + 0.45),
      fill: 'rgba(28,22,14,.5)', filter: 'url(#bankSoft)',
    }));

    // The number on a channel and the coloured ring around it are the two things
    // a new player asks about first, and nothing on the board explained either.
    // Nodes had tooltips; channels had none.
    const owner = g.rights[k];
    const ownerName = owner !== null && owner !== undefined
      ? g.players[owner]?.name : null;
    const tip = d === 0
      ? (reviveArmed
        ? 'Dried up — but you hold a hukay. Dredge it to spend the shovel and revive '
          + 'this channel back to depth 1. It is the only way to bring a dead bed back.'
        : 'Dried up. This channel is gone for good — no boat can cross it, and only a '
          + 'hukay (earned by surveying) can revive it. Every route that used it goes around.')
      : `Depth ${d}. A boat may cross any channel with depth 1 or more, and each `
        + `crossing wears it down by ${TUNING.siltPerShip}. At depth 0 it dies `
        + `permanently.`
        + (ownerName
          ? ` The ring means ${ownerName} dredged it: everyone else pays them `
            + `${TUNING.tollPerShip} gold to pass, and it is worth points at the `
            + `end while it stays deep.`
          : ' Unclaimed — dredge it to collect a toll from everyone who passes.');

    // The water body: the tapered ribbon filled with the depth texture. This is the
    // .ch element the rest of the app keys off, so it keeps every data attribute and
    // the tooltip; only its geometry changed from a stroked line to a filled shape.
    svg.appendChild(el('path', {
      d: ribbon, fill: `url(#tile${d})`, stroke: 'none',
      opacity: d === 0 ? 0.9 : 1,
      'data-ch': k, 'data-depth': d, 'data-rights': g.rights[k] ?? '',
      'data-tip-title': d === 0 ? 'Dead channel' : `Channel — depth ${d}`,
      'data-tip': tip,
      class: 'ch',
    }));

    // Depth tint over the texture. The tiles alone are too similar in value at
    // board scale; this restores the at-a-glance read the flat colours had.
    svg.appendChild(el('path', {
      d: ribbon, fill: depthColor(d), stroke: 'none',
      opacity: d === 0 ? 0.34 : 0.26,
      'mix-blend-mode': 'overlay',
    }));

    // Deep water catches the light down the centreline: a thin bright core on the
    // deepest channels so navigable water reads as lit rather than flat teal. Only
    // depth 3 — shallower channels stay matte, which sharpens the depth read.
    if (d >= 3) {
      svg.appendChild(el('path', {
        d: pathD, fill: 'none', stroke: 'url(#deepGlow)',
        'stroke-width': base * 0.8, 'stroke-linecap': 'round',
        opacity: 0.55, filter: 'url(#bankSoft)',
      }));
    }

    if (dredgeable) {
      svg.appendChild(el('path', {
        d: pathD, fill: 'none', stroke: 'var(--gold)',
        'stroke-width': base * 2 + 0.35, 'stroke-linecap': 'round',
        opacity: 0.75, class: 'pulse',
      }));
    }

    // Revive target: a dead channel your hukay can bring back. The normal gold pulse is
    // sized off depth, which is ~nothing on a dead bed, so give it its own bright dashed
    // pulse at a fixed width — it reads as "the shovel can reach this", an invitation, not
    // the old red threat.
    if (reviveTarget) {
      svg.appendChild(el('path', {
        d: pathD, fill: 'none', stroke: 'var(--gold)',
        'stroke-width': 1.6, 'stroke-linecap': 'round',
        'stroke-dasharray': '1.4 1.1', opacity: 0.9, class: 'pulse',
      }));
    }

    // Hit target follows the same curve as the ribbon. A straight-line target
    // over a meandering channel misses at the bends.
    //
    // Built for EVERY channel, not just dredgeable ones. It used to exist only
    // while aiming a dredge, which meant a channel could not be hovered the rest
    // of the time — so the depth number and the owner's marker, the two things
    // players ask about first, had no way to explain themselves.
    const hit = el('path', { d: pathD, fill: 'none',
      stroke: 'transparent', 'stroke-width': Math.max(5, base * 2 + 3),
      'pointer-events': 'stroke',
      'data-tip-title': d === 0 ? 'Dead channel' : `Channel — depth ${d}`,
      'data-tip': tip,
      ...(dredgeable ? { 'data-hit': k } : {}),
    });
    if (dredgeable) hit.style.cursor = 'pointer';
    hitLayer.push(hit);
    if (g.rights[k] !== null && d > 0) tolls.push([A, B, g.rights[k], pathD, k]);
  }

  // --- ship route preview
  //
  // Only once an origin is chosen, and only that origin's routes. The old preview
  // drew every route from every settlement the instant you armed a ship — a faint
  // gold cobweb over the whole board that told you nothing about the choice you
  // were about to make. Now the routes appear on the second stage, bright, so you
  // can trace each one to its bay and see which channels it will wear down.
  if (routes) {
    for (const o of routes) {
      for (const k of o.path) {
        const [a, b] = k.split('>');
        const [A, B] = insetEnds(NODE_BY_ID[a], NODE_BY_ID[b], insetRadius(a), insetRadius(b));
        const pd = channelPath(A, B, k);
        svg.appendChild(el('path', { d: pd, fill: 'none',
          stroke: 'var(--gold)', 'stroke-width': 0.7, opacity: .8,
          'stroke-linecap': 'round', 'stroke-dasharray': '1.1 0.9', class: 'shipRoute',
          // The route is a hint, not a button. Left interactive it swallowed the
          // click without resolving anything, so the whole thing felt broken.
          'pointer-events': 'none' }));
      }
    }
  }

  // --- toll markers (above the water)
  // Ownership is a Hansa-style cube track, not a single dot: one small cube per
  // dredge marker, laid along the channel from the upstream end toward the bay.
  // The owner's cubes sit at the BAY end (B) — closest-to-the-sea holds the route,
  // like Hansa's rightmost office — and challengers stack upstream behind them.
  // Now the count IS the read: how many each player has, and how many empty-looking
  // gaps until a challenger draws level, is legible on the board itself.
  for (const [A, B, o, pathD, k] of tolls) {
    const marks = g.markers?.[k] ?? {};
    // Cubes to draw: owner first (they take the bay end), then every challenger by
    // descending count. Deterministic — the engine stores counts, not dredge order,
    // so this is a stable layout, not a literal history.
    const holders = Object.entries(marks)
      .map(([idx, n]) => [+idx, n])
      .filter(([, n]) => n > 0)
      .sort((a2, b2) => (a2[0] === o ? -1 : b2[0] === o ? 1 : b2[1] - a2[1]));
    const cubes = [];
    for (const [idx, n] of holders) for (let i = 0; i < n; i++) cubes.push(idx);
    if (!cubes.length) continue;

    // Sample the curve so each cube sits ON the water. cubes[0] is the owner's, and
    // it goes nearest the bay (B) — so walk t from the bay end backwards upstream.
    const probe = pathD ? el('path', { d: pathD }) : null;
    if (probe) svg.appendChild(probe);
    const total = probe ? (() => { try { return probe.getTotalLength(); } catch { return 0; } })() : 0;
    const N = cubes.length;
    // Track length grows with cube count so a busy channel does not overlap its own
    // cubes: ~72% of the channel at the low end, capped so it never reaches a node.
    const span = Math.min(0.82, 0.4 + N * 0.11), lead = 0.7;   // bay end at t=0.7
    const at = (i) => {
      const frac = N === 1 ? lead : lead - (i / (N - 1)) * span * (lead - 0.1);
      if (total) { try { const p = probe.getPointAtLength(total * frac); return [p.x, p.y]; } catch { /* fall through */ } }
      return [A.x + (B.x - A.x) * frac, A.y + (B.y - A.y) * frac];
    };

    const ownerName = g.players[o]?.name ?? 'Someone';
    const mine = o === HUMAN;
    const ownerN = marks[o] ?? 0;
    const tip = mine
      ? `You hold this with ${ownerN} cube${ownerN === 1 ? '' : 's'} at the bay end. `
        + `Others pay ${TUNING.tollPerShip} gold to pass; it scores ${TUNING.rightsVP} `
        + `if still deep. A rival drawing level takes it — the cubes show how close.`
      : `${ownerName} holds this with ${ownerN} cube${ownerN === 1 ? '' : 's'}; you pay `
        + `${TUNING.tollPerShip} gold to pass. Dredge to add your own cube — match `
        + `their count and the route flips to you.`;

    cubes.forEach((idx, i) => {
      const [cx, cy] = at(i);
      const isOwner = idx === o;
      const yours = idx === HUMAN;
      const s = isOwner ? 1.05 : 0.85;               // smaller cubes, more fit per channel
      // Backing so a coloured cube stays legible over any water depth.
      svg.appendChild(el('rect', { x: cx - s / 2 - 0.14, y: cy - s / 2 - 0.14,
        width: s + 0.28, height: s + 0.28, rx: 0.28, fill: 'rgba(20,16,10,.85)' }));
      svg.appendChild(el('rect', { x: cx - s / 2, y: cy - s / 2, width: s, height: s,
        rx: 0.22, fill: PC[idx],
        stroke: yours ? 'var(--gold)' : 'rgba(255,240,214,.7)',
        'stroke-width': yours ? 0.26 : 0.14,
        'data-toll': o, 'data-tip-title': mine ? 'You hold this channel'
          : `${ownerName} holds this channel`, 'data-tip': tip,
        class: hl?.kind === 'rights' ? 'pulse' : '' }));
    });
    if (probe) probe.remove();
  }

  // --- nodes
  for (const n of NODES) {
    const isMouth = MOUTHS.includes(n.id);
    const own = owner[n.id];
    // The board shows an abbreviated label ("Meycau", "Parañaque"), so the full
    // place name and the node's stock go in a tooltip. nodeName existed for
    // exactly this and had no caller until now.
    // "Tier 0 settlement — holds 4 bamboo" assumed you knew what a tier was and
    // never said what the badge on the node actually IS. The number and icon
    // floating above a node are the first thing a new player points at.
    const good = T.goods[n.good]?.gloss || n.good;
    const stock = MOUTHS.includes(n.id) ? ''
      : `The badge above it shows what it is holding: ${g.cubes[n.id]} ${good}. `
        + `${T.actions.ship.name} carries goods from here downstream to a bay, `
        + `which is how contracts get filled.`;
    // When aiming a Build, a reachable node names its distance premium, so a far
    // settle shows what the extra reach costs before you click.
    const buildTip = btargets.has(n.id)
      ? (bstep[n.id] > 0
        ? ` Settle here: +${bstep[n.id]} gold for the distance, on top of the build cost.`
        : ' Settle here — adjacent, no distance cost.')
      : '';
    const grp = el('g', {
      class: 'node', 'data-node': n.id,
      'data-tip-title': nodeName(T, n.id),
      'data-tip': (MOUTHS.includes(n.id)
        ? 'Open sea. Goods delivered here score, and contracts naming this bay are filled here.'
        : `A settlement site producing ${good}. ${stock}`) + buildTip,
    });

    // Tutorial highlight OR a legal target for the action being aimed right now.
    // This used to be the tutorial case only, so during ordinary play the legal
    // targets got a slightly warmer fill and nothing else — no motion at all.
    // "Click a highlighted node" is a poor instruction when nothing is moving.
    // destMouths included so the destination bays PULSE in stage-two shipping.
    // Without it the routes lit up but the thing you actually click — the bay at
    // the end — had no cue at all, so you had to guess the endpoint was the
    // target. The pulse plus the beacon ring is what says "click here".
    const isTarget = btargets.has(n.id) || sfrom.has(n.id) || destMouths.has(n.id);
    const highlighted = isTarget
      || (hl?.kind === 'node' && (hl.ids === 'own'
        ? g.players[HUMAN].stations.includes(n.id)
        : hl.ids?.includes?.(n.id)));

    const r = isMouth ? 4.2 : 3.3;
    // Warm, semi-transparent fills so nodes read as markers resting ON the paper.
    // Opaque dark discs looked like holes punched through it once the board gained
    // a parchment ground.
    // Unowned: a depression, so the board reads as having spaces you can claim.
    let fill = 'url(#nodeWell)';
    let stroke = 'var(--line2)', sw = 0.28;
    if (isMouth) { fill = 'color-mix(in srgb, #3c4442 82%, transparent)'; stroke = 'var(--water3)'; }
    if (own !== undefined) {
      stroke = PC[own]; sw = own === HUMAN ? 0.85 : 0.62;
      // Tint an owned node toward its owner rather than filling it flat — the ring
      // alone was easy to miss on a busy board.
      fill = `color-mix(in srgb, #4a4130 72%, ${PC[own]} 14%)`;
    }
    if (btargets.has(n.id) || sfrom.has(n.id)) {
      stroke = 'var(--gold)'; sw = 0.75;
      fill = 'color-mix(in srgb, var(--panel) 70%, var(--gold) 16%)';
    }
    // The build target currently staged in the confirm bar reads brighter than the
    // other lit targets, so re-aiming shows which one the bar is pricing.
    if (n.id === aimNode) {
      stroke = 'var(--gold)'; sw = 1.15;
      fill = 'color-mix(in srgb, var(--panel) 55%, var(--gold) 30%)';
    }

    // Expanding ring under the node, so a legal target announces itself from
    // across the board instead of relying on a glow the eye reads as lighting.
    if (highlighted) {
      grp.appendChild(el('circle', { cx: n.x, cy: n.y, r: r + 0.6, class: 'beacon' }));
    }

    grp.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill, stroke, 'stroke-width': sw,
      class: highlighted ? 'pulse' : '' }));

    // The player's piece.
    //
    // This is a game meant to port to a physical edition, so ownership is shown
    // the way a table would show it: a piece in your colour, sitting on the
    // space. It replaces a ring-colour-only signal that meant you had to
    // remember your seat colour and that failed outright for a colourblind
    // player — and an "own settlement" rim I drew at r-0.75, which the station
    // art then painted straight over. That rim passed a DOM check for existing
    // while being invisible on screen, which is why this is a shape now and not
    // another stroke.
    //
    // Traced from a generated silhouette (see gen-assets.mjs, batch `pieces`)
    // rather than painted, so it takes the owner's colour at runtime and keeps a
    // hard edge at the ~40px it actually renders at.
    if (isMouth) {
      grp.appendChild(use(`#ic-${ico('mouth')}`, n.x, n.y - 0.2, 4.4, 'var(--salt)'));
    } else if (own !== undefined) {
      // Dark plinth: the piece reads as standing ON the node rather than being
      // painted into it, and it holds the silhouette against a busy board.
      grp.appendChild(el('ellipse', { cx: n.x, cy: n.y + 1.5, rx: 1.7, ry: 0.5,
        fill: 'rgba(20,16,10,.5)' }));
      // Painted balangay, one image per seat colour.
      //
      // Was a traced SVG so one asset could take any colour at runtime. Two
      // things killed that: the trace turned the hut's stilts and windows into
      // speckle at the ~41px this renders at, and the generated source was a
      // suburban cottage — pitched roof, front door, square windows — which is
      // the wrong continent entirely for a game about datus. The prompt now
      // names the form (bahay kubo, steep thatched roof, bamboo stilts) and
      // pushes the model's default Western house away in the negatives.
      //
      // Four files is the cost of painted art. Worth it: recolouring was the
      // only thing the vector bought, and it bought it by being unreadable.
      // Yours gets a bright ring around the node. A CSS stroke cannot mark an
      // <image> the way it marked the old vector piece, and colour alone fails
      // for a colourblind player — so the marker is a shape, drawn under the
      // piece where the art cannot cover it.
      if (own === HUMAN) {
        grp.appendChild(el('circle', {
          cx: n.x, cy: n.y, r: r + 0.55, fill: 'none',
          stroke: 'rgba(255,248,230,.95)', 'stroke-width': 0.42,
          'stroke-dasharray': '2.2 1.4',
        }));
      }
      const piece = artImage(`piece-p${own}`, n.x, n.y - 0.15, 4.6);
      // A few degrees of tilt, seeded off the node id. Perfectly axis-aligned
      // pieces read as vector art; a piece set down by a hand never lands square.
      // Deterministic so it does not jitter on every repaint — same trick the
      // channels use for their meander.
      const tilt = (hash01(`tilt${n.id}`) - 0.5) * 7;
      piece.setAttribute('transform', `rotate(${tilt.toFixed(2)} ${n.x} ${n.y})`);
      grp.appendChild(piece);
    }

    // Goods: one legible badge instead of a scatter of 1.9-unit icons. Counting
    // four tiny sprites at a glance was the single worst readability problem on
    // the board — a count plus one commodity icon reads instantly.
    if (!isMouth) {
      const c = g.cubes[n.id];
      const col = `var(--${n.good})`;
      const bx = n.x, by = n.y - 4.6;
      if (c > 0) {
        grp.appendChild(el('rect', {
          x: bx - 2.9, y: by - 1.55, width: 5.8, height: 3.1, rx: 1.55,
          fill: 'var(--panel2)', stroke: col, 'stroke-width': 0.22, opacity: 0.96,
        }));
        const gi = T.goods[n.good].icon;
        // Painted goods where we have them; the sprite sheet is the fallback so an
        // unpicked commodity still renders.
        grp.appendChild(ART[gi]
          ? artImage(gi, bx - 1.35, by, 2.7)
          : use(`#ic-${gi}`, bx - 1.35, by, 2.2, col));
        const cnt = el('text', {
          x: bx + 1.1, y: by + 0.78, 'text-anchor': 'middle',
          'font-size': 2.2, fill: col, 'font-weight': 700,
        });
        cnt.textContent = c;
        grp.appendChild(cnt);
      } else {
        // Empty node: show the commodity ghosted so the map still reads.
        const gi = T.goods[n.good].icon;
        if (ART[gi]) {
          const im = artImage(gi, bx, by, 2.5);
          im.setAttribute('opacity', 0.34);
          grp.appendChild(im);
        } else {
          grp.appendChild(use(`#ic-${gi}`, bx, by, 2.1, col, 'empty'));
        }
      }
    }

    // dead-channel marker
    const anyDead = [...(g.out[n.id] ?? []).map(x => chKey(n.id, x)),
                     ...(g.inn[n.id] ?? []).map(x => chKey(x, n.id))]
      .some(k => g.depth[k] === 0);
    if (anyDead && own !== undefined) {
      grp.appendChild(use(`#ic-${ico('dead')}`, n.x + 3.2, n.y + 2.6, 2.4, 'var(--dead)'));
    }

    // Route-health dot for the human's own settlements. A settlement scores
    // vpLiveStation only while it reaches the sea, and that reward — plus the
    // moment a route is one shipment from dying — is otherwise invisible until
    // final scoring. This surfaces it while the player can still act on it.
    //
    // Colour carries the read; a shape difference (filled / ringed / hollow) is
    // the accessible backstop, because colour alone fails a colourblind player —
    // the same rule the "your piece" marker follows a few lines up. Only the
    // human's stations get it: it is a decision aid for your turn, not a readout
    // of everyone's board.
    if (!isMouth && own === HUMAN) {
      const st = routeStatus(g, n.id);
      const dx = n.x - 3.2, dy = n.y + 2.6;      // mirror of the dead-channel marker
      const mouthTerm = T.terms.mouth.name.toLowerCase();
      const meta = {
        live: {
          color: 'var(--good)',
          title: 'Route open',
          tip: `This ${T.terms.station.name.toLowerCase()} reaches the `
            + `${mouthTerm} by water deep enough to survive another shipment. `
            + `It scores you ${TUNING.vpLiveStation} points at the end while the `
            + `route stays open.`,
        },
        fragile: {
          color: 'var(--warn)',
          title: 'Route fragile',
          tip: `This ${T.terms.station.name.toLowerCase()} still reaches the `
            + `${mouthTerm}, but only through a channel one trip from dying. `
            + `Ship through it and the route closes — costing the `
            + `${TUNING.vpLiveStation}-point bonus. ${T.actions.dredge.name} first, `
            + `or route around it.`,
        },
        cut: {
          color: 'var(--bad)',
          title: 'Route cut off',
          tip: `This ${T.terms.station.name.toLowerCase()} cannot reach any `
            + `${mouthTerm}: it ships nothing and scores no live-route points. `
            + `Only a channel dredged back above depth 0 can reconnect it — a dead `
            + `one never reopens.`,
        },
      }[st];
      const dot = el('g', {
        class: 'routeDot', 'data-route': st,
        'data-tip-title': meta.title, 'data-tip': meta.tip,
      });
      // Dark disc behind, so the state colour holds against busy water.
      dot.appendChild(el('circle', { cx: dx, cy: dy, r: 1.15, fill: 'rgba(20,16,10,.85)' }));
      if (st === 'cut') {
        // Hollow ring + slash: a broken link, legible without colour.
        dot.appendChild(el('circle', { cx: dx, cy: dy, r: 0.9, fill: 'none',
          stroke: meta.color, 'stroke-width': 0.4 }));
        dot.appendChild(el('line', { x1: dx - 0.7, y1: dy + 0.7, x2: dx + 0.7, y2: dy - 0.7,
          stroke: meta.color, 'stroke-width': 0.4 }));
      } else if (st === 'fragile') {
        // Filled dot with a warning ring around it.
        dot.appendChild(el('circle', { cx: dx, cy: dy, r: 0.62, fill: meta.color }));
        dot.appendChild(el('circle', { cx: dx, cy: dy, r: 1, fill: 'none',
          stroke: meta.color, 'stroke-width': 0.28, opacity: 0.85 }));
      } else {
        // Solid filled dot: the calm, healthy state.
        dot.appendChild(el('circle', { cx: dx, cy: dy, r: 0.9, fill: meta.color }));
      }
      grp.appendChild(dot);
    }

    const label = el('text', {
      x: n.x, y: n.y + (isMouth ? 7.4 : 6.1), 'text-anchor': 'middle',
      'font-size': isMouth ? 2.5 : (nodeLabel(T, n.id).length > 7 ? 1.8 : 2.05),
      fill: own !== undefined ? PC[own] : 'var(--dim)',
      'font-weight': own !== undefined ? 700 : 500,
      // Halo so place names stay readable where they cross a channel.
      stroke: 'var(--bg)', 'stroke-width': 0.6, 'paint-order': 'stroke',
    });
    label.textContent = nodeLabel(T, n.id);
    grp.appendChild(label);

    if (isMouth) drawBayTrack({ grp, n, g, PC, HUMAN, T, nodeLabel });

    // Neglected-bay premium: the quietest bay last round carries a gold bonus for
    // the first player to ship here. A coin badge over the bay so the incentive to
    // break from the crowd and supply the ignored route is visible on the board,
    // not buried in the log.
    if (isMouth && g.bayBonus && g.bayBonus.mouth === n.id && g.bayBonus.amount > 0) {
      const bx = n.x + 4.6, by = n.y - 3.6;
      const badge = el('g', {
        class: 'bayBonus',
        'data-tip-title': 'Neglected bay — bonus gold',
        'data-tip': `This ${T.terms.mouth.name.toLowerCase()} got the least cargo `
          + `last round, so the first player to ship here this round earns an extra `
          + `${g.bayBonus.amount} gold on top. Its route has usually silted from `
          + `neglect — ${T.actions.dredge.name} your way in and the premium is yours.`,
      });
      badge.appendChild(el('circle', { cx: bx, cy: by, r: 2.1,
        fill: 'var(--gold)', stroke: 'rgba(20,16,10,.9)', 'stroke-width': 0.35,
        class: 'pulse' }));
      const amt = el('text', {
        x: bx, y: by + 0.85, 'text-anchor': 'middle', 'font-size': 2.6,
        'font-weight': 800, fill: 'rgba(30,22,8,1)',
      });
      amt.textContent = `+${g.bayBonus.amount}`;
      badge.appendChild(amt);
      grp.appendChild(badge);
    }

    const interactive = btargets.has(n.id) || sfrom.has(n.id) || destMouths.has(n.id);
    if (interactive) {
      grp.style.cursor = 'pointer';
      const kind = btargets.has(n.id) ? 'build'
        : destMouths.has(n.id) ? 'shipTo'   // stage two: a chosen destination bay
        : 'ship';                           // stage one: a settlement to send from
      // Fingers are much bigger than a 2.7-unit node: add a generous invisible
      // hit area so tapping near the node still works.
      grp.appendChild(el('circle', {
        cx: n.x, cy: n.y, r: 6, fill: 'transparent', 'data-hit-node': n.id,
        'data-hit-kind': kind, 'pointer-events': 'fill',
      }));
    }
    svg.appendChild(grp);
  }

  // Channel targets go above the nodes so a click near a channel reaches it.
  for (const h of hitLayer) svg.appendChild(h);
}
