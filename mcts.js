// SILT — search-based opponent (Monte Carlo rollout / flat-MCTS).
//
// The hand-tuned bots in ai.js commit both actions up front from an if/else ladder
// and never simulate the consequences. This bot instead PLAYS THE GAME FORWARD in
// its head: for each candidate turn (a pair of actions with concrete targets) it
// runs many random playouts to the end of the game using the real engine, and keeps
// the turn whose playouts win by the widest average margin. No training, no weights
// to tune — it searches the rules that already exist.
//
// It is a "flat" Monte Carlo search (root-level bandit over candidate turns, random
// rollouts below) rather than a full UCT tree. For SILT's short horizon (<=8 rounds)
// and small branching this is both simpler and strong enough to dominate the ladder
// bots; a full tree can slot in later behind the same interface if needed.

import {
  execute, siltPhase, floodPhase, bagyoPhase, bayBonusPhase, regrowPhase, upkeepPhase,
  seatOrder, score, shipOptions, buildTargets, buildCost, buildStepCost, dredgeTargets,
  TUNING, totalRounds, seasonOf,
} from './engine.js';
import { STRATEGIES, chooseTarget, registerMcts } from './ai.js';
import { chKey } from './graph.js';

// --- deterministic RNG for rollouts --------------------------------------
// Rollouts must be random but reproducible per search, and must NOT touch g.rand
// (that closure drives the real game; sharing it would desync replays). Each search
// gets its own stream seeded from the live game state.
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- cheap game clone -----------------------------------------------------
// Only the MUTABLE state is copied. out/inn (topology) and NODE tables are static,
// so they're shared by reference — copying them every rollout would dominate cost.
// g.rand is deliberately dropped: rollouts use their own RNG and never draw from it.
function cloneGame(g) {
  const copyMouthMap = (m) => {
    const o = {};
    for (const k in m) o[k] = { ...m[k] };
    return o;
  };
  return {
    round: g.round, phase: g.phase, slot: g.slot, season: g.season,
    firstPlayer: g.firstPlayer, draftOrder: g.draftOrder,
    depth: { ...g.depth }, rights: { ...g.rights }, mostRecent: { ...g.mostRecent },
    markers: Object.fromEntries(Object.entries(g.markers).map(([k, v]) => [k, { ...v }])),
    cubes: { ...g.cubes },
    players: g.players.map(p => ({
      idx: p.idx, name: p.name, strat: p.strat, coins: p.coins,
      stations: [...p.stations],
      contracts: p.contracts.map(c => ({ ...c })),
      done: p.done.map(c => ({ ...c })),
      delivered: copyMouthMap(p.delivered),
      pool: copyMouthMap(p.pool),
      hukay: p.hukay ?? 0,
      program: [...p.program],
    })),
    deck: [...g.deck],
    out: g.out, inn: g.inn,                       // shared, static
    log: [], events: [],                          // scratch — never read during search
    shippedThisRound: new Set(g.shippedThisRound),
    seed: g.seed,
    bayThisRound: { ...g.bayThisRound },
    bayBonus: g.bayBonus ? { ...g.bayBonus } : null,
  };
}

// --- candidate move generation -------------------------------------------
// A "turn" is [action, target] x2. The raw space is ~1000 pairs/turn; searching
// all of them wastes rollouts on obviously-bad targets. Instead we enumerate a
// FOCUSED set: for each action type, the few best concrete targets by the same
// cheap heuristics chooseTarget already trusts, then form pairs. This keeps the
// candidate count in the low dozens while still containing every plausible line.

function topShipTargets(g, p, n = 4) {
  const opts = shipOptions(g, p);
  if (!opts.length) return [];
  // Reuse ai.js's shipValue ordering by delegating to chooseTarget's sort: it sorts
  // in place, so sort a copy the same way via a light re-score.
  opts.sort((a, b) => shipHeur(g, p, b) - shipHeur(g, p, a));
  return opts.slice(0, n).map(o => ({ action: 'ship', choice: { option: o }, key: `ship:${o.from}>${o.mouth}` }));
}
// A compact ship score: cubes delivered + hops + bay-bonus pull. Deliberately
// simpler than ai.js/shipValue — the rollouts, not this heuristic, do the real
// evaluating; this just prunes to a sane shortlist.
function shipHeur(g, p, o) {
  let v = o.payout + o.cubes * 2;
  if (g.bayBonus && g.bayBonus.mouth === o.mouth) v += g.bayBonus.amount;
  return v;
}

