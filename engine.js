// SILT — rules engine. Pure state transitions, no rendering.
import { NODES, CHANNELS, MOUTHS, GOODS, buildIndex, chKey, NODE_BY_ID } from './graph.js';

export const TUNING = {
  rounds: 8,
  // --- Two-season (Taon) scaffolding — Phase 0 -----------------------------
  // A Taon (year) splits into Amihan (dry, one-way silt) then Habagat (wet, refill +
  // cascade + bagyo). Phase 0 adds ONLY the plumbing: with `seasons` off, seasonOf()
  // always returns 'amihan', totalRounds() stays `rounds`, and play is byte-identical
  // to today. Each later phase turns on one behaviour behind its own flag.
  // The two-season game is the default: two normal 8-round eras joined by a flood that
  // fully refills the delta between them (see floodFull). It measures as healthy as the
  // single-season game (dead ~0.1, win-spread ~15). Set seasons:false for the classic
  // one-era 8-round game, still fully supported.
  seasons: true,            // master switch for the two-season game
  roundsPerSeason: 8,       // 8 + 8 = 16 total when seasons on (see totalRounds). Two
                            //   full eras: an Amihan drought, then a Habagat flood-reset.
  // Phase 1 — the flood. On the Amihan->Habagat turn the rains refill the delta:
  // every still-living channel gains `floodRefill` depth (capped at maxDepth), and a
  // dead channel has a `floodRevive` chance to carve back to depth 1. Stations and
  // dredge-claims are deliberately NOT touched — what you built persists across the
  // turn; only the water comes back. Reckoning (pay-or-lose upkeep at the turn) is
  // parked off for now per the roadmap.
  // The Habagat flood is the era's reset: the rains arrive and the whole delta floods
  // back to life. This is the structural counter to the drought's one-way silting —
  // era 2 starts from fresh high water, not from era 1's accumulated damage (without
  // it, silt compounds across all 16 rounds and ~2 of 3 players end cut off from the
  // sea). floodFull restores EVERY channel to full depth and carves every dead one back
  // open; the softer partial-refill numbers below are kept for tuning if a gentler
  // flood is ever wanted.
  floodFull: true,          // does the flood fully restore the delta (all channels max)?
  floodRefill: 2,           // (partial mode) depth added to each living channel
  floodRevive: true,        // (partial mode) do dead channels get a chance to come back?
  floodReviveTo: 1,         // (partial mode) depth a revived channel returns at
  // Phase 2 — Cascading Anód. In Habagat only, the moving flood carries sediment
  // downstream: when a channel silts, the loss spills one hop toward the sea. Modelled
  // as a single, non-recursive wave — each channel that lost depth this sweep drags its
  // downstream neighbours down by `cascadeDrop`, but a channel can be caught by the
  // cascade at most once per sweep (no chain reactions, no infinite loops). This is
  // what makes the wet season political: your shipping silts YOUR channel, and the
  // silt then chokes whoever is downstream of you.
  // DEFAULT OFF. Cascade works and is tested, but on the 37-channel map it (with the
  // bagyo) silts the delta to death over 16 rounds — sims showed ~2 of 3 players cut off
  // from the sea and <1 bay reachable. The shipped two-season game is "two normal 8-round
  // games joined by a flood reset", which measures as healthy as the base game (dead
  // ~0.1, spread ~15). Cascade stays here for a shorter variant or a larger future map.
  cascadeAnod: false,       // does silt cascade downstream in Habagat?
  cascadeDrop: 1,           // depth a downstream channel loses from an upstream silting
  // Hukay tokens. Surveying is the game's "look at the water" action; it now also hands
  // you a hukay (shovel) — a banked, consumable dredge charge. Spend one while dredging
  // (still paying the normal dredge gold) and it does one of two things depending on the
  // channel:
  //   • a DEAD channel (depth 0) — which a normal dredge cannot touch at all — is REVIVED
  //     to hukayReviveTo (depth 1). This is the only way to break the game's hardest rule,
  //     "a channel that runs dry is gone for good": you earn the shovel, you claw a
  //     lifeline back from the grave.
  //   • a LIVING channel gets the bigger bite, +hukayDredgeBonus on top of the normal
  //     dredgeAmount (so +2 instead of +1).
  // It ties the two non-scoring actions together — Survey feeds Dredge — and gives the
  // river-repair line a real power move and a comeback tool, which is what the old
  // forecast highlight reached for but could never deliver (you cannot act on a warning
  // about what other players might freely choose to do).
  hukayFromSurvey: true,    // does Survey grant a hukay token?
  hukayMax: 3,              // most tokens a player can bank (no infinite hoarding)
  hukayDredgeBonus: 1,      // extra depth a spent token adds on a LIVING channel (+1 → +2)
  hukayReviveTo: 1,         // depth a spent token restores a DEAD (depth 0) channel to
  // Phase 4 — the Bagyo (typhoon). Late in Habagat a storm builds visibly and makes
  // landfall on a fixed round, striking one bay's approach and killing those channels
  // outright (depth -> 0). It is the finale: forecastable via Tanáw (so you can dredge
  // a way around or race to cash contracts before it hits), survivable if you read it,
  // ruinous if you don't. `bagyoLandfallFromEnd` places landfall N rounds before the
  // game ends; `bagyoRadius` 1 = the target bay's feeder channels, 2 = also one tier up.
  // DEFAULT OFF, same reason as cascade above: the storm destroying a whole bay approach
  // is too much for this map to recover from within a 16-round game. Kept behind the flag
  // (fully built + tested) for a bigger map or a shorter, higher-intensity variant.
  bagyo: false,             // is there a typhoon climax in Habagat?
  bagyoLandfallFromEnd: 1,  // landfall this many rounds before the last (0 = final round)
  bagyoRadius: 2,           // 1 = bay feeders only; 2 = feeders + the tier above them
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
  buildStepGold: 2,         // extra gold per hop of distance for a build beyond an
                            // adjacent node. Build is now "settle any node your
                            // network can reach over living water" (Brass-style), so
                            // a bad opening can't box you into one arm — but reaching
                            // across the delta is paid for, so position still matters.
  buildCubeBonus: 2,        // NEW: a new station arrives with 2 cubes already on it
  shipCubesMax: 2,
  shipPerCube: 2,
  shipPerChannel: 1,
  surveyCoins: 3,           // was 4
  surveyDraw: 3,            // NEW: see 3 keep 1 — makes Survey a real option
  dredgeAmount: 1,          // was 2 — one dredge undid two ships; silt never accrued
  dredgeCoins: 1,           // NEW: dredging costs money, so it's a genuine trade
  maxDepth: 3,
  siltPerShip: 1,           // kept at 1 deliberately: silt 2 balances the bots but
                            // kills so many channels that bays go unreachable and the
                            // boxed-out/dead-contract rate (the thing the braided map
                            // fixed) jumps back to ~55%. Low silt keeps routes alive;
                            // turtle is suppressed by scoring levers instead.
  siltDownstream: false,    // rejected in sweep A: severs the delta, 0% live stations
  // Also tried: silt settling between slots, to let a route die before your second
  // action fires. Rejected — ship failures stayed at 0.00/game, so it added no
  // tension, just 1.7 more dead channels and -2.6 score.
  tollPerShip: 4,           // coins the rights-holder collects when others ship through.
                            // Part of the braided-map rebalance: the extra routes let a
                            // high-volume shipper dodge more tolls, so this is raised to
                            // keep claimed channels paying back their dredging.
  rightsEnabled: true,      // dredging claims a channel; others pay you to use it
  // Interaction rebalance (sim-swept): the toll/corridor category was scoring ~1
  // of ~50 for everyone, so nobody dredged or contested — and a camp-by-a-bay
  // turtle that skips all of it won outright (36% vs a 28% field). Raising these
  // and softening the coin conversion pulled turtle back to 32% and tightened the
  // win-spread from 23% to 17%, without scores leaving the 45-60 band.
  rightsVP: 3,              // VP per channel you still hold at game end (was 2)
  vpNetworkChannel: 2,      // extra VP per channel in your largest CONNECTED run (was 1)
  // Minimum depth for a claimed channel to score. Was hardcoded as `>= 2` down
  // in score(), while the rulebook printed "depth 2+" from its own literal — two
  // copies of one rule, either of which could be changed without the other.
  rightsDepthMin: 2,
  // Contracts are an additive bonus, not the game. At scale 2 a single delta
  // contract was ~30 pts — two-thirds of a winning score — so the whole game
  // collapsed into "hit your big card" solitaire, and the interactive delta was
  // just the means. At scale 1 the top contract is 15, contracts are ~29% of
  // score, and the winner-loser spread tightens from ~38 to ~26: contracts reward
  // playing the river well, they no longer decide the game on one draw.
  contractScale: 1,
  handLimit: 4,
  vpPerCoins: 9,            // was 5, then 7 — a hoarded-coin camper converted gold to VP
                           // too cheaply; softened again on the braided map to keep
                           // passive play from paying

  mouthVP: [8, 5, 3],       // was [12,6,2] — flattened. The old steep curve was
                            // turtle's whole edge: camp one bay, win its 12-pt crown
                            // uncontested. Flatter majority rewards PLACING in several
                            // bays (which the braided map now lets you do) over
                            // dominating one, so the spread-out player beats the camper
                            // — turtle drops from ~48% to ~26% head-to-head.
  vpPerStation: 0,          // raw disc count shouldn't score; only working routes do
  vpLiveStation: 2,         // a station that still reaches the sea is the reward
  liveDepthMin: 1,        // at 2, ~0-21% of stations qualified; the bonus was dead weight
  siltedPenaltyVP: 1,       // NEW: -1vp per SILTED channel adjacent to your stations
  // Neglected-bay premium. Each round, the bay that received the LEAST cargo
  // carries a gold bonus into the next round; the first player to ship there
  // claims it, then it is spent. This is the interaction engine: the crowd floods
  // one bay, its rivals' best move is to break off and supply the ignored one —
  // whose route has usually silted from neglect, so grabbing the premium means
  // dredging your way there. Turns "fix the river" from a chore into a race.
  bayBonusGold: 6,
};

