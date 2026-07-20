// SVG element helpers.
//
// Their own module so any renderer can use them without importing board.js and
// creating a dependency cycle back into it. These two functions belong to no
// renderer in particular — board.js, bays.js and diagrams.js all reach for them.

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
