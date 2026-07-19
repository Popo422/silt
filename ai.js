// SILT — bot strategies. Each is a distinct archetype so sims expose
// whether the design punishes/rewards what it should.
import { TUNING, buildCost, buildTargets, dredgeTargets, shipOptions, canReachMouth } from './engine.js';
import { chKey, NODE_BY_ID, MOUTHS } from './graph.js';

// Pick the action pair for the round, then per-slot choices are made live.
export const STRATEGIES = {
  // Balanced: ships when profitable, dredges its own lifelines, builds when rich.
  balanced(g, p) {
    const opts = shipOptions(g, p);
    const fragile = myFragileChannels(g, p);
    const prog = [];
    if (opts.length) prog.push('ship');
    if (fragile.length && prog.length < 2) prog.push('dredge');
    if (p.coins >= buildCost(p) + 2 && prog.length < 2) prog.push('build');
    while (prog.length < 2) prog.push(opts.length > 1 ? 'ship' : 'survey');
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

  // Expander: builds relentlessly. Tests whether escalating cost is a real brake.
  expander(g, p) {
    const prog = [];
    if (p.coins >= buildCost(p) && buildTargets(g, p).length) prog.push('build');
    const opts = shipOptions(g, p);
    if (opts.length) prog.push('ship');
    while (prog.length < 2) prog.push('survey');
    return prog.slice(0, 2);
  },
};

function myFragileChannels(g, p) {
  const set = new Set();
  for (const s of p.stations) {
    for (const n of g.out[s]) { const k = chKey(s, n); if (g.depth[k] > 0 && g.depth[k] < 3) set.add(k); }
    for (const n of g.inn[s]) { const k = chKey(n, s); if (g.depth[k] > 0 && g.depth[k] < 3) set.add(k); }
  }
  return [...set];
}

// Given a committed action, choose the concrete target at resolution time.
export function chooseTarget(g, p, action, strat) {
  switch (action) {
    case 'ship': {
      const opts = shipOptions(g, p);
      if (!opts.length) return null;
      // Prefer routes that advance a held contract's mouth, then raw payout.
      const wanted = new Set(p.contracts.map(c => c.mouth).filter(Boolean));
      opts.sort((a, b) => {
        const wa = wanted.has(a.mouth) ? 1 : 0, wb = wanted.has(b.mouth) ? 1 : 0;
        if (wa !== wb) return wb - wa;
        return b.payout - a.payout;
      });
      return { option: opts[0] };
    }
    case 'dredge': {
      if (p.coins < TUNING.dredgeCoins) return null;
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