function topBuildTargets(g, p, n = 3) {
  const affordable = buildTargets(g, p)
    .filter(id => p.coins >= buildCost(p) + buildStepCost(g, p, id));
  affordable.sort((a, b) => (g.cubes[b] - g.cubes[a]) || (buildStepCost(g, p, a) - buildStepCost(g, p, b)));
  return affordable.slice(0, n).map(id => ({ action: 'build', choice: { node: id }, key: `build:${id}` }));
}

function topDredgeTargets(g, p, n = 3) {
  if (p.coins < TUNING.dredgeCoins) return [];
  // Channels touching my stations, split by living (dredgeable normally) vs dead (only a
  // hukay can touch them). The search decides via rollouts whether spending a token beats
  // banking it — this just has to put both the plain and the hukay move on the menu.
  const mine = new Set();
  const deadMine = new Set();
  for (const s of p.stations) {
    for (const nb of g.out[s]) { const k = chKey(s, nb); mine.add(k); if (g.depth[k] === 0) deadMine.add(k); }
    for (const nb of g.inn[s]) { const k = chKey(nb, s); mine.add(k); if (g.depth[k] === 0) deadMine.add(k); }
  }
  const dt = dredgeTargets(g);
  dt.sort((a, b) => (mine.has(b) - mine.has(a)) || (g.depth[a] - g.depth[b]));
  const moves = dt.slice(0, n)
    .map(k => ({ action: 'dredge', choice: { channel: k }, key: `dredge:${k}` }));
  const hasToken = (p.hukay ?? 0) > 0;
  if (hasToken) {
    // Revive candidates: my dead channels (shallowest-adjacency already implied by "mine").
    for (const k of deadMine) {
      moves.push({ action: 'dredge', choice: { channel: k, useHukay: true }, key: `revive:${k}` });
    }
    // Power-dredge: the single most endangered living lifeline, +2 in one bite.
    const brink = dt.find(k => mine.has(k) && g.depth[k] === 1);
    if (brink) moves.push({ action: 'dredge', choice: { channel: brink, useHukay: true }, key: `power:${brink}` });
  }
  return moves;
}

const SURVEY_MOVE = { action: 'survey', choice: {}, key: 'survey' };

// The single-slot candidate menu for a player in a given state.
function slotCandidates(g, p) {
  const c = [
    ...topShipTargets(g, p),
    ...topBuildTargets(g, p),
    ...topDredgeTargets(g, p),
    SURVEY_MOVE,
  ];
  return c.length ? c : [SURVEY_MOVE];
}

// Full-turn candidates: pairs of slot moves. We cap the pair count so search stays
// fast. Two slots are resolved SEQUENTIALLY in the real game (silt/bonus don't apply
// between slots, but coins/cubes/rights carry over), so we generate slot-2 options
// AFTER simulating slot-1 — a build in slot 1 can unlock a ship in slot 2. That
// state-dependent pairing is exactly what the ladder bots miss.
function turnCandidates(g, p, cap = 24) {
  const pairs = [];
  const firsts = slotCandidates(g, p);
  for (const a of firsts) {
    // Simulate slot 1 on a scratch clone to see what slot 2 can then do.
    const gg = cloneGame(g);
    const claimed = new Set();
    execute(gg, p.idx, a.action, a.choice, claimed);
    const pp = gg.players[p.idx];
    const seconds = slotCandidates(gg, pp);
    for (const b of seconds) {
      pairs.push({ first: a, second: b, key: `${a.key}|${b.key}` });
      if (pairs.length >= cap * 3) break;
    }
    if (pairs.length >= cap * 3) break;
  }
  // De-dupe and trim: keep a spread of first-actions rather than 24 ships.
  const seen = new Set(); const out = [];
  for (const t of pairs) { if (seen.has(t.key)) continue; seen.add(t.key); out.push(t); }
  return out.slice(0, cap);
}

// --- rollout --------------------------------------------------------------
// From a position where it's `me`'s turn, APPLY the candidate turn for `me`, then
// let every player (me included, on later rounds) play a fast heuristic policy to
// the end of the game. Returns the final margin for `me`: my total minus the best
// opponent total. Positive means I'd win.
function rolloutPolicy(g, p, rand) {
  // A light stochastic policy: usually the current 'smart' recipe, but with a small
  // chance of a random legal action so rollouts explore instead of collapsing to one
  // deterministic line (which would make every playout identical and the search blind).
  if (rand() < 0.15) {
    const c = slotCandidates(g, p);
    const pick = c[Math.floor(rand() * c.length)];
    return pick.action;
  }
  const prog = STRATEGIES.smart(g, p);
  return prog;
}