export const ACTIONS = ['dredge', 'build', 'ship', 'survey'];

// --- Season plumbing (Phase 0) -------------------------------------------
// Total rounds in a game. With seasons off this is exactly `rounds` (today's game);
// with seasons on it is two halves of `roundsPerSeason`. Callers use this instead of
// reading TUNING.rounds directly so turning seasons on lengthens the game in one place.
export function totalRounds() {
  return TUNING.seasons ? TUNING.roundsPerSeason * 2 : TUNING.rounds;
}

// Which season a given 1-indexed round falls in. Off → always 'amihan' (so every
// season-gated rule is a no-op until its phase turns it on). On → first half Amihan
// (dry), second half Habagat (wet).
export function seasonOf(round) {
  if (!TUNING.seasons) return 'amihan';
  return round <= TUNING.roundsPerSeason ? 'amihan' : 'habagat';
}

// True on the round where Amihan hands over to Habagat — the transition beat Phase 1
// will hook (refill the channels, keep balangay + claims). Never true with seasons off.
export function isSeasonTurn(round) {
  return TUNING.seasons && round === TUNING.roundsPerSeason + 1;
}

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

  // rights[k]   = current owner index (derived, cached for readers)
  // markers[k]  = { playerIdx: count } — every Hukay leaves one, and ownership
  //               goes to whoever has the most, not whoever dredged last. This is
  //               the Hansa-style "presence on the route" model: dredge a channel
  //               twice and it stays yours against a single counter-dredge.
  //               `mostRecent[k]` breaks a marker tie in favour of the last dredger.
  const depth = {}, rights = {}, markers = {}, mostRecent = {};
  for (const [a, b] of CHANNELS) {
    const k = chKey(a, b);
    depth[k] = TUNING.maxDepth; rights[k] = null; markers[k] = {}; mostRecent[k] = null;
  }

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
      hukay: 0,                // banked hukay (shovel) tokens, from Survey; spent on Dredge
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
    // Current season, derived from round via seasonOf(). Kept as a field (not computed
    // on every read) so the UI and the MCTS clone carry it cheaply; the round loop
    // refreshes it each round. 'amihan' always, until seasons are switched on.
    season: seasonOf(1),
    depth, rights, markers, mostRecent, cubes, players, deck, out, inn,
    log: [], events: [], shippedThisRound: new Set(), seed, rand,
    // bayThisRound counts cargo delivered to each bay this round, to find the most
    // neglected one at round end. bayBonus is the premium waiting on a bay from
    // last round's neglect: { mouth, amount }, or null if none / already claimed.
    bayThisRound: Object.fromEntries(MOUTHS.map(m => [m, 0])),
    bayBonus: null,
  };
}

