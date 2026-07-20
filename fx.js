// Visual effects layer.
//
// WHY THIS EXISTS: the whole round used to resolve inside one synchronous while
// loop, so every bot acted and the board repainted exactly once at the end. You
// could not see a boat run a route, a toll get taken, or a channel choke — the
// board was a spreadsheet that redrew. Numbers changed; nothing *happened*.
//
// This module turns engine events into things you can watch. It owns no rules and
// reads no game state: it is handed an event, it draws, it cleans up after itself.
//
// ARCHITECTURE NOTE: drawBoard() calls svg.innerHTML = '' on every render, which
// would destroy any animation mid-flight. So effects render into a SEPARATE <svg>
// stacked on top, which nothing else ever clears. That overlay shares the exact
// same viewBox, so board coordinates can be used directly with no transform math.

const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => {
  const e = document.createElementNS(NS, t);
  for (const [k, v] of Object.entries(a)) if (v != null) e.setAttribute(k, v);
  return e;
};

// Respect the OS setting. Someone who gets motion sick should still be able to
// read the board — effects degrade to a brief static flash, never to nothing,
// because the information itself matters.
const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createFX(overlay, opts = {}) {
  const PC = opts.colors ?? [];
  const nodeAt = opts.nodeAt;          // (id) -> {x, y}
  let enabled = true;
  const live = new Set();

  const add = (node, ms) => {
    overlay.appendChild(node);
    live.add(node);
    const done = () => { node.remove(); live.delete(node); };
    // Belt and braces: animationend can be missed if the tab is backgrounded,
    // and orphaned nodes would accumulate over an 8-round game.
    node.addEventListener('animationend', done, { once: true });
    setTimeout(done, ms + 400);
    return node;
  };

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Effects stop at the node edge for the same reason the channels do: a stroke
  // running to the centre draws a visible X through a semi-transparent node.
  const radiusOf = opts.radiusOf ?? (() => 0);
  const ends = (k) => {
    const [a, b] = k.split('>');
    const A = nodeAt(a), B = nodeAt(b);
    if (!A || !B) return null;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const rA = radiusOf(a), rB = radiusOf(b);
    return [
      { x: A.x + ux * rA, y: A.y + uy * rA },
      { x: B.x - ux * rB, y: B.y - uy * rB },
    ];
  };

  // A short-lived label that floats up and fades. The workhorse: it is how coins,
  // points and warnings get attached to the place on the board they came from.
  function float(x, y, text, cls = '', delay = 0) {
    const t = el('text', {
      x, y, class: `fxFloat ${cls}`, 'text-anchor': 'middle',
      style: delay ? `animation-delay:${delay}ms` : null,
    });
    t.textContent = text;
    return add(t, 1400 + delay);
  }

  // Trace a path channel by channel so the eye follows the direction of travel.
  function tracePath(path, color, dur = 260) {
    let t = 0;
    for (const k of path) {
      const e = ends(k);
      if (!e) continue;
      const [A, B] = e;
      add(el('line', {
        x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: color,
        'stroke-width': 1.1, 'stroke-linecap': 'round', class: 'fxWake',
        style: `animation-delay:${t}ms;animation-duration:${dur}ms`,
      }), t + dur);
      t += dur * 0.55;   // overlap slightly: reads as one continuous run
    }
    return t;
  }

  // The boat itself. Without a moving object the route reads as a highlight
  // rather than a journey, which is the whole difference the user asked for.
  function boat(path, color) {
    const pts = [];
    for (const k of path) {
      const e = ends(k);
      if (!e) continue;
      if (!pts.length) pts.push(e[0]);
      pts.push(e[1]);
    }
    if (pts.length < 2) return 0;

    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
    const guide = el('path', { d, fill: 'none', stroke: 'none' });
    overlay.appendChild(guide);
    // Kept short on purpose: the boat is a cue, not a cutscene. A 1.5s traversal
    // felt cinematic once and tedious by round three.
    const len = guide.getTotalLength();
    const dur = Math.min(760, 260 + len * 11);

    const hull = el('g', { class: 'fxBoat' });
    hull.appendChild(el('circle', { r: 1.15, fill: color, stroke: 'var(--bg)', 'stroke-width': 0.3 }));
    const mv = el('animateMotion', {
      dur: `${dur}ms`, path: d, rotate: 'auto', fill: 'freeze', repeatCount: '1',
    });
    hull.appendChild(mv);
    add(hull, dur);
    guide.remove();
    mv.beginElement?.();
    return dur;
  }

  const api = {
    setEnabled(v) { enabled = v; },
    get enabled() { return enabled; },

    clear() { for (const n of live) n.remove(); live.clear(); },

    // Returns roughly how long the effect runs, so the caller can pace the round.
    play(ev) {
      if (!enabled) return 0;
      const color = PC[ev.pi] ?? 'var(--gold)';
      const soft = reduced();

      switch (ev.type) {
        case 'ship': {
          const dur = soft ? 0 : boat(ev.path, color);
          if (!soft) tracePath(ev.path, color);
          const m = nodeAt(ev.mouth);
          if (m) float(m.x, m.y - 5, `+${ev.pay}`, 'fxCoin', soft ? 0 : dur);
          // Tolls float at the channel where they were levied, in the colour of
          // whoever collected — you can see exactly who taxed you and where.
          for (const t of ev.tolls ?? []) {
            const e = ends(t.channel);
            if (!e) continue;
            const p = mid(e[0], e[1]);
            float(p.x, p.y, `−${t.amount}`, 'fxToll', soft ? 0 : 220);
            const dot = el('circle', {
              cx: p.x, cy: p.y, r: 1.6, fill: 'none',
              stroke: PC[t.to] ?? 'var(--gold)', 'stroke-width': 0.4, class: 'fxRing',
            });
            add(dot, 900);
          }
          return soft ? 500 : dur + 250;
        }

        case 'blocked': {
          // The instructive failure: show the dead reach, not just a log line.
          const e = ends(ev.at);
          if (e) {
            const [A, B] = e;
            add(el('line', {
              x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: 'var(--bad)',
              'stroke-width': 1.3, 'stroke-linecap': 'round', class: 'fxBlock',
            }), 900);
            const p = mid(A, B);
            float(p.x, p.y, 'blocked', 'fxBad');
          }
          return 900;
        }

        case 'dredge': {
          const e = ends(ev.channel);
          if (!e) return 0;
          const [A, B] = e;
          add(el('line', {
            x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: 'var(--gold)',
            'stroke-width': 1.5, 'stroke-linecap': 'round', class: 'fxDredge',
          }), 950);
          const p = mid(A, B);
          float(p.x, p.y, `${ev.from}→${ev.to}`, 'fxGood');
          if (ev.claimed) {
            add(el('circle', {
              cx: p.x, cy: p.y, r: 1.7, fill: 'none', stroke: color,
              'stroke-width': 0.45, class: 'fxRing',
            }), 900);
          }
          return 800;
        }

        case 'silt': {
          // One sweep for the whole delta — the moment the game is named for.
          let t = 0;
          for (const d of ev.dropped ?? []) {
            const e = ends(d.channel);
            if (!e) continue;
            const [A, B] = e;
            const dead = d.to === 0;
            add(el('line', {
              x1: A.x, y1: A.y, x2: B.x, y2: B.y,
              stroke: dead ? 'var(--bad)' : 'var(--silt)',
              'stroke-width': dead ? 1.4 : 1.0, 'stroke-linecap': 'round',
              class: dead ? 'fxDie' : 'fxSilt',
              style: `animation-delay:${t}ms`,
            }), t + 1000);
            if (dead) {
              const p = mid(A, B);
              float(p.x, p.y, 'silted', 'fxBad', t + 120);
            }
            // Ripple rather than flash, but tightly: up to 17 channels silt in a
            // round, so a generous per-channel stagger turns into a long wait.
            t += 26;
          }
          return t + 320;
        }

        case 'build': {
          const n = nodeAt(ev.node);
          if (!n) return 0;
          add(el('circle', {
            cx: n.x, cy: n.y, r: 3.3, fill: 'none', stroke: color,
            'stroke-width': 0.6, class: 'fxRing',
          }), 900);
          float(n.x, n.y - 5, `−${ev.cost}`, 'fxSpend');
          return 650;
        }

        case 'lakbay': {
          // Walk the Datu across the delta, node by node, then plant it. The whole
          // point the user asked for: you SEE the chief journey to open ground, not
          // just teleport. The path is node ids from just after `from` to the
          // destination; prepend `from` for the full walk.
          const seq = [ev.from, ...(ev.path ?? [])].map(nodeAt).filter(Boolean);
          const dest = nodeAt(ev.to);
          if (seq.length < 2 || !dest) {
            if (dest) float(dest.x, dest.y - 5, `−${ev.cost}`, 'fxSpend');
            return 650;
          }
          if (soft) {
            // Reduced motion: no walk, just mark the settle.
            add(el('circle', { cx: dest.x, cy: dest.y, r: 3.3, fill: 'none',
              stroke: color, 'stroke-width': 0.6, class: 'fxRing' }), 900);
            float(dest.x, dest.y - 5, `−${ev.cost}`, 'fxSpend');
            return 600;
          }
          const d = seq.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
          const guide = el('path', { d, fill: 'none', stroke: 'none' });
          overlay.appendChild(guide);
          const len = guide.getTotalLength();
          guide.remove();
          // A step per node, paced so a longer journey visibly takes longer — the
          // distance you are paying for is the distance you watch the chief walk.
          const dur = Math.min(1500, 380 + len * 16);
          // Faint dashed trail so the route the chief takes is legible.
          add(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 0.5,
            'stroke-dasharray': '1.2 1', opacity: 0.7, class: 'fxWake',
            style: `animation-duration:${dur}ms` }), dur + 200);
          // The walking meeple: a little pawn following the path.
          const pawn = el('g', { class: 'fxDatu' });
          pawn.appendChild(el('circle', { r: 0.85, cy: -1.1, fill: color,
            stroke: 'var(--bg)', 'stroke-width': 0.25 }));
          pawn.appendChild(el('path', {
            d: 'M 0 -1.5 C 1.1 -1.5 1.1 0.4 0 1.3 C -1.1 0.4 -1.1 -1.5 0 -1.5 Z',
            fill: color, stroke: 'var(--bg)', 'stroke-width': 0.25 }));
          const mv = el('animateMotion', {
            dur: `${dur}ms`, path: d, rotate: '0', fill: 'freeze', repeatCount: '1',
          });
          pawn.appendChild(mv);
          add(pawn, dur + 100);
          mv.beginElement?.();
          // Settle ring + cost float land as the chief arrives.
          add(el('circle', { cx: dest.x, cy: dest.y, r: 3.3, fill: 'none',
            stroke: color, 'stroke-width': 0.6, class: 'fxRing',
            style: `animation-delay:${dur}ms` }), dur + 900);
          float(dest.x, dest.y - 5, `−${ev.cost}`, 'fxSpend', dur);
          return dur + 300;
        }

        case 'contract': {
          const m = nodeAt(ev.mouth);
          if (!m) return 0;
          float(m.x, m.y - 8, `+${ev.vp} vp`, 'fxVp');
          add(el('circle', {
            cx: m.x, cy: m.y, r: 4.2, fill: 'none', stroke: 'var(--gold)',
            'stroke-width': 0.7, class: 'fxRing',
          }), 900);
          return 700;
        }

        case 'abandon': {
          const n = nodeAt(ev.node);
          if (!n) return 0;
          float(n.x, n.y - 5, 'abandoned', 'fxBad');
          add(el('circle', {
            cx: n.x, cy: n.y, r: 3.3, fill: 'none', stroke: 'var(--bad)',
            'stroke-width': 0.6, class: 'fxFade',
          }), 900);
          return 700;
        }

        default:
          return 0;
      }
    },
  };
  return api;
}