function playoutRestOfTurn(g, me, turn, rand) {
  // The clone drops the game's real RNG (rollouts must not touch it). Give it the
  // rollout's own RNG so any engine phase that draws randomness — e.g. floodPhase's
  // channel revive on the season turn — works and stays reproducible per search.
  g.rand = rand;
  // Resolve the CURRENT slot-pair: `me` plays the candidate; everyone else plays
  // their committed program (already set for this round in the real game).
  for (let slot = 0; slot < 2; slot++) {
    const claimed = new Set();
    for (const pi of seatOrder(g)) {
      const p = g.players[pi];
      if (pi === me) {
        const mv = slot === 0 ? turn.first : turn.second;
        // Re-resolve the target against the live clone (slot-2 target may have been
        // computed on a scratch board; recompute to stay legal).
        const choice = reResolve(g, p, mv);
        if (choice) execute(g, pi, mv.action, choice, claimed);
      } else {
        const a = p.program[slot];
        if (a) execute(g, pi, a, chooseTarget(g, p, a, p.strat) ?? {}, claimed);
      }
    }
  }
  endRound(g);
  // Play remaining rounds with heuristic policies for all seats. Uses totalRounds()
  // and refreshes g.season each round exactly like the real loops, so a rollout that
  // crosses the Amihan->Habagat turn evaluates the wet season correctly (once later
  // phases give it distinct rules) instead of stopping short at the old 8-round mark.
  for (g.round = g.round + 1; g.round <= totalRounds(); g.round++) {
    g.season = seasonOf(g.round);
    floodPhase(g);   // refills the delta on the Amihan->Habagat turn (no-op otherwise)
    bagyoPhase(g);   // the typhoon builds/strikes so the search plans around landfall
    for (const p of g.players) p.program = normalizeProg(rolloutPolicy(g, p, rand));
    for (let slot = 0; slot < 2; slot++) {
      const claimed = new Set();
      for (const pi of seatOrder(g)) {
        const p = g.players[pi];
        const a = p.program[slot];
        if (a) execute(g, pi, a, chooseTarget(g, p, a, p.strat ?? 'smart') ?? {}, claimed);
      }
    }
    endRound(g);
  }
  const s = score(g);
  const my = s[me].total;
  let best = -Infinity;
  s.forEach((row, i) => { if (i !== me) best = Math.max(best, row.total); });
  return my - best;
}

// rolloutPolicy may return a single action (random branch) or a 2-action program.
function normalizeProg(x) {
  if (Array.isArray(x)) return x.length === 2 ? x : [x[0] ?? 'survey', x[1] ?? 'survey'];
  return [x, x];   // a single chosen action, used for both slots (chooseTarget re-picks each)
}

// A candidate's stored choice may reference a board that has since changed inside a
// rollout (another seat took the node, a channel silted). Recompute a legal target
// of the same action type against the live state so the move still fires.
function reResolve(g, p, mv) {
  if (mv.action === 'survey') return {};
  if (mv.action === 'ship') {
    const opts = shipOptions(g, p);
    if (!opts.length) return null;
    // try to keep the same destination mouth if still available
    const want = mv.choice.option;
    const same = opts.find(o => o.from === want.from && o.mouth === want.mouth);
    return { option: same ?? opts.sort((a, b) => shipHeur(g, p, b) - shipHeur(g, p, a))[0] };
  }
  if (mv.action === 'build') {
    const id = mv.choice.node;
    const ok = buildTargets(g, p).includes(id) && p.coins >= buildCost(p) + buildStepCost(g, p, id);
    if (ok) return { node: id };
    const alt = topBuildTargets(g, p, 1)[0];
    return alt ? alt.choice : null;
  }
  if (mv.action === 'dredge') {
    const k = mv.choice.channel;
    // A hukay move (revive or power-dredge) is only still legal if the token is still in
    // hand; a dead channel is a valid target ONLY with the token.
    const useHukay = !!(mv.choice.useHukay && (p.hukay ?? 0) > 0);
    const affordable = p.coins >= TUNING.dredgeCoins;
    const live = g.depth[k] > 0 && g.depth[k] < TUNING.maxDepth;
    const dead = g.depth[k] === 0;
    if (affordable && ((live) || (dead && useHukay))) return { channel: k, useHukay };
    const alt = topDredgeTargets(g, p, 1)[0];
    return alt ? alt.choice : null;
  }
  return {};
}

function endRound(g) {
  siltPhase(g); bayBonusPhase(g); regrowPhase(g); upkeepPhase(g);
}

