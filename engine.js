// SILT — rules engine. Pure state transitions, no rendering.
import { NODES, CHANNELS, MOUTHS, GOODS, buildIndex, chKey, NODE_BY_ID } from './graph.js';

export const TUNING = {
  rounds: 8,
  startCoins: 8,
  cubesPerNode: 4,          // was 3 — board went dry by R5
  regrowPerRound: 1,        // NEW: one upstream node refills each round
  freeStations: 4,          // was 3 — upkeep was evicting stations, networks shrank
  upkeepPerStation: 1,
  buildBase: 1,             // was 2 — Build was strictly worse than Ship
  buildCubeBonus: 2,        // NEW: a new station arrives with 2 cubes already on it
  shipCubesMax: 2,
  shipPerCube: 2,
  shipPerChannel: 1,
  surveyCoins: 3,           // was 4
  surveyDraw: 3,            // NEW: see 3 keep 1 — makes Survey a real option
  dredgeAmount: 1,          // was 2 — one dredge undid two ships; silt never accrued
  dredgeCoins: 1,           // NEW: dredging costs money, so it's a genuine trade
  maxDepth: 3,
  collisionPayout: 3,
  handLimit: 4,
  vpPerCoins: 5,
  mouthVP: [8, 4, 1],       // was 6/3/1 — raise the contested-delivery stakes
  vpPerStation: 0,          // raw disc count shouldn't score; only working routes do
  vpLiveStation: 2,         // a station that still reaches the sea is the reward
  liveDepthMin: 2,
  siltedPenaltyVP: 1,       // NEW: -1vp per SILTED channel adjacent to your stations
};

export const ACTIONS = ['dredge', 'build', 'ship', 'survey'];

// Values raised: contracts must be ~45% of a winning score, not 22%.
const CONTRACT_POOL = [
  ...Array(12).fill(null).map((_, i) => ({ kind: 'local',    vp: 5,  need: 2, types: 1, mouth: null, id: `L${i}` })),
  ...Array(12).fill(null).map((_, i) => ({ kind: 'regional', vp: 9,  need: 3, types: 2, mouth: MOUTHS[i % 3], id: `R${i}` })),
  ...Array(6).fill(null).map((_, i)  => ({ kind: 'delta',    vp: 15, need: 4, types: 3, mouth: MOUTHS[i % 3], id: `D${i}` })),
];

// Deterministic RNG so playtests are reproducible.
// mulberry32 with a splitmix-style seed scramble: plain xorshift on small seeds
// gave neighbouring seeds identical streams, which silently made "different"
// simulated games identical.
export function rng(seed) {
  let s = (seed >>> 0) + 0x9e3779b9;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad); s >>>= 0;
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97); s >>>= 0;
  s ^= s >>> 15;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newGame(playerCount = 3, seed = 12345) {
  const rand = rng(seed);
  const { out, inn } = buildIndex();

  const depth = {};
  for (const [a, b] of CHANNELS) depth[chKey(a, b)] = TUNING.maxDepth;

  const cubes = {};
  for (const n of NODES) cubes[n.id] = MOUTHS.includes(n.id) ? 0 : TUNING.cubesPerNode;

  const deck = shuffle(CONTRACT_POOL, rand);

  const midTier = NODES.filter(n => n.tier === 3).map(n => n.id);
  const players = [];
  for (let i = 0; i < playerCount; i++) {
    players.push({
      idx: i,
      name: `P${i + 1}`,
      coins: TUNING.startCoins,
      stations: [],
      contracts: [deck.pop(), deck.pop()],
      done: [],
      delivered: {},           // mouth -> {timber,grain,salt} — permanent, scores majorities
      pool: {},                // mouth -> {timber,grain,salt} — spendable on contracts
      program: [null, null],
    });
  }
  // Reverse seat order placement, spread across mid tier.
  for (let i = playerCount - 1; i >= 0; i--) {
    players[i].stations.push(midTier[(i * 2) % midTier.length]);
  }
  for (const m of MOUTHS) for (const p of players) {
    p.delivered[m] = { timber: 0, grain: 0, salt: 0 };
    p.pool[m]      = { timber: 0, grain: 0, salt: 0 };
  }

  return {
    round: 1, phase: 'program', slot: 0, firstPlayer: 0,
    depth, cubes, players, deck, out, inn,
    log: [], shippedThisRound: new Set(), seed, rand,
  };
}

export const buildCost = (p) => TUNING.buildBase + p.stations.length;

export function seatOrder(g) {
  return g.players.map((_, i) => (g.firstPlayer + i) % g.players.length);
}

// --- Legality -------------------------------------------------------------

export function buildTargets(g, p) {
  const set = new Set();
  const owned = new Set(g.players.flatMap(x => x.stations));
  for (const s of p.stations) {
    for (const n of g.out[s])  if (!owned.has(n) && g.depth[chKey(s, n)] > 0) set.add(n);
    for (const n of g.inn[s])  if (!owned.has(n) && g.depth[chKey(n, s)] > 0) set.add(n);
  }
  return [...set].filter(id => !MOUTHS.includes(id));
}

