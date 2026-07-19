// SILT — rules engine. Pure state transitions, no rendering.
import { NODES, CHANNELS, MOUTHS, GOODS, buildIndex, chKey, NODE_BY_ID } from './graph.js';

export const TUNING = {
  rounds: 8,
  startCoins: 8,
  cubesPerNode: 4,          // was 3 — board went dry by R5
  regrowPerRound: 1,        // one upstream node refills each round
  stationYield: 1,          // each of YOUR stations regrows this much per round.
                            // Without it, expansion never repays its escalating cost:
                            // a station dries after 2 shipments and 12 of 16 action
                            // slots go idle, so passive play beat every active line.
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
  siltPerShip: 1,           // depth lost by each channel that carried cargo
  siltDownstream: false,    // rejected in sweep A: severs the delta, 0% live stations
  // Also tried: silt settling between slots, to let a route die before your second
  // action fires. Rejected — ship failures stayed at 0.00/game, so it added no
  // tension, just 1.7 more dead channels and -2.6 score.
  tollPerShip: 2,           // coins paid to a channel's rights-holder when others ship through
  rightsEnabled: true,      // dredging claims a channel; others pay you to use it
  rightsVP: 2,              // VP per channel you still hold at game end
  // Minimum depth for a claimed channel to score. Was hardcoded as `>= 2` down
  // in score(), while the rulebook printed "depth 2+" from its own literal — two
  // copies of one rule, either of which could be changed without the other.
  rightsDepthMin: 2,
  contractScale: 2,         // contracts sat at ~22% of score; target is ~45%
  handLimit: 4,
  vpPerCoins: 5,
  mouthVP: [12, 6, 2],      // raise the contested-delivery stakes
  vpPerStation: 0,          // raw disc count shouldn't score; only working routes do
  vpLiveStation: 2,         // a station that still reaches the sea is the reward
  liveDepthMin: 1,        // at 2, ~0-21% of stations qualified; the bonus was dead weight
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

// Rank a candidate opening node: how many mouths it can reach, and how many
// channels run through it. Used by the opening draft and exposed so the UI can
// show the same ranking to a human drafter.
// `_depth` is accepted but unused: the opening draft runs before any channel has
// silted, so every route is at full depth and factoring it in would change
// nothing. Kept in the signature because a mid-game "where should I expand?"
// ranking WOULD need it, and callers already pass it.
export function startValue(id, idx, _depth) {
  const seen = new Set([id]), stack = [id], mouths = new Set();
  while (stack.length) {
    const n = stack.pop();
    if (MOUTHS.includes(n)) { mouths.add(n); continue; }
    for (const nx of idx.out[n]) if (!seen.has(nx)) { seen.add(nx); stack.push(nx); }
  }
  const degree = idx.out[id].length + idx.inn[id].length;
  return mouths.size * 10 + degree;
}

export function pickStart(pool, idx, depth) {
  return [...pool].sort((a, b) => startValue(b, idx, depth) - startValue(a, idx, depth))[0];
}

export function newGame(playerCount = 3, seed = 12345) {
  const rand = rng(seed);
  const { out, inn } = buildIndex();

  const depth = {}, rights = {};
  for (const [a, b] of CHANNELS) { depth[chKey(a, b)] = TUNING.maxDepth; rights[chKey(a, b)] = null; }

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
  // Opening draft. Pick order is randomised per game, NOT tied to seat index: any
  // fixed order just relocates the bias (the old i*2 stride gave seat 1 the worst
  // node and seat 2 the best; drafting high-seat-first simply flipped it). Mirror
  // matches ran 11%/92% on seat alone until this was randomised.
  const draftPool = [...midTier];
  const draftOrder = shuffle(players.map((_, i) => i), rand);
  for (const pi of draftOrder) {
    const pick = pickStart(draftPool, { out, inn }, depth);
    draftPool.splice(draftPool.indexOf(pick), 1);
    players[pi].stations.push(pick);
  }
  // Whoever drafted first pays for it by resolving last in round 1.
  const firstPlayer = draftOrder[draftOrder.length - 1];
  for (const m of MOUTHS) for (const p of players) {
    p.delivered[m] = { timber: 0, grain: 0, salt: 0 };
    p.pool[m]      = { timber: 0, grain: 0, salt: 0 };
  }

  return {
    round: 1, phase: 'program', slot: 0, firstPlayer, draftOrder,
    depth, rights, cubes, players, deck, out, inn,
    log: [], events: [], shippedThisRound: new Set(), seed, rand,
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
        g.log.push(`${p.name} fulfils a ${c.kind} contract at ${m}, +${c.vp} points`);
        again = true;
        break;
      }
    }
  }
}

// Structured record of what just happened, for the UI to animate.
//
// The log is prose: fine for a transcript, useless for showing a player WHERE on
// the board a thing occurred. Without this the whole round resolved into a single
// repaint and the board read as a spreadsheet that redraws — you could not see a
// channel silt, a toll get paid, or a route being run. Events carry the geometry
// (which channel, which node, which path) so the renderer can point at it.
//
// The engine stays pure: it records what happened and knows nothing about timing,
// tweening or colour. `g.events` is drained by the caller exactly like `g.log`.
function emit(g, type, data) {
  (g.events ??= []).push({ type, ...data });
}