export const buildCost = (p) => TUNING.buildBase + p.stations.length;

// Draw the survey cards WITHOUT keeping any, so the human can be shown all three
// and pick. The chosen resolve then passes them back as choice.drawn. Bots never
// call this — they draw and auto-keep inside execute() in one step, since they
// cannot click a picker.
export function surveyDrawnFor(g) {
  return Array.from({ length: TUNING.surveyDraw }, () => g.deck.pop()).filter(Boolean);
}

// Size of the largest connected group among a set of channels. Two channels are
// connected when they share an endpoint node, so this is a connected-components
// count over the channel keys — the number the network bonus scores. A lone
// channel is a network of 1; nothing owned is 0.
export function largestNetwork(channelKeys) {
  if (!channelKeys.length) return 0;
  const ends = channelKeys.map(k => k.split('>'));
  const seen = new Set();
  let best = 0;
  for (let i = 0; i < channelKeys.length; i++) {
    if (seen.has(i)) continue;
    // Flood fill from channel i across any channel sharing a node.
    const stack = [i]; let size = 0;
    while (stack.length) {
      const j = stack.pop();
      if (seen.has(j)) continue;
      seen.add(j); size++;
      const [a, b] = ends[j];
      for (let m = 0; m < channelKeys.length; m++) {
        if (seen.has(m)) continue;
        const [c, d] = ends[m];
        if (a === c || a === d || b === c || b === d) stack.push(m);
      }
    }
    if (size > best) best = size;
  }
  return best;
}

