// Rulebook diagrams.
//
// The rulebook was ten pages of prose describing a board the reader could not
// see. These draw the thing being explained, using the SAME channel curves,
// water textures and node shapes as the real board — so a diagram cannot drift
// from what the game actually looks like, which is the usual failure mode of
// hand-drawn rulebook art.
//
// Each returns an SVG string. They are inert: no handlers, no state.

import { channelPath, insetEnds, depthColor } from './board.js';
import { TUNING } from './engine.js';

const TOLL = TUNING.tollPerShip;

const TILE = {
  3: './assets/art/water-deep.png',
  2: './assets/art/water-mid.png',
  1: './assets/art/water-shallow.png',
  0: './assets/art/water-silted.png',
};

// Shared <defs>. Each diagram is its own <svg>, so pattern ids must be unique per
// figure or the second one on a page silently steals the first one's fill.
const defs = (uid) => `
  <defs>
    ${Object.entries(TILE).map(([d, href]) => `
      <pattern id="${uid}t${d}" patternUnits="userSpaceOnUse" width="26" height="26"
               patternContentUnits="userSpaceOnUse">
        <image href="${href}" x="0" y="0" width="26" height="26"
               preserveAspectRatio="xMidYMid slice"/>
      </pattern>`).join('')}
  </defs>`;

// One channel, drawn exactly the way the board draws it: dark bed, texture fill,
// depth tint. Reusing board.js's channelPath means the meander matches too.
// `inset` is how much to trim from each end — 3.0 where the segment runs between
// two drawn nodes, 0 for a bare swatch. Trimming a short swatch by the node radius
// eats most of the sample.
const channel = (uid, A, B, depth, key = 'k', extra = '', inset = 3.0) => {
  const w = depth === 0 ? 1.05 : 1.05 + depth * 0.62;
  const [P, Q] = inset ? insetEnds(A, B, inset, inset) : [A, B];
  const d = channelPath(P, Q, key);
  return `
    <path d="${d}" fill="none" stroke="rgba(28,22,14,.55)"
          stroke-width="${w + 0.5}" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="url(#${uid}t${depth})"
          stroke-width="${w}" stroke-linecap="round" opacity="${depth === 0 ? 0.9 : 1}"/>
    <path d="${d}" fill="none" stroke="${depthColor(depth)}"
          stroke-width="${w}" stroke-linecap="round"
          opacity="${depth === 0 ? 0.34 : 0.26}" style="mix-blend-mode:overlay"/>
    ${extra}`;
};