// Execute one player's action for the current slot.
// `choice` is a UI/AI-supplied selection: {node} | {channel} | {ship option index}
export function execute(g, pi, action, choice, claimed) {
  const p = g.players[pi];
  switch (action) {
    case 'dredge': {
      const k = choice?.channel;
      if (!k || g.depth[k] <= 0 || g.depth[k] >= TUNING.maxDepth) {
        g.log.push(`${p.name} tried to dredge but had no channel to work on`);
        emit(g, 'fizzle', { pi, action, channel: k ?? null });
        return;
      }
      if (p.coins < TUNING.dredgeCoins) {
        g.log.push(`${p.name} cannot afford to dredge`);
        emit(g, 'fizzle', { pi, action, reason: 'coins' });
        return;
      }
      p.coins -= TUNING.dredgeCoins;
      const before = g.depth[k];
      g.depth[k] = Math.min(TUNING.maxDepth, g.depth[k] + TUNING.dredgeAmount);
      let claim = '';
      let claimed_ = false;
      if (TUNING.rightsEnabled && g.rights[k] !== pi) {
        g.rights[k] = pi; claim = ' — claims rights'; claimed_ = true;
      }
      g.log.push(`${p.name} dredges ${k} to depth ${g.depth[k]}, pays ${TUNING.dredgeCoins} gold${claim}`);
      emit(g, 'dredge', { pi, channel: k, from: before, to: g.depth[k], claimed: claimed_ });
      break;
    }
    case 'build': {
      const node = choice?.node;
      const cost = buildCost(p);
      if (!node) { g.log.push(`${p.name} tried to settle but had nowhere to build`); return; }
      // Two players cannot take the same node in one slot. There used to be a
      // consolation payout here, but it fired 0.00 times per game across 300
      // simulated games — nodes are simply never contested. The real contested
      // resource is channels, which the dredging-rights rule already handles
      // (14.3 claims/game). Cut as dead rules weight.
      if (claimed.has(node)) {
        g.log.push(`${p.name} cannot settle ${node} — someone just took it`);
        emit(g, 'fizzle', { pi, action, node, reason: 'taken' });
        return;
      }
      if (p.coins < cost || !buildTargets(g, p).includes(node)) {
        g.log.push(`${p.name} cannot settle ${node}`);
        emit(g, 'fizzle', { pi, action, node, reason: 'illegal' });
        return;
      }
      p.coins -= cost; p.stations.push(node); claimed.add(node);
      // A station develops its node: it brings cubes online.
      const cubesBefore = g.cubes[node];
      g.cubes[node] = Math.min(TUNING.cubesPerNode, g.cubes[node] + TUNING.buildCubeBonus);
      g.log.push(`${p.name} settles ${node} for ${cost} gold — it now holds ${g.cubes[node]} goods`);
      emit(g, 'build', { pi, node, cost, cubesFrom: cubesBefore, cubesTo: g.cubes[node] });
      break;
    }
    case 'ship': {
      const o = choice?.option;
      if (!o || g.cubes[o.from] <= 0) {
        g.log.push(`${p.name} tried to ship but had nothing to carry`);
        emit(g, 'fizzle', { pi, action, node: o?.from ?? null, reason: 'empty' });
        return;
      }
      if (o.path.some(k => g.depth[k] < 1)) {
        g.log.push(`${p.name} could not ship — the route has silted up`);
        // The most instructive failure in the game: show which reach was dead.
        emit(g, 'blocked', {
          pi, path: o.path, at: o.path.find(k => g.depth[k] < 1), from: o.from, mouth: o.mouth,
        });
        return;
      }
      const n = Math.min(o.cubes, g.cubes[o.from]);
      g.cubes[o.from] -= n;
      p.delivered[o.mouth][o.good] += n;
      p.pool[o.mouth][o.good] += n;
      const pay = n * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel;
      p.coins += pay;
      o.path.forEach(k => g.shippedThisRound.add(k));

      // Tolls: dredging is an investment, not charity. Others pay to use what you maintain.
      let tolls = 0;
      const paid = [];   // per-channel, so the UI can flash the toll where it was levied
      if (TUNING.rightsEnabled) {
        for (const k of o.path) {
          const holder = g.rights[k];
          if (holder === null || holder === pi) continue;
          const owed = Math.min(TUNING.tollPerShip, p.coins);
          if (owed <= 0) continue;
          p.coins -= owed;
          g.players[holder].coins += owed;
          tolls += owed;
          paid.push({ channel: k, to: holder, amount: owed });
        }
      }
      g.log.push(`${p.name} ships ${n} ${o.good} to ${o.mouth}, earns ${pay} gold`
        + `${tolls ? `, pays ${tolls} in tolls` : ''}`);
      emit(g, 'ship', {
        pi, path: o.path, from: o.from, mouth: o.mouth, good: o.good,
        cubes: n, pay, tolls: paid,
      });
      const doneBefore = p.done.length;
      tryContracts(g, p);
      // Contract completions are the payoff moment; surface each one separately.
      for (const c of p.done.slice(doneBefore)) {
        emit(g, 'contract', { pi, mouth: o.mouth, vp: c.vp, kind: c.kind });
      }
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
      g.log.push(`${p.name} surveys and takes ${TUNING.surveyCoins} gold`);
      emit(g, 'survey', { pi, coins: TUNING.surveyCoins, drew: drawn.length });
      break;
    }
  }
}

