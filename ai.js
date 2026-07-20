// SILT — bot strategies. Each is a distinct archetype so sims expose
// whether the design punishes/rewards what it should.
import { TUNING, buildCost, buildTargets, dredgeTargets, shipOptions, canReachMouth,
  contractFit, lakbayTargets } from './engine.js';
import { chKey, NODE_BY_ID, GOODS, MOUTHS } from './graph.js';

// Pick the action pair for the round, then per-slot choices are made live.
export const STRATEGIES = {
  // Balanced: expand early, ship always, dredge only lifelines that are actually dying.
  // (Previous version gated Build behind coins >= cost+2 and won 0% everywhere — it
  // never expanded, which made it a useless yardstick rather than a fair baseline.)
  balanced(g, p) {
    const opts = shipOptions(g, p);
    const dying = myFragileChannels(g, p).filter(k => g.depth[k] === 1);
    const canBuild = p.coins >= buildCost(p) && buildTargets(g, p).length;
    const prog = [];

    // Early game: land grabs compound. Prioritise them.
    if (canBuild && p.stations.length < 4 && g.round <= 5) prog.push('build');
    if (opts.length) prog.push('ship');
    if (dying.length && prog.length < 2) prog.push('dredge');
    if (canBuild && prog.length < 2) prog.push('build');
    // Only survey when the hand is genuinely thin — it was burning 42% of actions
    // on cards it could never fulfil, and fizzling the rest.
    while (prog.length < 2) {
      if (opts.length > prog.filter(a => a === 'ship').length) prog.push('ship');
      else if (p.contracts.length < 2) prog.push('survey');
      else if (dredgeTargets(g).length && p.coins >= TUNING.dredgeCoins) prog.push('dredge');
      else if (canBuild) prog.push('build');
      else prog.push('survey');
    }
    return prog.slice(0, 2);
  },

  // Defector: never dredges. Tests the tragedy-of-the-commons question.
  defector(g, p) {
    const opts = shipOptions(g, p);
    const prog = [];
    if (opts.length) prog.push('ship');
    if (p.coins >= buildCost(p)) prog.push('build');
    while (prog.length < 2) prog.push(opts.length > 1 ? 'ship' : 'survey');
    return prog.slice(0, 2);
  },

  // Turtle: 3 stations near a mouth, never expands, never dredges.
  turtle(g, p) {
    const opts = shipOptions(g, p);
    const prog = [];
    if (opts.length) prog.push('ship');
    if (p.stations.length < 3 && p.coins >= buildCost(p)) prog.push('build');
    while (prog.length < 2) prog.push(opts.length ? 'ship' : 'survey');
    return prog.slice(0, 2);
  },

  // Steward: maintains its OWN network aggressively, but still expands and ships.
  // (Earlier version hoarded coins at 1 station — that measured a bad bot, not a bad rule.)
  steward(g, p) {
    const opts = shipOptions(g, p);
    const fragile = myFragileChannels(g, p);
    const prog = [];
    if (fragile.length) prog.push('dredge');
    if (opts.length) prog.push('ship');
    if (prog.length < 2 && p.coins >= buildCost(p) && buildTargets(g, p).length) prog.push('build');
    while (prog.length < 2) prog.push(fragile.length ? 'dredge' : 'survey');
    return prog.slice(0, 2);
  },

  // Tollkeeper: treats dredging as investment. Claims high-traffic channels and
  // lives off the tolls. Only viable if Dredging Rights actually pays.
  tollkeeper(g, p) {
    const opts = shipOptions(g, p);
    const claims = claimTargets(g, p);
    const prog = [];
    if (claims.length && p.coins >= TUNING.dredgeCoins) prog.push('dredge');
    if (opts.length) prog.push('ship');
    if (prog.length < 2 && p.coins >= buildCost(p) && buildTargets(g, p).length) prog.push('build');
    while (prog.length < 2) prog.push(claims.length ? 'dredge' : 'survey');
    return prog.slice(0, 2);
  },

  // Expander: builds relentlessly. Tests whether escalating cost is a real brake.
  expander(g, p) {
    const prog = [];
    if (p.coins >= buildCost(p) && buildTargets(g, p).length) prog.push('build');
    const opts = shipOptions(g, p);
    if (opts.length) prog.push('ship');
    while (prog.length < 2) prog.push('survey');
    return prog.slice(0, 2);
  },

  // Smart: the real opponent. Not a fixed archetype — it reads the board each
  // round and does the highest-value thing. Ships toward a contract it can finish
  // or toward the neglected-bay bonus; dredges a lifeline that is one trip from
  // dying; expands early while it is cheap; surveys to cycle a dead hand. This is
  // the bot that makes the game a contest rather than a race of solitaires.
  smart(g, p) {
    const opts = shipOptions(g, p);
    // A lifeline is a fragile channel on a route one of my stations needs to reach
    // the sea — losing it strands the station. Only depth-1 ones are urgent.
    const dying = myFragileChannels(g, p).filter(k => g.depth[k] === 1);
    const canBuild = p.coins >= buildCost(p) && buildTargets(g, p).length;
    // A hand is "dead" when nothing in it is meaningfully attainable — time to
    // survey for something I can actually deliver. Threshold is a small fraction
    // of a contract's face value, so a genuinely stuck card triggers a refresh.
    const hasLiveContract = p.contracts.some(c => contractFit(g, p, c) > c.vp * 0.4);
    const roomToDraw = p.contracts.length < TUNING.handLimit;
    // Boxed in? If I want to grow but adjacency-build reaches nowhere useful, or a
    // bay I need is unreachable, Lakbay the Datu out. Only when it actually opens a
    // new bay — otherwise a normal build is cheaper. This is the escape valve.
    const escape = (!canBuild || reachableBays(g, p).size < MOUTHS.length)
      ? bestLakbay(g, p) : null;
    const wantLakbay = escape && escape.opensBay;

    const prog = [];
    // Grab land early — cost escalates, and more goods means more contracts reachable.
    if (canBuild && p.stations.length < 4 && g.round <= 5) prog.push('build');
    // Shipping is almost always worth it; chooseTarget picks the contract/bonus route.
    if (opts.length) prog.push('ship');
    // Protect a route about to die before it costs me a stranded station.
    if (dying.length && prog.length < 2) prog.push('dredge');
    // Break out of a lockout toward a bay I cannot otherwise reach.
    if (wantLakbay && prog.length < 2) prog.push('lakbay');
    // Cycle a hand I cannot deliver, rather than shipping into contracts I will
    // never complete.
    if (!hasLiveContract && roomToDraw && prog.length < 2) prog.push('survey');

    while (prog.length < 2) {
      if (opts.length > prog.filter(a => a === 'ship').length) prog.push('ship');
      else if (canBuild) prog.push('build');
      else if (wantLakbay && !prog.includes('lakbay')) prog.push('lakbay');
      else if (dredgeTargets(g).length && p.coins >= TUNING.dredgeCoins) prog.push('dredge');
      else if (roomToDraw) prog.push('survey');
      else prog.push('ship');
    }
    return prog.slice(0, 2);
  },
};