const node = (x, y, { colour = null, label = '', r = 3.0 } = {}) => `
  <circle cx="${x}" cy="${y}" r="${r}"
          fill="${colour ? `color-mix(in srgb, #4a4130 72%, ${colour} 14%)` : 'color-mix(in srgb, #4a4130 78%, transparent)'}"
          stroke="${colour ?? 'var(--line2)'}" stroke-width="${colour ? 0.62 : 0.28}"/>
  ${label ? `<text x="${x}" y="${y + 5.6}" text-anchor="middle" font-size="2.3"
        fill="${colour ?? 'var(--dim)'}" font-weight="${colour ? 700 : 500}"
        stroke="var(--bg)" stroke-width="0.55" paint-order="stroke">${label}</text>` : ''}`;

const frame = (uid, w, h, inner, caption) => `
  <figure class="fig">
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      ${defs(uid)}${inner}
    </svg>
    ${caption ? `<figcaption>${caption}</figcaption>` : ''}
  </figure>`;

// ---------------------------------------------------------------- figures

// The four depth states side by side. This is the game's core read and the
// rulebook previously described it in words only.
export function figDepths(T) {
  const anod = T.id === 'anod';
  const labels = anod
    ? ['malalim 3', '2', 'mababaw 1', 'barâ']
    : ['deep 3', '2', 'shallow 1', 'silted'];
  const notes = anod
    ? ['ligtas', 'mag-ingat', 'isa na lang', 'patáy na']
    : ['safe', 'careful', 'one trip left', 'dead for good'];
  // Horizontal segments, not vertical: a channel on the board is mostly a
  // horizontal run, and a wide sample shows the texture that a thin vertical
  // sliver cannot.
  const cols = [3, 2, 1, 0].map((d, i) => {
    const y = 7 + i * 11;
    return `
      <g>
        ${channel('dep', { x: 6, y }, { x: 46, y }, d, `depth${d}`, '', 0)}
        <text x="53" y="${y + 1}" font-size="3.4"
              fill="${depthColor(d)}" font-weight="700">${labels[i]}</text>
        <text x="53" y="${y + 4.6}" font-size="2.6"
              fill="var(--dim2)">${notes[i]}</text>
      </g>`;
  }).join('');
  return frame('dep', 100, 50, cols,
    anod ? 'Ang lalim ay makikita sa kapal at kulay.'
         : 'Depth reads by thickness and colour. Silted channels never come back.');
}

// What one shipment does: the route you used gets shallower.
export function figSilt(T) {
  const anod = T.id === 'anod';
  const A = { x: 14, y: 10 }, B = { x: 50, y: 20 }, C = { x: 86, y: 30 };
  const before = `
    <g>
      ${channel('sb', A, B, 3, 'r1')}${channel('sb', B, C, 3, 'r2')}
      ${node(A.x, A.y, { colour: 'var(--p0)' })}${node(B.x, B.y)}${node(C.x, C.y, { r: 3.6 })}
      <text x="50" y="42" text-anchor="middle" font-size="3" fill="var(--dim)">
        ${anod ? 'bago maglayág' : 'before shipping'}</text>
    </g>`;
  const after = `
    <g transform="translate(0,46)">
      ${channel('sb', A, B, 2, 'r1')}${channel('sb', B, C, 2, 'r2')}
      ${node(A.x, A.y, { colour: 'var(--p0)' })}${node(B.x, B.y)}${node(C.x, C.y, { r: 3.6 })}
      <text x="50" y="42" text-anchor="middle" font-size="3" fill="var(--warn)">
        ${anod ? 'pagkatapos — bumabaw ang dinaanan' : 'after — every channel you used drops 1'}</text>
    </g>`;
  return frame('sb', 100, 92, before + after,
    anod ? 'Bawat biyahe ay may bayad sa ilog.'
         : 'One shipment, one depth lost on every channel in the route.');
}

// Tolls: why dredging is an investment rather than charity.
export function figToll(T) {
  const anod = T.id === 'anod';
  const A = { x: 16, y: 20 }, B = { x: 84, y: 20 };
  const mid = { x: 50, y: 20 };
  const marker = `
    <circle cx="${mid.x}" cy="${mid.y}" r="2.4" fill="var(--p1)"
            stroke="rgba(20,16,10,.85)" stroke-width="0.5"/>`;
  return frame('tl', 100, 40, `
    ${channel('tl', A, B, 3, 'toll', marker)}
    ${node(A.x, A.y, { colour: 'var(--p0)', label: anod ? 'ikáw' : 'you' })}
    ${node(B.x, B.y, { r: 3.6 })}
    <text x="50" y="9" text-anchor="middle" font-size="3" fill="var(--p1)" font-weight="700">
      ${anod ? 'hinukay ni P2' : 'dredged by P2'}</text>
    <text x="50" y="35" text-anchor="middle" font-size="2.8" fill="var(--gold)">
      ${anod ? `−${TOLL} ginto sa bawat daán` : `you pay ${TOLL} gold to pass`}</text>
  `, anod ? 'Ang naghukay ang naniningil.'
          : 'The dot marks who owns a channel. Everyone else pays them to use it.');
}

// The chokepoint idea: some settlements have exactly one way to the sea.
export function figChoke(T) {
  const anod = T.id === 'anod';
  const S = { x: 18, y: 12 }, M = { x: 50, y: 26 }, E1 = { x: 82, y: 12 }, E2 = { x: 82, y: 40 };
  return frame('ch', 100, 54, `
    ${channel('ch', S, M, 3, 'c1')}
    ${channel('ch', M, E1, 1, 'c2')}
    ${channel('ch', M, E2, 0, 'c3')}
    ${node(S.x, S.y, { colour: 'var(--p0)', label: anod ? 'ikáw' : 'you' })}
    ${node(M.x, M.y)}
    ${node(E1.x, E1.y, { r: 3.6 })}${node(E2.x, E2.y, { r: 3.6 })}
    <text x="82" y="48" text-anchor="middle" font-size="2.6" fill="var(--bad)">
      ${anod ? 'sarado na' : 'closed'}</text>
  `, anod ? 'Kapag namatay ang huling daán, wala ka nang maiuuwi.'
          : 'When your last route to the sea dies, your goods are worth nothing.');
}