export function siltPhase(g) {
  let n = 0;
  const hit = new Set(g.shippedThisRound);
  // Optional: sediment carries past the node it settled at, choking the next reach.
  if (TUNING.siltDownstream) {
    for (const k of g.shippedThisRound) {
      const to = k.split('>')[1];
      for (const nx of (g.out[to] ?? [])) hit.add(chKey(to, nx));
    }
  }
  // Collected rather than emitted one-by-one: the UI shows silting as a single
  // sweep across the whole delta, which is the moment the game is named for.
  const dropped = [], died = [];
  for (const k of hit) {
    if (g.depth[k] > 0) {
      const before = g.depth[k];
      g.depth[k] = Math.max(0, g.depth[k] - TUNING.siltPerShip); n++;
      dropped.push({ channel: k, from: before, to: g.depth[k] });
      if (g.depth[k] === 0) { g.rights[k] = null; died.push(k); }   // nobody owns a dead channel
    }
  }
  g.log.push(`Silt settles — ${n} ${n === 1 ? "channel loses" : "channels lose"} depth`);
  const gone = Object.entries(g.depth).filter(([, v]) => v === 0).length;
  if (gone) g.log.push(`  ${gone} ${gone === 1 ? "channel is" : "channels are"} now blocked for good`);
  emit(g, 'silt', { dropped, died, total: gone });
  g.shippedThisRound = new Set();
}

// The delta keeps producing, slowly. Refills the emptiest non-mouth nodes so the
// board can't go globally dry mid-game (observed dead round at R5 pre-fix).
export function regrowPhase(g) {
  // Your stations work their node: a developed site keeps producing.
  //
  // This phase used to be entirely silent — every other phase logs, this one
  // changed the goods on the board and said nothing. Watching a node's badge
  // climb between rounds with no line explaining it is how a player concludes
  // the numbers are arbitrary.
  let produced = 0;
  if (TUNING.stationYield > 0) {
    for (const p of g.players) {
      for (const s of p.stations) {
        if (g.cubes[s] < TUNING.cubesPerNode) {
          const before = g.cubes[s];
          g.cubes[s] = Math.min(TUNING.cubesPerNode, g.cubes[s] + TUNING.stationYield);
          produced += g.cubes[s] - before;
        }
      }
    }
  }
  // Plus a little wild regrowth on the emptiest unclaimed node.
  const owned = new Set(g.players.flatMap(p => p.stations));
  const pool = NODES.filter(n => !MOUTHS.includes(n.id) && !owned.has(n.id)
    && g.cubes[n.id] < TUNING.cubesPerNode)
    .sort((a, b) => g.cubes[a.id] - g.cubes[b.id]);
  let wild = 0;
  for (let i = 0; i < TUNING.regrowPerRound && i < pool.length; i++) {
    g.cubes[pool[i].id] += 1;
    wild += 1;
  }
  if (produced) g.log.push(`Settlements produce ${produced} goods`);
  if (wild) g.log.push(`${wild} goods regrow on unclaimed land`);
}

export function upkeepPhase(g) {
  for (const p of g.players) {
    let due = Math.max(0, p.stations.length - TUNING.freeStations) * TUNING.upkeepPerStation;
    while (due > p.coins && p.stations.length) {
      const lost = p.stations.pop();
      due -= TUNING.upkeepPerStation;
      g.log.push(`${p.name} cannot pay upkeep and abandons a settlement`);
      // Losing a station to upkeep is the harshest thing that can happen to you
      // and it used to pass by in a line of text nobody read.
      emit(g, 'abandon', { pi: g.players.indexOf(p), node: lost });
    }
    p.coins -= Math.min(due, p.coins);
    if (due > 0) g.log.push(`${p.name} pays ${due} gold in upkeep`);
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
    const contracts = Math.round(p.done.reduce((s, c) => s + c.vp, 0) * TUNING.contractScale);
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
    // Rights only score if you kept the channel navigable — abandoned tolls are worth nothing.
    const heldCount = TUNING.rightsEnabled
      ? Object.keys(g.rights).filter(k =>
        g.rights[k] === p.idx && g.depth[k] >= TUNING.rightsDepthMin).length : 0;
    const held = heldCount * TUNING.rightsVP;
    return { name: p.name, contracts, mouth, network, coin, silt, held, heldCount,
             live, stations: p.stations.length,
             total: contracts + mouth + network + coin + silt + held };
  });
}
