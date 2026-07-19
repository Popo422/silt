import { NODES, MOUTHS, buildIndex, chKey, NODE_BY_ID } from './graph.js';

const { out } = buildIndex();

// 1. Every non-mouth node must reach a mouth. No dead ends.
function reachesMouth(id, seen = new Set()) {
  if (MOUTHS.includes(id)) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return out[id].some(n => reachesMouth(n, seen));
}
const dead = NODES.filter(n => !MOUTHS.includes(n.id) && !reachesMouth(n.id));
console.log('Dead-end nodes:', dead.length ? dead.map(n => n.id) : 'none ✓');

// 2. Path counts to a mouth — the "route around it" measure.
const memo = new Map();
function pathCount(id) {
  if (MOUTHS.includes(id)) return 1;
  if (memo.has(id)) return memo.get(id);
  const v = out[id].reduce((s, n) => s + pathCount(n), 0);
  memo.set(id, v);
  return v;
}
console.log('\nDistinct routes to sea:');
for (const n of NODES) {
  if (MOUTHS.includes(n.id)) continue;
  console.log(`  ${n.id.padEnd(3)} tier${n.tier}  ${pathCount(n.id)} routes`);
}

// 3. Chokepoints: how many source->sea routes cross each channel?
//    A channel carrying a large share of traffic is a real chokepoint.
const total = pathCount('S');
const load = {};
function walk(id, path) {
  if (MOUTHS.includes(id)) {
    for (const k of path) load[k] = (load[k] || 0) + 1;
    return;
  }
  for (const n of out[id]) walk(n, [...path, chKey(id, n)]);
}
walk('S', []);
const ranked = Object.entries(load).sort((a, b) => b[1] - a[1]);
console.log(`\nTotal S->sea routes: ${total}`);
console.log('Top chokepoints (share of all routes):');
for (const [k, v] of ranked.slice(0, 8)) {
  console.log(`  ${k.padEnd(8)} ${v.toString().padStart(4)}  ${(100 * v / total).toFixed(1)}%`);
}

// 4. Mouth access breadth — are the three mouths equally reachable?
console.log('\nRoutes terminating at each mouth:');
for (const m of MOUTHS) {
  let c = 0;
  const w = (id) => { if (id === m) { c++; return; } if (MOUTHS.includes(id)) return; out[id].forEach(w); };
  w('S');
  console.log(`  ${m}: ${c} (${(100 * c / total).toFixed(1)}%)`);
}

// 5. Good availability by tier — can a player near one mouth get all 3 types?
console.log('\nGoods reachable upstream of each mouth:');
const { inn } = buildIndex();
for (const m of MOUTHS) {
  const seen = new Set(), stack = [m];
  while (stack.length) {
    const id = stack.pop();
    for (const p of inn[id]) if (!seen.has(p)) { seen.add(p); stack.push(p); }
  }
  const goods = new Set([...seen].map(id => NODE_BY_ID[id].good).filter(Boolean));
  console.log(`  ${m}: ${[...goods].sort().join(', ')}  (${seen.size} upstream nodes)`);
}