// Channels worth owning: damaged (so dredging is legal), not already ours, and
// carrying traffic other players depend on.
function claimTargets(g, p) {
  const traffic = channelTraffic(g, p.idx);
  return dredgeTargets(g)
    .filter(k => g.rights[k] !== p.idx)
    .filter(k => traffic[k] > 0)
    .sort((a, b) => (traffic[b] - traffic[a]) || (g.depth[a] - g.depth[b]));
}

// How many OTHER players have a plausible route through each channel.
function channelTraffic(g, me) {
  const t = {};
  g.players.forEach((q, qi) => {
    if (qi === me) return;
    for (const o of shipOptions(g, q)) for (const k of o.path) t[k] = (t[k] || 0) + 1;
  });
  return t;
}

function myFragileChannels(g, p) {
  const set = new Set();
  for (const s of p.stations) {
    for (const n of g.out[s]) { const k = chKey(s, n); if (g.depth[k] > 0 && g.depth[k] < 3) set.add(k); }
    for (const n of g.inn[s]) { const k = chKey(n, s); if (g.depth[k] > 0 && g.depth[k] < 3) set.add(k); }
  }
  return [...set];
}

// How much would shipping `good` to `mouth` advance one of p's contracts? Returns
// a rough value: high when it completes or nearly completes a real contract at the
// bay that contract names, zero when it helps no contract. This is what turns a
// bot from "ship the biggest payout" into "ship what a contract actually needs".
function contractGain(g, p, mouth, good, cubes) {
  let best = 0;
  for (const c of p.contracts) {
    // A named-mouth contract only progresses at its own bay; an any-mouth one
    // (c.mouth null) progresses anywhere, but must gather all goods at ONE bay.
    if (c.mouth && c.mouth !== mouth) continue;
    const pool = p.pool[mouth];
    const have = GOODS.reduce((s, gd) => s + pool[gd], 0);
    const kinds = GOODS.filter(gd => pool[gd] > 0).length;
    if (c.types === 1) {
      // Wants `need` of a single kind. Progress only if THIS good is the one being
      // built up toward the threshold.
      const after = pool[good] + cubes;
      const wasShort = pool[good] < c.need;
      if (wasShort) best = Math.max(best, c.vp * Math.min(after, c.need) / c.need);
    } else {
      // Wants `need` cubes across `types` kinds. A new kind is worth more than a
      // duplicate; completing the contract is worth its full vp.
      const addsKind = pool[good] === 0 ? 1 : 0;
      const totAfter = have + cubes, kindsAfter = kinds + addsKind;
      const complete = totAfter >= c.need && kindsAfter >= c.types;
      const progress = (Math.min(totAfter, c.need) / c.need) * 0.6
        + (Math.min(kindsAfter, c.types) / c.types) * 0.4;
      best = Math.max(best, complete ? c.vp : c.vp * progress * 0.8);
    }
  }
  return best;
}