export function dredgeTargets(g) {
  return Object.keys(g.depth).filter(k => g.depth[k] > 0 && g.depth[k] < TUNING.maxDepth);
}

// All navigable paths from a station to any mouth. Returns [{mouth, path:[chKey], hops}]
export function shipRoutes(g, from) {
  const results = [];
  const walk = (id, path, seen) => {
    if (MOUTHS.includes(id)) { results.push({ mouth: id, path, hops: path.length }); return; }
    if (path.length > 6) return;
    for (const n of g.out[id]) {
      const k = chKey(id, n);
      if (g.depth[k] < 1 || seen.has(n)) continue;
      walk(n, [...path, k], new Set([...seen, n]));
    }
  };
  walk(from, [], new Set([from]));
  return results;
}

export function shipOptions(g, p) {
  const opts = [];
  for (const s of p.stations) {
    if (g.cubes[s] <= 0) continue;
    for (const r of shipRoutes(g, s)) {
      const n = Math.min(TUNING.shipCubesMax, g.cubes[s]);
      opts.push({
        from: s, good: NODE_BY_ID[s].good, mouth: r.mouth, path: r.path,
        cubes: n, payout: n * TUNING.shipPerCube + r.hops * TUNING.shipPerChannel,
      });
    }
  }
  return opts;
}

// --- Resolution -----------------------------------------------------------

// Returns the mouth that satisfies `c` using p's UNSPENT delivered cubes, else null.
// Cubes are consumed on fulfilment so one delivery can't pay for two contracts.
function contractMatch(p, c) {
  const check = (m) => {
    const d = p.pool[m];
    const tot = GOODS.reduce((s, gd) => s + d[gd], 0);
    const kinds = GOODS.filter(gd => d[gd] > 0).length;
    if (c.types === 1) {
      // needs `need` cubes of a SINGLE type
      return GOODS.some(gd => d[gd] >= c.need) ? m : null;
    }
    return (tot >= c.need && kinds >= c.types) ? m : null;
  };
  if (c.mouth) return check(c.mouth);
  for (const m of MOUTHS) { if (check(m)) return m; }
  return null;
}

function consume(p, c, m) {
  const d = p.pool[m];
  if (c.types === 1) {
    const gd = GOODS.find(x => d[x] >= c.need);
    d[gd] -= c.need;
    return;
  }
  // Take one of each distinct type first (to honour `types`), then any.
  let left = c.need;
  const used = GOODS.filter(gd => d[gd] > 0).slice(0, c.types);
  for (const gd of used) { d[gd] -= 1; left--; }
  for (const gd of GOODS) { while (left > 0 && d[gd] > 0) { d[gd] -= 1; left--; } }
}

function tryContracts(g, p) {
  let again = true;
  while (again) {
    again = false;
    // Fulfil highest-value first when several are possible.
    const order = p.contracts.map((c, i) => [c, i]).sort((a, b) => b[0].vp - a[0].vp);
    for (const [c, i] of order) {
      const m = contractMatch(p, c);
      if (m) {
        consume(p, c, m);
        p.done.push(c);
        p.contracts.splice(i, 1);
        g.log.push(`${p.name} fulfils ${c.kind} at ${m} (+${c.vp}vp)`);
        again = true;
        break;
      }
    }
  }
}

// Execute one player's action for the current slot.
// `choice` is a UI/AI-supplied selection: {node} | {channel} | {ship option index}
export function execute(g, pi, action, choice, claimed) {
  const p = g.players[pi];
  switch (action) {
    case 'dredge': {
      const k = choice?.channel;
      if (!k || g.depth[k] <= 0 || g.depth[k] >= TUNING.maxDepth) { g.log.push(`${p.name} dredge fizzles`); return; }
      if (p.coins < TUNING.dredgeCoins) { g.log.push(`${p.name} cannot afford dredge`); return; }
      p.coins -= TUNING.dredgeCoins;
      g.depth[k] = Math.min(TUNING.maxDepth, g.depth[k] + TUNING.dredgeAmount);
      g.log.push(`${p.name} dredges ${k} to ${g.depth[k]} (-${TUNING.dredgeCoins}c)`);
      break;
    }
    case 'build': {
      const node = choice?.node;
      const cost = buildCost(p);
      if (!node) { g.log.push(`${p.name} build fizzles`); return; }
      if (claimed.has(node)) {
        p.coins += TUNING.collisionPayout;
        g.log.push(`${p.name} blocked at ${node} — takes ${TUNING.collisionPayout}c`);
        return;
      }
      if (p.coins < cost || !buildTargets(g, p).includes(node)) { g.log.push(`${p.name} cannot build ${node}`); return; }
      p.coins -= cost; p.stations.push(node); claimed.add(node);
      // A station develops its node: it brings cubes online.
      g.cubes[node] = Math.min(TUNING.cubesPerNode, g.cubes[node] + TUNING.buildCubeBonus);
      g.log.push(`${p.name} builds ${node} (-${cost}c, node now ${g.cubes[node]} cubes)`);
      break;
    }
    case 'ship': {
      const o = choice?.option;
      if (!o || g.cubes[o.from] <= 0) { g.log.push(`${p.name} ship fizzles`); return; }
      if (o.path.some(k => g.depth[k] < 1)) { g.log.push(`${p.name} route silted — ship fails`); return; }
      const n = Math.min(o.cubes, g.cubes[o.from]);
      g.cubes[o.from] -= n;
      p.delivered[o.mouth][o.good] += n;
      p.pool[o.mouth][o.good] += n;
      const pay = n * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel;
      p.coins += pay;
      o.path.forEach(k => g.shippedThisRound.add(k));
      g.log.push(`${p.name} ships ${n} ${o.good} -> ${o.mouth} (+${pay}c)`);
      tryContracts(g, p);
      break;
    }
    case 'survey': {
      p.coins += TUNING.surveyCoins;
      const drawn = Array.from({ length: TUNING.surveyDraw }, () => g.deck.pop()).filter(Boolean);
      if (drawn.length) {
        const keep = choice?.contract ?? drawn.slice().sort((a, b) => b.vp - a.vp)[0];
        if (p.contracts.length < TUNING.handLimit) p.contracts.push(keep);
        for (const c of drawn) if (c !== keep) g.deck.unshift(c);
      }
      g.log.push(`${p.name} surveys (+${TUNING.surveyCoins}c)`);
      break;
    }
  }
}

