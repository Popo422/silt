// SVG element helpers.
//
// Pulled out of board.js so frame.js can use them without importing board.js,
// which imports frame.js back. That cycle worked — ES modules resolve it — but a
// circular dependency is a trap for whoever edits next, and these two functions
// belong to neither renderer in particular.

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
