// Board renderer. Turns game state into the SVG delta.
//
// Split out of ui.js, which had grown to 1300 lines doing six unrelated jobs.
// This file owns exactly one: given a game state and a little presentation
// context, paint the board. It never mutates game state and never reads UI
// globals — everything it needs arrives in the ctx argument, which is what makes
// it testable and keeps the dependency pointing one way.

import { NODES, MOUTHS, CHANNELS, chKey, NODE_BY_ID } from './graph.js';
import { buildTargets, shipOptions, TUNING } from './engine.js';
import { nodeName } from './theme.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(t, a = {}) {
  const e = document.createElementNS(NS, t);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
}

export function use(href, x, y, size, color, cls = '') {
  const u = el('use', { href, x: x - size / 2, y: y - size / 2, width: size, height: size });
  u.style.color = color;
  if (cls) u.setAttribute('class', cls);
  return u;
}

export const depthColor = (d) =>
  d === 0 ? 'var(--dead)' : ['', 'var(--water1)', 'var(--water2)', 'var(--water3)'][d];

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
  const dx = B.x - A.x, dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;                 // perpendicular
  // Two control points pushed to opposite sides give an S-curve, which reads as a
  // natural channel; a single offset just looks like a bent pipe.
  const a = (hash01(key) - 0.5) * 2;
  const b = (hash01(key + 'b') - 0.5) * 2;
  const amp = Math.min(2.6, len * 0.16);
  const c1 = { x: A.x + dx * 0.30 + nx * amp * a, y: A.y + dy * 0.30 + ny * amp * a };
  const c2 = { x: A.x + dx * 0.70 + nx * amp * b, y: A.y + dy * 0.70 + ny * amp * b };
  return `M${A.x},${A.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${B.x},${B.y}`;
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
  svg.appendChild(defs);
}

