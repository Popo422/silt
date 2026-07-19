// The bay scoring track.
//
// Split out of board.js, which was over its line cap. It belongs apart: it reads
// only the delivery tallies and the scoring tiers, and it is the one part of the
// board that shows a STANDING rather than a state.
//
// This replaced a single combined number — "15 delivered" — which is a
// scoreboard readout, not a game component. It said nothing about who led the
// bay or what leading was worth, so bay majority (the largest scoring block
// after contracts) stayed invisible until the final table announced it.
//
// A printed board would show a majority ladder. This is that: one pip per player
// in seat colour, tallest first, with the VP tier printed beside it, so you can
// see whether a bay is contested and whether one more shipment would flip it.

import { TUNING } from './engine.js';
import { el } from './svg.js';

export function drawBayTrack({ grp, n, g, PC, HUMAN, T, nodeLabel }) {
  const tallies = g.players.map((p, i) => ({
    i,
    n: p.delivered[n.id].timber + p.delivered[n.id].grain + p.delivered[n.id].salt,
  })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);

  if (!tallies.length) return;

  const track = el('g', { class: 'bayTrack' });
  // Below the place label, which sits at y+6.6 — at y+7.4 the first row
  // sat straight through it.
  const top = n.y + 10.2;
  tallies.slice(0, 3).forEach((t, rank) => {
    const y = top + rank * 3.0;
    // Ties share, so rank by VALUE not position — two players level on
    // goods both sit at the higher tier, exactly as score() computes it.
    const tier = tallies.findIndex(x => x.n === t.n);
    track.appendChild(el('rect', {
      x: n.x - 6.4, y: y - 1.3, width: 12.8, height: 2.6, rx: 1.3,
      fill: 'rgba(24,19,12,.62)',
    }));
    track.appendChild(el('circle', {
      cx: n.x - 4.6, cy: y, r: 0.9, fill: PC[t.i],
      stroke: t.i === HUMAN ? 'rgba(255,248,230,.95)' : 'none',
      'stroke-width': 0.3,
    }));
    const txt = el('text', {
      x: n.x + 4.9, y: y + 0.72, 'text-anchor': 'end',
      'font-size': 1.85, fill: 'rgba(255,238,205,.78)', 'font-weight': 600,
    });
    txt.textContent = `${t.n} → ${TUNING.mouthVP[tier] ?? 0}`;
    track.appendChild(txt);
  });
  track.setAttribute('data-tip-title', `${nodeLabel(T, n.id)} — who leads`);
  track.setAttribute('data-tip',
    `Goods delivered into this bay, most first. At the end it scores `
    + `${TUNING.mouthVP.join(' / ')} points for first, second and third. `
    + `Ties share, rounded down.`);
  grp.appendChild(track);
}