// Who owns a channel: the player with the most dredge markers on it. A tie goes
// to whoever dredged most recently — so a single counter-dredge contests a
// channel but does not flip one someone has invested in twice. Returns null if
// nobody has dredged it. Kept as a function so the rule lives in exactly one
// place; execute() calls it after every dredge to refresh the cached rights[k].
export function channelOwner(g, k) {
  const m = g.markers[k];
  if (!m) return null;
  let best = null, bestN = 0;
  for (const [idx, n] of Object.entries(m)) {
    if (n > bestN) { bestN = n; best = +idx; }
    else if (n === bestN && bestN > 0 && g.mostRecent[k] === +idx) { best = +idx; }
  }
  return bestN > 0 ? best : null;
}

export function seatOrder(g) {
  return g.players.map((_, i) => (g.firstPlayer + i) % g.players.length);
}

// --- Legality -------------------------------------------------------------

// Build-anywhere (Brass-style): you may settle ANY empty node your network can
// reach over living water — not just an immediate neighbour. Water is crossed in
// either direction (you can expand upstream), so a bad opening no longer boxes you
// into one arm of the delta. Distance is paid for (see buildStepCost), so reaching
// across the map costs more and position still matters.
//
// Returns { node, steps } for every reachable empty non-mouth node: a multi-source
// BFS from all your stations, hops crossing depth>0 channels, treated undirected.
// The step count is the shortest hop distance from your nearest station.
export function buildReach(g, p) {
  const owned = new Set(g.players.flatMap(x => x.stations));
  const dist = new Map();
  const queue = [];
  for (const s of p.stations) { dist.set(s, 0); queue.push(s); }
  const out = [];
  while (queue.length) {
    const node = queue.shift();
    const d = dist.get(node);
    const nbrs = [
      ...g.out[node].filter(n => g.depth[chKey(node, n)] > 0),
      ...g.inn[node].filter(n => g.depth[chKey(n, node)] > 0),
    ];
    for (const n of nbrs) {
      if (dist.has(n) || MOUTHS.includes(n)) continue;   // never settle/route a bay
      dist.set(n, d + 1);
      if (!owned.has(n)) out.push({ node: n, steps: d + 1 });
      queue.push(n);
    }
  }
  return out;
}

// Legal build destinations as plain ids — every empty node the network can reach.
export function buildTargets(g, p) {
  return buildReach(g, p).map(t => t.node);
}

