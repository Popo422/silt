// The printed edge of the board: border, title cartouche, compass.
//
// Split out of board.js, which was over its line cap. It belongs apart anyway:
// nothing here reads game state. It takes the theme and draws the same marks
// every frame, which is exactly what a printed board edge is.

import { el } from './svg.js';

// The printed edge of the board.
//
// The map used to bleed to the viewport edge, which is the single clearest tell
// that this is a web page rather than a board: real boards have a border, and
// the border is where the title lives. Drawn in board coordinates rather than as
// CSS on the container, so it pans and zooms WITH the map — a frame that stayed
// welded to the window would read as chrome, not as part of the printed sheet.
//
// Sits behind everything: appended before the channels, and takes no pointer
// events, so it can never intercept a click meant for the water.
export function drawFrame(svg, T) {
  const X0 = -4.5, Y0 = -4.5, W = 109, H = 109;
  const f = el('g', { class: 'frame', 'pointer-events': 'none' });

  // Outer plate: the paper the map is printed on.
  f.appendChild(el('rect', {
    x: X0, y: Y0, width: W, height: H, rx: 2.2,
    fill: 'none', stroke: 'rgba(58,46,30,.55)', 'stroke-width': 1.5,
  }));
  // Inner keyline, the thin rule a printed board has just inside its edge.
  f.appendChild(el('rect', {
    x: X0 + 2.4, y: Y0 + 2.4, width: W - 4.8, height: H - 4.8, rx: 1.2,
    fill: 'none', stroke: 'rgba(255,238,205,.20)', 'stroke-width': 0.35,
  }));

  // Title cartouche, bottom-left: far from the delta, which fans out top-centre.
  // Kept narrow — at 28 wide it reached under L1's channel and read as a bar
  // across the map rather than a label printed on the margin.
  const cx = X0 + 12.5, cy = Y0 + H - 4.6;
  f.appendChild(el('rect', {
    x: cx - 9.5, y: cy - 2.6, width: 19, height: 5.2, rx: 2.6,
    fill: 'rgba(30,24,15,.55)', stroke: 'rgba(255,238,205,.22)', 'stroke-width': 0.3,
  }));
  const title = el('text', {
    x: cx, y: cy + 0.95, 'text-anchor': 'middle',
    'font-size': 2.6, fill: 'rgba(255,238,205,.62)',
    'letter-spacing': 0.7, 'font-weight': 600,
  });
  title.textContent = T.id === 'anod' ? 'ANOD' : 'SILT';
  f.appendChild(title);

  // Compass, bottom-right. Water runs top to bottom on this map, so north is up
  // and the needle is telling the truth rather than decorating.
  const nx = X0 + W - 8, ny = Y0 + H - 8;
  f.appendChild(el('circle', {
    cx: nx, cy: ny, r: 3.4, fill: 'none',
    stroke: 'rgba(255,238,205,.20)', 'stroke-width': 0.3,
  }));
  f.appendChild(el('path', {
    d: `M${nx},${ny - 2.6}L${nx + 1.05},${ny + 0.5}L${nx},${ny - 0.35}`
     + `L${nx - 1.05},${ny + 0.5}Z`,
    fill: 'rgba(255,238,205,.42)',
  }));
  const n = el('text', {
    x: nx, y: ny + 2.9, 'text-anchor': 'middle',
    'font-size': 1.9, fill: 'rgba(255,238,205,.42)', 'font-weight': 600,
  });
  n.textContent = 'N';
  f.appendChild(n);

  svg.appendChild(f);
}