// ctx carries everything this renderer needs from the UI, so it reads no globals:
//   { svg, g, human, playerColors, theme, pendingAction, highlight,
//     artImage, ico, nodeLabel, ART }
export function drawBoard(ctx) {
  const { svg, g, human: HUMAN, playerColors: PC, theme: T,
          pendingAction, highlight: hl, artImage, ico, nodeLabel, ART } = ctx;
  svg.innerHTML = '';
  ensureDefs(svg);
  // Crosshair while aiming so the board reads as "click a target", not "drag me".
  svg.classList.toggle('aiming', !!pendingAction);
  const owner = {};
  g.players.forEach((p, i) => p.stations.forEach(s => { owner[s] = i; }));

  const btargets = pendingAction === 'build'
    ? new Set(buildTargets(g, g.players[HUMAN])) : new Set();
  const sfrom = pendingAction === 'ship'
    ? new Set(shipOptions(g, g.players[HUMAN]).map(o => o.from)) : new Set();

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
    const dredgeable = pendingAction === 'dredge' && d > 0 && d < TUNING.maxDepth;

    // Channels are painted ribbons of water texture, not coloured strokes. Width
    // still carries depth — that read is the game's core signal and must survive
    // even if a texture fails to load.
    // Narrower than the first pass: at 1.5+d*0.85 the deep channels nearly touched
    // the node rings and the board felt congested. Depth still spans a 2.4x range,
    // which is what carries the read.
    const w = d === 0 ? 1.05 : 1.05 + d * 0.62;
    const pathD = channelPath(A, B, k);

    // Dark bed under every channel: gives the ribbon an edge against the parchment
    // and keeps a dead channel visible as a scar rather than vanishing.
    svg.appendChild(el('path', {
      d: pathD, fill: 'none', stroke: 'rgba(28,22,14,.55)',
      'stroke-width': w + 0.5, 'stroke-linecap': 'round',
    }));

    svg.appendChild(el('path', {
      d: pathD, fill: 'none',
      stroke: `url(#tile${d})`,
      'stroke-width': w, 'stroke-linecap': 'round',
      opacity: d === 0 ? 0.9 : 1,
      'data-ch': k, 'data-depth': d, 'data-rights': g.rights[k] ?? '',
      class: 'ch',
    }));

    // Depth tint over the texture. The tiles alone are too similar in value at
    // board scale; this restores the at-a-glance read the flat colours had.
    svg.appendChild(el('path', {
      d: pathD, fill: 'none', stroke: depthColor(d),
      'stroke-width': w, 'stroke-linecap': 'round',
      opacity: d === 0 ? 0.34 : 0.26,
      'mix-blend-mode': 'overlay',
    }));

    if (dredgeable) {
      svg.appendChild(el('path', {
        d: pathD, fill: 'none', stroke: 'var(--gold)',
        'stroke-width': w + 0.35, 'stroke-linecap': 'round',
        opacity: 0.75, class: 'pulse',
      }));
    }

    if (dredgeable) {
      // Hit target follows the same curve as the ribbon. A straight-line target
      // over a meandering channel misses at the bends.
      const hit = el('path', { d: pathD, fill: 'none',
        stroke: 'transparent', 'stroke-width': Math.max(5, w + 3), 'data-hit': k,
        'pointer-events': 'stroke' });
      hit.style.cursor = 'pointer';
      hitLayer.push(hit);
    }
    if (g.rights[k] !== null && d > 0) tolls.push([A, B, g.rights[k], pathD]);
  }

  // --- ship route preview
  if (pendingAction === 'ship') {
    for (const o of shipOptions(g, g.players[HUMAN])) {
      for (const k of o.path) {
        const [a, b] = k.split('>');
        // Follow the channel's own curve, or the preview cuts across the meander
        // and points at water that is not on the route.
        const [A, B] = insetEnds(NODE_BY_ID[a], NODE_BY_ID[b], insetRadius(a), insetRadius(b));
        const pd = channelPath(A, B, k);
        svg.appendChild(el('path', { d: pd, fill: 'none',
          stroke: 'var(--gold)', 'stroke-width': 0.4, opacity: .55,
          'stroke-dasharray': '.7 .8' }));
      }
    }
  }

  // --- toll markers (above the water)
  for (const [A, B, o, pathD] of tolls) {
    // Sit the marker ON the channel by sampling its curve. The straight-line
    // midpoint drifts off the water wherever a channel bends hardest — which is
    // exactly where the marker is most likely to be misread as belonging to a
    // neighbouring channel.
    let mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    if (pathD) {
      const probe = el('path', { d: pathD });
      svg.appendChild(probe);
      try {
        const pt = probe.getPointAtLength(probe.getTotalLength() / 2);
        mx = pt.x; my = pt.y;
      } catch { /* getPointAtLength needs layout; fall back to the midpoint */ }
      probe.remove();
    }
    svg.appendChild(el('circle', { cx: mx, cy: my, r: 1.05, fill: PC[o],
      stroke: 'rgba(20,16,10,.85)', 'stroke-width': 0.32, 'data-toll': o,
      class: hl?.kind === 'rights' ? 'pulse' : '' }));
  }

  // --- nodes
  for (const n of NODES) {
    const isMouth = MOUTHS.includes(n.id);
    const own = owner[n.id];
    // The board shows an abbreviated label ("Meycau", "Parañaque"), so the full
    // place name and the node's stock go in a tooltip. nodeName existed for
    // exactly this and had no caller until now.
    const stock = MOUTHS.includes(n.id) ? '' :
      ` — holds ${g.cubes[n.id]} ${T.goods[n.good]?.gloss || n.good}`;
    const grp = el('g', {
      class: 'node', 'data-node': n.id,
      'data-tip-title': nodeName(T, n.id),
      'data-tip': MOUTHS.includes(n.id)
        ? 'Open sea. Goods delivered here score, and contracts naming this bay are filled here.'
        : `Tier ${n.tier} settlement${stock}.`,
    });

    const highlighted =
      (hl?.kind === 'node' && (hl.ids === 'own'
        ? g.players[HUMAN].stations.includes(n.id)
        : hl.ids?.includes?.(n.id)));

    const r = isMouth ? 4.2 : 3.3;
    // Warm, semi-transparent fills so nodes read as markers resting ON the paper.
    // Opaque dark discs looked like holes punched through it once the board gained
    // a parchment ground.
    let fill = 'color-mix(in srgb, #4a4130 78%, transparent)';
    let stroke = 'var(--line2)', sw = 0.28;
    if (isMouth) { fill = 'color-mix(in srgb, #3c4442 82%, transparent)'; stroke = 'var(--water3)'; }
    if (own !== undefined) {
      stroke = PC[own]; sw = 0.62;
      // Tint an owned node toward its owner rather than filling it flat — the ring
      // alone was easy to miss on a busy board.
      fill = `color-mix(in srgb, #4a4130 72%, ${PC[own]} 14%)`;
    }
    if (btargets.has(n.id) || sfrom.has(n.id)) {
      stroke = 'var(--gold)'; sw = 0.75;
      fill = 'color-mix(in srgb, var(--panel) 70%, var(--gold) 16%)';
    }

    grp.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill, stroke, 'stroke-width': sw,
      class: highlighted ? 'pulse' : '' }));

    // station or lighthouse art
    if (isMouth) {
      grp.appendChild(use(`#ic-${ico('mouth')}`, n.x, n.y - 0.2, 4.4, 'var(--salt)'));
    } else if (own !== undefined) {
      grp.appendChild(use(`#ic-${ico('station')}`, n.x, n.y - 0.1, 3.9, PC[own]));
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

    if (isMouth) {
      const tot = g.players.reduce((s, p) =>
        s + p.delivered[n.id].timber + p.delivered[n.id].grain + p.delivered[n.id].salt, 0);
      if (tot) {
        const t = el('text', { x: n.x, y: n.y + 10.2, 'text-anchor': 'middle',
          'font-size': 2.1, fill: 'var(--dim)' });
        t.textContent = `${tot} delivered`;
        grp.appendChild(t);
      }
    }

    const interactive = btargets.has(n.id) || sfrom.has(n.id);
    if (interactive) {
      grp.style.cursor = 'pointer';
      // Fingers are much bigger than a 2.7-unit node: add a generous invisible
      // hit area so tapping near the node still works.
      grp.appendChild(el('circle', {
        cx: n.x, cy: n.y, r: 6, fill: 'transparent', 'data-hit-node': n.id,
        'data-hit-kind': btargets.has(n.id) ? 'build' : 'ship',
        'pointer-events': 'fill',
      }));
    }
    svg.appendChild(grp);
  }

  // Channel targets go above the nodes so a click near a channel reaches it.
  for (const h of hitLayer) svg.appendChild(h);
}