export function siltPhase(g) {
  let n = 0;
  for (const k of g.shippedThisRound) {
    if (g.depth[k] > 0) { g.depth[k] -= 1; n++; }
  }
  g.log.push(`Silt: ${n} channels drop`);
  const gone = Object.entries(g.depth).filter(([, v]) => v === 0).length;
  if (gone) g.log.push(`  ${gone} channel(s) SILTED total`);
  g.shippedThisRound = new Set();
}

// The delta keeps producing, slowly. Refills the emptiest non-mouth nodes so the
// board can't go globally dry mid-game (observed dead round at R5 pre-fix).
export function regrowPhase(g) {
  const pool = NODES.filter(n => !MOUTHS.includes(n.id) && g.cubes[n.id] < TUNING.cubesPerNode)
    .sort((a, b) => g.cubes[a.id] - g.cubes[b.id]);
  for (let i = 0; i < TUNING.regrowPerRound && i < pool.length; i++) {
    g.cubes[pool[i].id] += 1;
    g.log.push(`${pool[i].id} regrows a cube`);
  }
}

export function upkeepPhase(g) {
  for (const p of g.players) {
    let due = Math.max(0, p.stations.length - TUNING.freeStations) * TUNING.upkeepPerStation;
    while (due > p.coins && p.stations.length) { p.stations.pop(); due -= TUNING.upkeepPerStation; g.log.push(`${p.name} abandons a station`); }
    p.coins -= Math.min(due, p.coins);
    if (due > 0) g.log.push(`${p.name} pays ${due}c upkeep`);
  }
  g.firstPlayer = (g.firstPlayer + 1) % g.players.length;
}

// --- Scoring --------------------------------------------------------------

export function canReachMouth(g, from, minDepth) {
  const seen = new Set([from]), stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (MOUTHS.includes(id)) return true;
    for (const n of g.out[id]) {
      if (g.depth[chKey(id, n)] >= minDepth && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return false;
}

export function score(g) {
  return g.players.map(p => {
    const contracts = p.done.reduce((s, c) => s + c.vp, 0);
    let mouth = 0;
    for (const m of MOUTHS) {
      const tally = g.players.map(x => GOODS.reduce((s, gd) => s + x.delivered[m][gd], 0));
      const mine = tally[p.idx];
      if (mine === 0) continue;
      const sorted = [...new Set(tally)].sort((a, b) => b - a);
      const rank = sorted.indexOf(mine);
      const shared = tally.filter(t => t === mine).length;
      if (rank < 3) mouth += Math.floor(TUNING.mouthVP[rank] / shared);
    }
    const live = p.stations.filter(s => canReachMouth(g, s, TUNING.liveDepthMin)).length;
    const network = p.stations.length * TUNING.vpPerStation + live * TUNING.vpLiveStation;
    const coin = Math.floor(p.coins / TUNING.vpPerCoins);
    // Neglect penalty: dead channels touching your stations cost you.
    const dead = new Set();
    for (const s of p.stations) {
      for (const n of g.out[s]) if (g.depth[chKey(s, n)] === 0) dead.add(chKey(s, n));
      for (const n of g.inn[s]) if (g.depth[chKey(n, s)] === 0) dead.add(chKey(n, s));
    }
    const silt = -dead.size * TUNING.siltedPenaltyVP;
    return { name: p.name, contracts, mouth, network, coin, silt, live, stations: p.stations.length,
             total: contracts + mouth + network + coin + silt };
  });
}