// Score a ship option: what it actually gets you this turn. Contract progress is
// the biggest lever (it is where the points are), then the neglected-bay premium
// if this route claims it, then raw gold. Weighted so a route that finishes a
// contract beats a slightly-richer one that finishes nothing.
function shipValue(g, p, o) {
  const gain = contractGain(g, p, o.mouth, o.good, o.cubes);
  const bonus = (g.bayBonus && g.bayBonus.mouth === o.mouth) ? g.bayBonus.amount : 0;
  return gain * 3 + bonus + o.payout;
}

// Given a committed action, choose the concrete target at resolution time.
export function chooseTarget(g, p, action, strat) {
  switch (action) {
    case 'ship': {
      const opts = shipOptions(g, p);
      if (!opts.length) return null;
      // Ship what advances a contract or claims the neglected-bay bonus, not just
      // the biggest raw payout — the old sort only matched a contract's mouth and
      // ignored whether the goods were the ones it needed.
      opts.sort((a, b) => shipValue(g, p, b) - shipValue(g, p, a));
      return { option: opts[0] };
    }
    case 'dredge': {
      if (p.coins < TUNING.dredgeCoins) return null;
      if (strat === 'tollkeeper') {
        const c = claimTargets(g, p);
        if (c.length) return { channel: c[0] };
      }
      const mine = myFragileChannels(g, p);
      const pool = mine.length ? mine : dredgeTargets(g);
      if (!pool.length) return null;
      pool.sort((a, b) => g.depth[a] - g.depth[b]);   // most endangered first
      return { channel: pool[0] };
    }
    case 'build': {
      const t = buildTargets(g, p);
      if (!t.length || p.coins < buildCost(p)) return null;
      // Prefer nodes with cubes, live route to sea, and a good we lack.
      t.sort((a, b) => scoreNode(g, p, b) - scoreNode(g, p, a));
      return { node: t[0] };
    }
    case 'lakbay': {
      const best = bestLakbay(g, p);
      return best ? { node: best.node } : null;
    }
    default: return {};
  }
}

function scoreNode(g, p, id) {
  let s = g.cubes[id] * 2;
  if (canReachMouth(g, id, 1)) s += 4;
  if (canReachMouth(g, id, 2)) s += 2;
  const have = new Set(p.stations.map(x => NODE_BY_ID[x].good));
  if (!have.has(NODE_BY_ID[id].good)) s += 3;
  return s;
}

// Which bays can this player currently ship to from any of its stations? A bay it
// cannot reach is a dead contract and a missed bonus — the thing Lakbay exists to
// fix. Returns a Set of mouth ids.
function reachableBays(g, p) {
  const bays = new Set();
  for (const s of p.stations) {
    for (const r of shipRoutesReach(g, s)) bays.add(r);
  }
  return bays;
}
// Bays reachable from a node by living water (thin wrapper so the AI does not need
// the engine's full route list — it only wants which mouths, not the paths).
function shipRoutesReach(g, from) {
  const bays = [];
  for (const m of MOUTHS) if (canReachMouth(g, from, 1) && bayReachable(g, from, m)) bays.push(m);
  return bays;
}
// Can `from` reach the specific mouth `m` by depth>=1 water?
function bayReachable(g, from, m) {
  const seen = new Set([from]), stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (id === m) return true;
    for (const n of g.out[id]) {
      if (g.depth[chKey(id, n)] >= 1 && !seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return false;
}

// Best Lakbay destination for a bot: a settle-able node that opens a bay the player
// cannot currently reach, cheapest first. Returns { node, steps, opensBay } or null.
// This is what makes Lakbay a real escape rather than a random walk — the chief
// journeys toward the region the player is locked out of.
function bestLakbay(g, p) {
  const targets = lakbayTargets(g, p);
  if (!targets.length) return null;
  const have = reachableBays(g, p);
  const affordable = targets.filter(t =>
    p.coins >= t.steps * TUNING.lakbayPerStep + buildCost(p));
  if (!affordable.length) return null;
  // Score: a node that reaches a NEW bay is worth most; then a live route to sea;
  // then cheaper (fewer steps).
  const scored = affordable.map(t => {
    const reaches = MOUTHS.filter(m => bayReachable(g, t.node, m));
    const opensNew = reaches.some(m => !have.has(m));
    return { ...t, score: (opensNew ? 100 : 0) + (reaches.length ? 10 : 0) - t.steps };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  return { node: best.node, steps: best.steps, opensBay: best.score >= 100 };
}
