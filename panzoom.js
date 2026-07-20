// Pan and zoom for an SVG board.
//
// Drives the viewBox rather than a CSS transform, so the SVG's own units stay the
// coordinate system: hit targets, effects and getPointAtLength all keep working
// with no unprojection. A CSS scale would force every one of those to convert
// through the transform.
//
// No library — this is a viewBox and a few pointer handlers. d3-zoom would be
// larger than the feature.
//
// Knows nothing about the game. The two places it needs game state (don't pan
// while aiming an action; don't steal keys while the rulebook is open) are
// injected as predicates, so this file never imports from ui.js and the
// dependency runs one way only.

export function createPanZoom({
  svg,                       // the element whose viewBox we drive
  mirrors = [],              // elements whose viewBox must track it exactly
  home,                      // {x,y,w,h} starting view
  min = 0.55, max = 4,
  buttons = {},              // {in, out, fit} elements, optional
  canPan = () => true,       // false while aiming: the resolving click must land
  canKey = () => true,       // false when a modal owns the keyboard
  onDragEnd = () => {},      // called with true if the pointer actually moved
}) {
  const view = { ...home };

  const apply = () => {
    const vb = `${view.x} ${view.y} ${view.w} ${view.h}`;
    svg.setAttribute('viewBox', vb);
    // Mirrors must track exactly or an overlay's contents land in the wrong place
    // the moment you pan — a boat would sail somewhere the board is not.
    for (const m of mirrors) m?.setAttribute('viewBox', vb);
  };

  // Zoom about a fixed point so the board grows toward the cursor rather than the
  // corner; zooming to centre while you are looking at an edge is disorienting.
  const zoomAt = (factor, cx, cy) => {
    const scale = home.w / view.w;
    const next = Math.min(max, Math.max(min, scale * factor));
    const nw = home.w / next, nh = home.h / next;
    view.x = cx - (cx - view.x) * (nw / view.w);
    view.y = cy - (cy - view.y) * (nh / view.h);
    view.w = nw; view.h = nh;
    apply();
  };

  // Client point -> board units, so wheel zoom tracks the cursor.
  const toBoard = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    // preserveAspectRatio=meet letterboxes the viewBox; find the real drawn area.
    const scale = Math.min(r.width / view.w, r.height / view.h);
    const dw = view.w * scale, dh = view.h * scale;
    const ox = r.left + (r.width - dw) / 2, oy = r.top + (r.height - dh) / 2;
    return { x: view.x + (clientX - ox) / scale, y: view.y + (clientY - oy) / scale };
  };

  const centre = () => [view.x + view.w / 2, view.y + view.h / 2];
  // Fit the home view to the container's aspect so a portrait phone fills vertically
  // instead of letterboxing the padded square viewBox into a thin strip. `content`
  // is the tight bounds of the actual delta; we frame it to the container aspect,
  // growing the shorter axis so the whole delta stays visible with minimal margin.
  // Falls back to the padded `home` box when the container has not been laid out.
  const reset = () => { Object.assign(view, home); apply(); };

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = toBoard(e.clientX, e.clientY);
    zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, p.x, p.y);
  }, { passive: false });

  let drag = null;
  // Live pointers, so a second finger switches drag into a two-finger pinch. On a
  // phone the board is small and a specific channel is hard to hit — pinch-to-zoom
  // is how you get close enough to tap one.
  const pts = new Map();
  let pinch = null;   // { dist, cx, cy } in client px, captured when the 2nd finger lands

  const pinchStart = () => {
    const [a, b] = [...pts.values()];
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
    };
    drag = null;                       // a pan-in-progress yields to the pinch
    svg.classList.remove('dragging');
    onDragEnd(true);                   // suppress the click a lifted finger would fire
  };

  svg.addEventListener('pointerdown', (e) => {
    if (!canPan()) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { pinchStart(); return; }
    if (e.button !== 0) return;
    // Do NOT capture the pointer yet. Capturing on press redirects the following
    // `click` to the svg itself, so a plain click on a target no longer lands on
    // the target — which broke target picking once pan was allowed while aiming.
    // Capture is deferred to the first real move (below), so a stationary click
    // stays a click and only an actual drag becomes a pan.
    drag = { id: e.pointerId, from: toBoard(e.clientX, e.clientY), moved: false };
  });
  svg.addEventListener('pointermove', (e) => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Two fingers down: zoom by the change in finger distance, about their midpoint.
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const p = toBoard(cx, cy);
      zoomAt(dist / pinch.dist, p.x, p.y);
      pinch.dist = dist;
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = toBoard(e.clientX, e.clientY);
    const dx = p.x - drag.from.x, dy = p.y - drag.from.y;
    // Small threshold so a slightly shaky click is still a click.
    if (!drag.moved && Math.hypot(dx, dy) > 0.8) {
      drag.moved = true;
      svg.setPointerCapture(e.pointerId);   // now it is a drag: capture for smooth pan
      svg.classList.add('dragging');
    }
    if (!drag.moved) return;
    view.x -= dx; view.y -= dy;
    apply();
  });
  const endDrag = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;    // dropped below two fingers: pinch is over
    if (!drag || e.pointerId !== drag.id) return;
    svg.classList.remove('dragging');
    // A pan ends in a click on whatever is under the cursor. The caller needs to
    // know so it can swallow that click rather than treat it as a target pick.
    onDragEnd(drag.moved);
    drag = null;
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  buttons.in?.addEventListener('click', () => zoomAt(1.25, ...centre()));
  buttons.out?.addEventListener('click', () => zoomAt(1 / 1.25, ...centre()));
  buttons.fit?.addEventListener('click', reset);

  document.addEventListener('keydown', (e) => {
    if (!canKey() || e.target.tagName === 'SELECT') return;
    if (e.key === '+' || e.key === '=') zoomAt(1.25, ...centre());
    else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.25, ...centre());
    else if (e.key === '0') reset();
    else if (e.key.startsWith('Arrow')) {
      const step = view.w * 0.12;
      if (e.key === 'ArrowLeft') view.x -= step;
      if (e.key === 'ArrowRight') view.x += step;
      if (e.key === 'ArrowUp') view.y -= step;
      if (e.key === 'ArrowDown') view.y += step;
      apply();
      e.preventDefault();
    }
  });

  apply();
  return { reset, zoomAt, toBoard, view: () => ({ ...view }) };
}