// --- public: pick a turn --------------------------------------------------
// Returns { program:[a,b], targets:{0,1} } — the chosen action pair AND the concrete
// targets the search settled on, so chooseTarget can honour them at resolution.
// Two budgeting modes:
//   opts.timeMs  — spend up to this many milliseconds, round-robin across candidates
//                  until the clock runs out. Bounds every MOVE regardless of round,
//                  which is what the live UI needs (early rounds simulate longer games
//                  and would otherwise blow a fixed-rollout budget to 2s). Not fully
//                  reproducible (wall-clock decides the rollout count).
//   opts.rollouts — a fixed total playout count, split evenly. Deterministic given the
//                  seed; used by the simulator so replays match.
// Default: timeMs when neither is given, so the common (UI) path is naturally bounded.
export function searchTurn(g, me, opts = {}) {
  const p = g.players[me];
  const cands = turnCandidates(g, p, opts.cap ?? 16);
  if (cands.length === 1) {
    return { program: [cands[0].first.action, cands[0].second.action], picks: cands[0] };
  }
  // Seed the rollout RNG from live state so a given position searches reproducibly.
  const seed = ((g.round * 73856093) ^ (me * 19349663) ^ (Math.round(p.coins) * 83492791)
    ^ Object.keys(g.depth).reduce((a, k, i) => a + g.depth[k] * (i + 1), 0)) >>> 0;
  const rand = mulberry(seed);

  const sum = new Array(cands.length).fill(0);
  const runs = new Array(cands.length).fill(0);
  const evalOne = (ci) => {
    const gg = cloneGame(g);
    sum[ci] += playoutRestOfTurn(gg, me, cands[ci], rand);
    runs[ci] += 1;
  };

  if (opts.rollouts) {
    // Deterministic fixed-count mode (simulator).
    const perCand = Math.max(4, Math.floor(opts.rollouts / cands.length));
    for (let ci = 0; ci < cands.length; ci++) for (let r = 0; r < perCand; r++) evalOne(ci);
  } else {
    // Time-bounded mode (default / UI). The deadline is set FIRST and every rollout
    // (warmup included) is charged against it — otherwise an early-round warmup, where
    // each playout is a full 8-round game, blows the budget before the clock starts.
    // One guaranteed pass gives every candidate a sample; after that we round-robin
    // until the clock runs out, so tight budgets still cover the whole menu once.
    // Date.now() is fine here (plain Node/browser module, not a Workflow script).
    const timeMs = opts.timeMs ?? 350;
    const deadline = Date.now() + timeMs;
    for (let ci = 0; ci < cands.length; ci++) evalOne(ci);        // one sample each
    let ci = 0;
    while (Date.now() < deadline) { evalOne(ci); ci = (ci + 1) % cands.length; }
  }

  let best = 0, bestScore = -Infinity;
  for (let ci = 0; ci < cands.length; ci++) {
    const avg = runs[ci] ? sum[ci] / runs[ci] : -Infinity;
    if (avg > bestScore) { bestScore = avg; best = ci; }
  }
  return {
    program: [cands[best].first.action, cands[best].second.action],
    picks: cands[best],
    margin: bestScore,
  };
}

// Search strength/pacing, settable by the host. The simulator wants a FIXED rollout
// count (reproducible replays); the live UI wants a TIME cap (bounded pause per move,
// whatever the round). Defaults suit the sim; ui.js calls setSearchOptions({timeMs}).
let SEARCH_OPTS = { rollouts: 140 };
export function setSearchOptions(o) { SEARCH_OPTS = o; }

// Cache of the search result for the current (round, slot-0) decision, so the two
// STRATEGIES/chooseTarget calls the game makes per turn don't each re-run a search.
let cache = { key: null, res: null };

function cacheKey(g, me) {
  return `${g.round}:${me}:${g.players[me].coins}:${g.players[me].stations.length}:${g.firstPlayer}`;
}

// STRATEGIES-compatible entry point: returns the 2-action program for this turn.
export function mctsProgram(g, p) {
  const key = cacheKey(g, p.idx);
  if (cache.key !== key) cache = { key, res: searchTurn(g, p.idx, SEARCH_OPTS) };
  return cache.res.program;
}

// chooseTarget-compatible entry point: returns the concrete choice the search picked
// for the given action, so the resolver executes the SAME move the search evaluated.
export function mctsChoose(g, p, action) {
  const key = cacheKey(g, p.idx);
  if (cache.key !== key || !cache.res) return chooseTarget(g, p, action, 'smart');
  const { picks } = cache.res;
  // First unresolved slot matching this action wins; fall back to live re-resolve.
  const mv = picks.first.action === action ? picks.first
    : picks.second.action === action ? picks.second : null;
  if (mv) {
    const choice = reResolve(g, p, mv);
    if (choice) return choice;
  }
  return chooseTarget(g, p, action, 'smart');
}

// Break the ai.js <-> mcts.js cycle at load time: ai.js's `mcts` strategy calls
// through these once this module has finished evaluating.
registerMcts({ program: mctsProgram, choose: mctsChoose });