// Extra gold for reaching a distant node: the first hop is "adjacent" and free of
// distance premium; each hop beyond costs buildStepGold. Keeps a local build cheap
// and a cross-map build a real investment, so build-anywhere is freedom, not a
// free teleport.
export function buildStepCost(g, p, node) {
  const t = buildReach(g, p).find(x => x.node === node);
  const steps = t ? t.steps : 1;
  return Math.max(0, steps - 1) * TUNING.buildStepGold;
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

// How attainable is contract `c` for player p, right now? Higher is better. A
// contract is only worth its points if p can actually deliver what it asks: the
// right goods, to the bay it names, along a route that still reaches the sea.
// Used to keep the most fulfillable survey card instead of the highest-VP one —
// a big contract you can never complete is worth zero, not its face value.
//
// Pure: reads stations, goods and depth; mutates nothing. Exported so the bot
// auto-keep and a future human hint can share one definition.
export function contractFit(g, p, c) {
  // Which goods can p bring to the sea at all? A station's good counts only if
  // that station still has a navigable route to a bay.
  const reachableGoods = new Set();
  for (const s of p.stations) {
    if (canReachMouth(g, s, TUNING.liveDepthMin)) reachableGoods.add(NODE_BY_ID[s].good);
  }
  // Already-pooled goods at the relevant bay(s) count as progress in hand.
  const bays = c.mouth ? [c.mouth] : MOUTHS;
  let poolBest = 0;
  for (const m of bays) {
    const d = p.pool[m];
    const tot = GOODS.reduce((s, gd) => s + d[gd], 0);
    poolBest = Math.max(poolBest, Math.min(tot, c.need));
  }
  // Kinds requirement: can p even source `types` different goods it can ship?
  const kindsCoverable = Math.min(c.types, reachableGoods.size);
  const kindFactor = c.types ? kindsCoverable / c.types : 1;
  // A contract naming a bay p cannot currently reach is a long shot.
  const mouthReach = c.mouth
    ? (p.stations.some(s => canReachMouth(g, s, TUNING.liveDepthMin)) ? 1 : 0.3)
    : 1;
  // Blend attainability with the reward. An unattainable big card scores low; an
  // attainable one scores near its full value.
  const attain = kindFactor * mouthReach * (0.4 + 0.6 * poolBest / Math.max(1, c.need));
  return c.vp * (0.25 + 0.75 * attain);
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
      // A hukay (shovel) token turns dredge into a power move: it is the ONLY thing that
      // can touch a dead (depth 0) channel — reviving it — and it deepens a living channel
      // harder. It is spent only if the player actually holds one and asked to use it.
      const useHukay = !!(choice?.useHukay && p.hukay > 0);
      if (!k) {
        g.log.push(`${p.name} tried to dredge but had no channel to work on`);
        emit(g, 'fizzle', { pi, action, channel: null });
        return;
      }
      const dead = g.depth[k] <= 0;
      // Without a token: a full channel and a dead channel are both no-ops (nothing to
      // deepen / nothing left to deepen). With a token: a dead channel is the whole point,
      // but a full one is still a waste.
      if (g.depth[k] >= TUNING.maxDepth || (dead && !useHukay)) {
        g.log.push(`${p.name} tried to dredge but had no channel to work on`);
        emit(g, 'fizzle', { pi, action, channel: k });
        return;
      }
      if (p.coins < TUNING.dredgeCoins) {
        g.log.push(`${p.name} cannot afford to dredge`);
        emit(g, 'fizzle', { pi, action, reason: 'coins' });
        return;
      }
      p.coins -= TUNING.dredgeCoins;
      const before = g.depth[k];
      let hukayNote = '';
      if (useHukay) {
        p.hukay -= 1;
        // Dead bed → revive to a foothold; living channel → the bigger bite.
        g.depth[k] = dead
          ? TUNING.hukayReviveTo
          : Math.min(TUNING.maxDepth, g.depth[k] + TUNING.dredgeAmount + TUNING.hukayDredgeBonus);
        hukayNote = dead ? ' — hukay revives a dead channel!' : ' — hukay digs deep';
      } else {
        g.depth[k] = Math.min(TUNING.maxDepth, g.depth[k] + TUNING.dredgeAmount);
      }

      // Leave a marker and recompute ownership from marker counts. Ownership is
      // no longer "whoever dredged last" — it is whoever has the most presence on
      // the channel, so investment sticks. claimed_ is true only when this dredge
      // actually changed the owner, which is what the demo commentary points at.
      let claim = '';
      let claimed_ = false;
      if (TUNING.rightsEnabled) {
        g.markers[k][pi] = (g.markers[k][pi] ?? 0) + 1;
        g.mostRecent[k] = pi;
        const owner = channelOwner(g, k);
        if (owner !== g.rights[k]) {
          claim = owner === pi ? ' — takes the channel' : '';
          claimed_ = owner === pi;
          g.rights[k] = owner;
        }
      }
      const mine = g.markers[k][pi] ?? 0;
      g.log.push(`${p.name} dredges ${k} to depth ${g.depth[k]}, pays ${TUNING.dredgeCoins} gold`
        + `${hukayNote}${claim}${mine > 1 ? ` (${mine} markers)` : ''}`);
      emit(g, 'dredge', {
        pi, channel: k, from: before, to: g.depth[k], claimed: claimed_,
        hukay: useHukay, revived: useHukay && dead,
      });
      break;
    }
    case 'build': {
      const node = choice?.node;
      if (!node) { g.log.push(`${p.name} tried to settle but had nowhere to build`); return; }
      // Distance premium: reaching a far node costs more than an adjacent one.
      const distGold = buildStepCost(g, p, node);
      const cost = buildCost(p) + distGold;
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
      g.log.push(`${p.name} settles ${node} for ${cost} gold`
        + `${distGold ? ` (incl. ${distGold} for distance)` : ''} — it now holds ${g.cubes[node]} goods`);
      emit(g, 'build', { pi, node, cost, distGold, cubesFrom: cubesBefore, cubesTo: g.cubes[node] });
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
      if (g.bayThisRound) g.bayThisRound[o.mouth] += n;
      let pay = n * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel;
      // Claim the neglected-bay premium if it is sitting on this bay. First to
      // ship here takes it; it is then spent for the round.
      let bonus = 0;
      if (g.bayBonus && g.bayBonus.mouth === o.mouth && g.bayBonus.amount > 0) {
        bonus = g.bayBonus.amount;
        pay += bonus;
        g.bayBonus = null;
      }
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
        + `${bonus ? ` (incl. ${bonus} neglected-bay bonus)` : ''}`
        + `${tolls ? `, pays ${tolls} in tolls` : ''}`);
      emit(g, 'ship', {
        pi, path: o.path, from: o.from, mouth: o.mouth, good: o.good,
        cubes: n, pay, tolls: paid, bonus,
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
      // choice.drawn is passed by the human path, which drew the cards first (via
      // surveyDrawnFor) so the player could choose one; bots draw inline and
      // auto-keep the best. Either way the kept card is named in the log — the
      // "keep 1 of 3" decision was happening silently before, and +3 gold was the
      // only visible sign the action did anything.
      const drawn = choice?.drawn
        ?? Array.from({ length: TUNING.surveyDraw }, () => g.deck.pop()).filter(Boolean);
      let keptName = '';
      if (drawn.length) {
        // Bots keep the card they can actually fulfil given their board, not the
        // biggest number — a 30-point contract you can never complete is worthless.
        const keep = choice?.contract
          ?? drawn.slice().sort((a, b) => contractFit(g, p, b) - contractFit(g, p, a))[0];
        if (p.contracts.length < TUNING.handLimit) {
          p.contracts.push(keep);
          keptName = ` — keeps ${Math.round(keep.vp * TUNING.contractScale)}pt ${keep.kind}`;
        } else {
          keptName = ' — but the hand is full, so the draw is discarded';
        }
        for (const c of drawn) if (c !== keep) g.deck.unshift(c);
      }
      // Surveying also hands you a hukay (shovel): a banked, consumable dredge charge you
      // spend later to power-dredge a living channel (+2) or revive a dead one (depth 0 →
      // 1). Capped so tokens can't be hoarded forever. This is the reward that makes
      // Survey a setup move, not just a gold-and-a-card top-up.
      let gotHukay = false;
      if (TUNING.hukayFromSurvey && p.hukay < TUNING.hukayMax) {
        p.hukay += 1;
        gotHukay = true;
      }
      g.log.push(`${p.name} surveys, takes ${TUNING.surveyCoins} gold${keptName}`
        + `${gotHukay ? ` — and earns a hukay (${p.hukay} banked)`
          : (TUNING.hukayFromSurvey ? ' — hukay bank is full' : '')}`);
      emit(g, 'survey', { pi, coins: TUNING.surveyCoins, drew: drawn.length, hukay: p.hukay, gotHukay });
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
  // A small helper so the primary silting and the downstream cascade share one code
  // path for lowering a channel and cleaning up a channel that just died.
  const lower = (k, amount, cause) => {
    const before = g.depth[k];
    g.depth[k] = Math.max(0, g.depth[k] - amount);
    dropped.push({ channel: k, from: before, to: g.depth[k], cause });
    if (g.depth[k] === 0) { g.rights[k] = null; g.markers[k] = {}; g.mostRecent[k] = null; died.push(k); }
  };
  for (const k of hit) {
    if (g.depth[k] > 0) { lower(k, TUNING.siltPerShip, 'ship'); n++; }
  }
  // Cascading Anód (Phase 2): in Habagat, the sediment stirred loose by this sweep
  // rolls one hop downstream. Single non-recursive wave — the downstream targets are
  // computed from the channels that just dropped, and each is lowered at most once, so
  // it can't chain into an avalanche. `cascaded` guards the once-per-sweep cap.
  let cascade = 0;
  if (TUNING.cascadeAnod && seasonOf(g.round) === 'habagat') {
    const cascaded = new Set(dropped.map(d => d.channel));   // don't re-hit a primary drop
    const wave = dropped.filter(d => d.cause === 'ship').map(d => d.channel);
    for (const k of wave) {
      const mid = k.split('>')[1];                           // downstream node of this channel
      for (const nx of (g.out[mid] ?? [])) {
        const dk = chKey(mid, nx);
        if (cascaded.has(dk) || g.depth[dk] <= 0) continue;
        cascaded.add(dk);
        lower(dk, TUNING.cascadeDrop, 'cascade');
        cascade++;
      }
    }
  }
  n += cascade;
  g.log.push(`Silt settles — ${n} ${n === 1 ? "channel loses" : "channels lose"} depth`
    + `${cascade ? ` (${cascade} carried downstream by the flood)` : ''}`);
  const gone = Object.entries(g.depth).filter(([, v]) => v === 0).length;
  if (gone) g.log.push(`  ${gone} ${gone === 1 ? "channel is" : "channels are"} now blocked for good`);
  emit(g, 'silt', { dropped, died, total: gone, cascade });
  g.shippedThisRound = new Set();
}

// The flood (Phase 1). Called once, on the round that begins Habagat, BEFORE that
// round's actions — the rains arrive and the whole delta floods back to life. This is
// the era reset: the drought's one-way silting is wiped clean so era 2 starts from
// fresh high water, which is what keeps the 16-round game from silting to death. With
// floodFull (the default), EVERY channel goes to full depth and every dead one carves
// back open; the partial-flood path (floodRefill/floodRevive) is kept for tuning a
// gentler flood. Stations and dredge-claims are untouched: the flood restores water,
// not settlements, so what you built in the drought carries into the wet season.
//
// A no-op unless seasons are on AND this is the season turn, so the normal per-round
// loop can call it unconditionally at the top of every round. A revived/reflooded
// channel is a fresh contest — owner and markers cleared, like one that silted away —
// so the flood also wipes the drought's dredging claims (the high water is a new race).
export function floodPhase(g) {
  if (!isSeasonTurn(g.round)) return;
  const raised = [], revived = [];
  for (const k of Object.keys(g.depth)) {
    const before = g.depth[k];
    if (TUNING.floodFull) {
      // The rains restore the whole delta. Living channels go to full depth; dead ones
      // carve back open (and, being a fresh channel, shed any old claim).
      if (before === 0) { g.rights[k] = null; g.markers[k] = {}; g.mostRecent[k] = null; }
      g.depth[k] = TUNING.maxDepth;
      if (g.depth[k] !== before) (before === 0 ? revived : raised)
        .push({ channel: k, from: before, to: g.depth[k] });
    } else if (before > 0) {
      g.depth[k] = Math.min(TUNING.maxDepth, before + TUNING.floodRefill);
      if (g.depth[k] !== before) raised.push({ channel: k, from: before, to: g.depth[k] });
    } else if (TUNING.floodRevive && g.rand() < 0.5) {
      g.depth[k] = TUNING.floodReviveTo;
      g.rights[k] = null; g.markers[k] = {}; g.mostRecent[k] = null;
      revived.push({ channel: k, to: g.depth[k] });
    }
  }
  g.log.push(`The Habagat rains arrive — the delta floods back to life: ${raised.length} `
    + `${raised.length === 1 ? 'channel deepens' : 'channels deepen'}`
    + `${revived.length ? `, ${revived.length} carve back open` : ''}`);
  emit(g, 'flood', { raised, revived });
}

// --- The Bagyo (Phase 4) --------------------------------------------------
// A typhoon climax in the wet season. It builds over the last Habagat rounds and makes
// landfall on a fixed, forecastable round, striking one bay's approach and killing
// those channels outright. Everything here is a no-op unless seasons AND bagyo are on.

// The round the storm hits: `bagyoLandfallFromEnd` rounds before the game ends.
export function bagyoLandfallRound() {
  return totalRounds() - TUNING.bagyoLandfallFromEnd;
}

// Which bay the storm targets. Chosen deterministically from the seed so it is fixed
// for a game (a storm has ONE track) and a forecast can name it before it lands.
export function bagyoTarget(g) {
  if (!TUNING.seasons || !TUNING.bagyo) return null;
  return MOUTHS[g.seed % MOUTHS.length];
}

// The channels the storm destroys: the target bay's feeders, and at radius 2 the tier
// feeding those (the L-nodes' inbound channels). Returns living channels only.
export function bagyoChannels(g, mouth) {
  if (!mouth) return [];
  const hit = new Set();
  for (const l of g.inn[mouth]) {
    const k = chKey(l, mouth);
    if (g.depth[k] > 0) hit.add(k);
    if (TUNING.bagyoRadius >= 2) {
      for (const up of g.inn[l]) { const uk = chKey(up, l); if (g.depth[uk] > 0) hit.add(uk); }
    }
  }
  return [...hit];
}

// How many rounds until landfall, or 0 on the landfall round, or null if no storm is
// coming (wrong season/flag, or already past). This is what the forecast and the UI
// countdown read.
export function bagyoCountdown(g) {
  if (!TUNING.seasons || !TUNING.bagyo) return null;
  const land = bagyoLandfallRound();
  if (g.round > land || seasonOf(g.round) !== 'habagat') return null;
  return land - g.round;
}

// The storm phase. Called at the top of each round (like floodPhase). While the bagyo
// is building it just logs the countdown; on the landfall round it destroys the target
// channels outright — depth 0, claims and markers cleared, like any death. A route that
// depended on them has to go around, and there may be no "around" left.
export function bagyoPhase(g) {
  const countdown = bagyoCountdown(g);
  if (countdown === null) return;
  const mouth = bagyoTarget(g);
  if (countdown > 0) {
    g.log.push(`A bagyo is building — landfall at ${mouth} in ${countdown} `
      + `${countdown === 1 ? 'round' : 'rounds'}`);
    emit(g, 'bagyoWarn', { mouth, countdown });
    return;
  }
  // Landfall.
  const killed = bagyoChannels(g, mouth);
  for (const k of killed) {
    g.depth[k] = 0; g.rights[k] = null; g.markers[k] = {}; g.mostRecent[k] = null;
  }
  g.log.push(`The bagyo makes landfall at ${mouth} — ${killed.length} `
    + `${killed.length === 1 ? 'channel is' : 'channels are'} destroyed`);
  emit(g, 'bagyo', { mouth, killed });
}

// The neglected-bay premium. After a round resolves, the bay that received the
// least cargo carries a gold bonus into the next round. On a tie (including the
// common all-zero opening), the tie is broken deterministically by MOUTHS order
// so replays match. Any unclaimed bonus from last round is overwritten — the
// premium is a fresh, single-round pull toward wherever the crowd is NOT going.
export function bayBonusPhase(g) {
  const counts = g.bayThisRound ?? Object.fromEntries(MOUTHS.map(m => [m, 0]));
  let least = MOUTHS[0];
  for (const m of MOUTHS) if (counts[m] < counts[least]) least = m;
  g.bayBonus = { mouth: least, amount: TUNING.bayBonusGold };
  g.bayThisRound = Object.fromEntries(MOUTHS.map(m => [m, 0]));
  g.log.push(`${least} was the quietest bay — it carries a ${TUNING.bayBonusGold} gold `
    + `bonus into next round for the first to ship there`);
  emit(g, 'bayBonus', { mouth: least, amount: TUNING.bayBonusGold, counts });
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
    // Network bonus, Hansa-style: reward a CONNECTED web of owned channels over
    // the same number scattered across the delta. Worth +vpNetworkChannel for
    // every channel in your largest connected run, on top of the flat per-channel
    // held VP — so controlling a corridor beats owning three unrelated tolls.
    const ownedChannels = Object.keys(g.rights).filter(k =>
      g.rights[k] === p.idx && g.depth[k] >= TUNING.rightsDepthMin);
    const netSize = largestNetwork(ownedChannels);
    const netBonus = netSize * TUNING.vpNetworkChannel;
    return { name: p.name, contracts, mouth, network, coin, silt, held, heldCount,
             netSize, netBonus, live, stations: p.stations.length,
             total: contracts + mouth + network + coin + silt + held + netBonus };
  });
}
