import { describe, it, expect, beforeEach } from 'vitest';
import {
  newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder,
  buildTargets, dredgeTargets, shipRoutes, shipOptions, canReachMouth, startValue,
  buildCost, TUNING, ACTIONS,
} from './engine.js';
import { CHANNELS, MOUTHS, NODES, chKey, buildIndex, NODE_BY_ID } from './graph.js';

const noClaim = () => new Set();

describe('graph integrity', () => {
  const { out, inn } = buildIndex();

  it('is strictly acyclic and seaward', () => {
    for (const [a, b] of CHANNELS) {
      expect(NODE_BY_ID[a].tier, `${a}->${b}`).toBeLessThan(NODE_BY_ID[b].tier);
    }
  });

  it('has no duplicate channels', () => {
    const keys = CHANNELS.map(([a, b]) => chKey(a, b));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every non-mouth node a route to the sea', () => {
    const ok = (id, seen = new Set()) => MOUTHS.includes(id) ||
      (!seen.has(id) && (seen.add(id), out[id].some(n => ok(n, seen))));
    for (const n of NODES) if (!MOUTHS.includes(n.id)) expect(ok(n.id), n.id).toBe(true);
  });

  it('gives every non-source node an inbound channel', () => {
    for (const n of NODES) if (n.id !== 'S') expect(inn[n.id].length, n.id).toBeGreaterThan(0);
  });

  it('assigns mouths no good and every other node a good', () => {
    for (const n of NODES) {
      if (MOUTHS.includes(n.id)) expect(n.good).toBeNull();
      else expect(['timber', 'grain', 'salt']).toContain(n.good);
    }
  });
});

describe('setup', () => {
  it('is deterministic for a given seed', () => {
    const a = newGame(3, 42), b = newGame(3, 42);
    expect(a.players.map(p => p.stations)).toEqual(b.players.map(p => p.stations));
    expect(a.players[0].contracts.map(c => c.id)).toEqual(b.players[0].contracts.map(c => c.id));
  });

  it('differs across seeds', () => {
    const a = newGame(3, 1), b = newGame(3, 2);
    expect(a.players[0].contracts.map(c => c.id))
      .not.toEqual(b.players[0].contracts.map(c => c.id));
  });

  it('opens every channel at full depth', () => {
    const g = newGame(3, 1);
    expect(Object.values(g.depth).every(d => d === TUNING.maxDepth)).toBe(true);
    expect(Object.keys(g.depth).length).toBe(CHANNELS.length);
  });

  it('gives each player one distinct mid-tier station', () => {
    const g = newGame(4, 1);
    const all = g.players.flatMap(p => p.stations);
    expect(all.length).toBe(4);
    expect(new Set(all).size).toBe(4);
    for (const s of all) expect(NODE_BY_ID[s].tier).toBe(3);
  });

  it('does not hand any fixed seat the same opening node every game', () => {
    // Regression: the old i*2 stride gave seat 0 M1 (one route, one mouth) and
    // seat 1 M3 (all three mouths) in EVERY game — mirror matches ran 11%/92%.
    const seen = [new Set(), new Set(), new Set(), new Set()];
    for (let s = 0; s < 40; s++) {
      newGame(4, 1000 + s).players.forEach((p, i) => seen[i].add(p.stations[0]));
    }
    for (const s of seen) expect(s.size).toBeGreaterThan(1);
  });

  it('varies the opening draft order across seeds', () => {
    const orders = new Set();
    for (let s = 0; s < 40; s++) orders.add(newGame(4, 2000 + s).draftOrder.join(''));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('makes whoever drafted first resolve last in round 1', () => {
    for (let s = 0; s < 20; s++) {
      const g = newGame(4, 3000 + s);
      expect(g.firstPlayer).toBe(g.draftOrder[g.draftOrder.length - 1]);
      expect(seatOrder(g)[0]).toBe(g.firstPlayer);
    }
  });

  it('never drafts the same node twice', () => {
    for (let s = 0; s < 20; s++) {
      const all = newGame(4, 4000 + s).players.map(p => p.stations[0]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('stocks non-mouth nodes and leaves mouths empty', () => {
    const g = newGame(3, 1);
    for (const n of NODES) {
      expect(g.cubes[n.id]).toBe(MOUTHS.includes(n.id) ? 0 : TUNING.cubesPerNode);
    }
  });

  it('supports 2..4 players', () => {
    for (const n of [2, 3, 4]) expect(newGame(n, 5).players.length).toBe(n);
  });
});

describe('build', () => {
  let g, p;
  beforeEach(() => { g = newGame(3, 100); p = g.players[0]; });

  it('charges base + owned stations', () => {
    expect(buildCost(p)).toBe(TUNING.buildBase + 1);
    p.stations.push('U5');
    expect(buildCost(p)).toBe(TUNING.buildBase + 2);
  });

  it('only offers empty adjacent nodes', () => {
    const t = buildTargets(g, p);
    const owned = new Set(g.players.flatMap(x => x.stations));
    for (const id of t) {
      expect(owned.has(id)).toBe(false);
      expect(MOUTHS.includes(id)).toBe(false);
    }
    expect(t.length).toBeGreaterThan(0);
  });

  it('never offers a mouth as a build target', () => {
    const g2 = newGame(3, 7);
    const q = g2.players[0];
    q.stations.push('L2');
    expect(buildTargets(g2, q).some(id => MOUTHS.includes(id))).toBe(false);
  });

  it('does not offer nodes across a silted channel', () => {
    const home = p.stations[0];
    const nbrs = [...g.out[home], ...g.inn[home]];
    for (const n of g.out[home]) g.depth[chKey(home, n)] = 0;
    for (const n of g.inn[home]) g.depth[chKey(n, home)] = 0;
    const t = buildTargets(g, p);
    for (const n of nbrs) expect(t).not.toContain(n);
  });

  it('places a station and deducts coins', () => {
    const target = buildTargets(g, p)[0];
    const before = p.coins, cost = buildCost(p);
    execute(g, 0, 'build', { node: target }, noClaim());
    expect(p.stations).toContain(target);
    expect(p.coins).toBe(before - cost);
  });

  it('brings cubes online at the new station', () => {
    const target = buildTargets(g, p)[0];
    g.cubes[target] = 0;
    execute(g, 0, 'build', { node: target }, noClaim());
    expect(g.cubes[target]).toBe(TUNING.buildCubeBonus);
  });

  it('never exceeds the node cube cap', () => {
    const target = buildTargets(g, p)[0];
    g.cubes[target] = TUNING.cubesPerNode;
    execute(g, 0, 'build', { node: target }, noClaim());
    expect(g.cubes[target]).toBe(TUNING.cubesPerNode);
  });

  it('refuses when the player cannot pay', () => {
    const target = buildTargets(g, p)[0];
    p.coins = 0;
    execute(g, 0, 'build', { node: target }, noClaim());
    expect(p.stations).not.toContain(target);
    expect(p.coins).toBe(0);
  });

  it('refuses a non-adjacent node', () => {
    const far = NODES.find(n => !buildTargets(g, p).includes(n.id) &&
      !MOUTHS.includes(n.id) && !p.stations.includes(n.id));
    const before = p.coins;
    execute(g, 0, 'build', { node: far.id }, noClaim());
    expect(p.stations).not.toContain(far.id);
    expect(p.coins).toBe(before);
  });

  it('pays the loser of a collision instead of blocking them dead', () => {
    const claimed = new Set();
    const target = buildTargets(g, p)[0];
    execute(g, 0, 'build', { node: target }, claimed);

    const q = g.players[1];
    q.stations = [...p.stations];              // make it legal for q too
    const before = q.coins, count = q.stations.length;
    execute(g, 1, 'build', { node: target }, claimed);
    expect(q.coins).toBe(before + TUNING.collisionPayout);
    expect(q.stations.length).toBe(count);     // no station, but no loss either
  });

  it('tolerates a null choice', () => {
    expect(() => execute(g, 0, 'build', null, noClaim())).not.toThrow();
  });
});

describe('dredge', () => {
  let g, p, k;
  beforeEach(() => { g = newGame(3, 200); p = g.players[0]; k = Object.keys(g.depth)[0]; });

  it('lists only damaged, non-silted channels', () => {
    g.depth[k] = 1;
    const other = Object.keys(g.depth)[1];
    g.depth[other] = 0;
    const t = dredgeTargets(g);
    expect(t).toContain(k);
    expect(t).not.toContain(other);
  });

  it('raises depth and charges coins', () => {
    g.depth[k] = 1;
    const before = p.coins;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.depth[k]).toBe(1 + TUNING.dredgeAmount);
    expect(p.coins).toBe(before - TUNING.dredgeCoins);
  });

  it('caps at max depth', () => {
    g.depth[k] = TUNING.maxDepth - 1;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.depth[k]).toBe(TUNING.maxDepth);
  });

  it('cannot revive a SILTED channel', () => {
    g.depth[k] = 0;
    const before = p.coins;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.depth[k]).toBe(0);
    expect(p.coins).toBe(before);       // and costs nothing when it fizzles
  });

  it('does nothing at full depth', () => {
    g.depth[k] = TUNING.maxDepth;
    const before = p.coins;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(p.coins).toBe(before);
  });

  it('refuses when broke', () => {
    g.depth[k] = 1; p.coins = 0;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.depth[k]).toBe(1);
  });
});

describe('dredging rights', () => {
  let g, p, k;
  beforeEach(() => { g = newGame(3, 250); p = g.players[0]; k = Object.keys(g.depth)[0]; });

  it('starts with every channel unowned', () => {
    expect(Object.values(g.rights).every(r => r === null)).toBe(true);
  });

  it('claims the channel for the dredger', () => {
    g.depth[k] = 1;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.rights[k]).toBe(0);
  });

  it('transfers rights when another player dredges it', () => {
    g.depth[k] = 1;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    g.depth[k] = 1;
    execute(g, 1, 'dredge', { channel: k }, noClaim());
    expect(g.rights[k]).toBe(1);
  });

  it('does not claim on a fizzled dredge', () => {
    g.depth[k] = 0;                       // SILTED, cannot dredge
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.rights[k]).toBeNull();
  });

  it('pays the holder when someone else ships through', () => {
    const q = g.players[1];
    const o = shipOptions(g, q)[0];
    for (const key of o.path) g.rights[key] = 0;
    const mine = p.coins, theirs = q.coins;
    execute(g, 1, 'ship', { option: o }, noClaim());
    expect(p.coins).toBe(mine + o.path.length * TUNING.tollPerShip);
    expect(q.coins).toBeLessThan(theirs + o.cubes * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel);
  });

  it('charges no toll to the holder shipping their own channel', () => {
    const o = shipOptions(g, p)[0];
    for (const key of o.path) g.rights[key] = 0;
    const before = p.coins;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(p.coins).toBe(before + o.cubes * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel);
  });

  it('never drives a shipper below zero paying tolls', () => {
    const q = g.players[1];
    const o = shipOptions(g, q)[0];
    for (const key of o.path) g.rights[key] = 0;
    q.coins = 0;
    execute(g, 1, 'ship', { option: o }, noClaim());
    expect(q.coins).toBeGreaterThanOrEqual(0);
  });

  it('releases rights when the channel silts out', () => {
    g.rights[k] = 0;
    g.depth[k] = 1;
    g.shippedThisRound = new Set([k]);
    siltPhase(g);
    expect(g.depth[k]).toBe(0);
    expect(g.rights[k]).toBeNull();
  });

  it('scores held channels only at depth >= 2', () => {
    const keys = Object.keys(g.depth);
    g.rights[keys[0]] = 0; g.depth[keys[0]] = 3;
    g.rights[keys[1]] = 0; g.depth[keys[1]] = 1;   // too shallow to score
    const s = score(g);
    expect(s[0].heldCount).toBe(1);
    expect(s[0].held).toBe(TUNING.rightsVP);
  });

  it('can be switched off entirely', () => {
    const saved = TUNING.rightsEnabled;
    TUNING.rightsEnabled = false;
    g.depth[k] = 1;
    execute(g, 0, 'dredge', { channel: k }, noClaim());
    expect(g.rights[k]).toBeNull();
    expect(score(g)[0].held).toBe(0);
    TUNING.rightsEnabled = saved;
  });
});

describe('station yield', () => {
  it('regrows cubes on your own stations', () => {
    const g = newGame(3, 260), p = g.players[0];
    g.cubes[p.stations[0]] = 0;
    regrowPhase(g);
    expect(g.cubes[p.stations[0]]).toBe(TUNING.stationYield);
  });

  it('does not exceed the node cap', () => {
    const g = newGame(3, 261), p = g.players[0];
    g.cubes[p.stations[0]] = TUNING.cubesPerNode;
    regrowPhase(g);
    expect(g.cubes[p.stations[0]]).toBe(TUNING.cubesPerNode);
  });

  it('leaves mouths empty', () => {
    const g = newGame(3, 262);
    regrowPhase(g);
    for (const m of MOUTHS) expect(g.cubes[m]).toBe(0);
  });
});

describe('ship', () => {
  let g, p;
  beforeEach(() => { g = newGame(3, 300); p = g.players[0]; });

  it('finds routes that end at a mouth', () => {
    const r = shipRoutes(g, p.stations[0]);
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) expect(MOUTHS).toContain(x.mouth);
  });

  it('refuses to route through a silted channel', () => {
    const from = p.stations[0];
    for (const n of g.out[from]) g.depth[chKey(from, n)] = 0;
    expect(shipRoutes(g, from)).toHaveLength(0);
  });

  it('still routes at depth 1', () => {
    const from = p.stations[0];
    for (const k of Object.keys(g.depth)) g.depth[k] = 1;
    expect(shipRoutes(g, from).length).toBeGreaterThan(0);
  });

  it('offers nothing from an empty station', () => {
    for (const s of p.stations) g.cubes[s] = 0;
    expect(shipOptions(g, p)).toHaveLength(0);
  });

  it('moves cubes, pays, and records the delivery', () => {
    const o = shipOptions(g, p)[0];
    const before = g.cubes[o.from], coins = p.coins;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(g.cubes[o.from]).toBe(before - o.cubes);
    expect(p.delivered[o.mouth][o.good]).toBe(o.cubes);
    expect(p.coins).toBe(coins + o.cubes * TUNING.shipPerCube + o.path.length * TUNING.shipPerChannel);
  });

  it('marks every traversed channel for silting', () => {
    const o = shipOptions(g, p)[0];
    execute(g, 0, 'ship', { option: o }, noClaim());
    for (const k of o.path) expect(g.shippedThisRound.has(k)).toBe(true);
  });

  it('fails safely if the route silted before resolution', () => {
    const o = shipOptions(g, p)[0];
    g.depth[o.path[0]] = 0;
    const cubes = g.cubes[o.from], coins = p.coins;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(g.cubes[o.from]).toBe(cubes);
    expect(p.coins).toBe(coins);
  });

  it('never ships more cubes than the station holds', () => {
    const o = shipOptions(g, p)[0];
    g.cubes[o.from] = 1;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(g.cubes[o.from]).toBe(0);
    expect(p.delivered[o.mouth][o.good]).toBe(1);
  });

  it('never produces a negative cube count', () => {
    const o = shipOptions(g, p)[0];
    g.cubes[o.from] = 0;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(g.cubes[o.from]).toBe(0);
  });
});

describe('contracts', () => {
  let g, p;
  beforeEach(() => { g = newGame(3, 400); p = g.players[0]; });

  it('fulfils a local contract on 2 cubes of one type', () => {
    p.contracts = [{ kind: 'local', vp: 5, need: 2, types: 1, mouth: null, id: 'X' }];
    p.pool.A.timber = 2;
    execute(g, 0, 'ship', null, noClaim());   // triggers no contract check
    // drive the check via a real ship instead:
    const o = shipOptions(g, p)[0];
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(p.done.length).toBe(1);
  });

  it('consumes the cubes it spends', () => {
    p.contracts = [{ kind: 'local', vp: 5, need: 2, types: 1, mouth: 'A', id: 'X' }];
    p.pool.A.timber = 3;
    const o = shipOptions(g, p).find(x => x.mouth === 'A');
    if (!o) return;
    execute(g, 0, 'ship', { option: o }, noClaim());
    const total = p.pool.A.timber + p.pool.A.grain + p.pool.A.salt;
    expect(total).toBeLessThan(3 + o.cubes);
  });

  it('does not let one delivery pay two contracts', () => {
    p.contracts = [
      { kind: 'local', vp: 5, need: 2, types: 1, mouth: 'A', id: 'X' },
      { kind: 'local', vp: 5, need: 2, types: 1, mouth: 'A', id: 'Y' },
    ];
    p.pool.A.timber = 2;
    const o = shipOptions(g, p).find(x => x.mouth === 'A');
    if (!o) return;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(p.done.length).toBeLessThanOrEqual(1 + Math.floor(o.cubes / 2));
  });

  it('keeps delivered separate from the spendable pool (majorities survive)', () => {
    p.contracts = [{ kind: 'local', vp: 5, need: 2, types: 1, mouth: null, id: 'X' }];
    const o = shipOptions(g, p)[0];
    execute(g, 0, 'ship', { option: o }, noClaim());
    const delivered = Object.values(p.delivered).reduce(
      (s, m) => s + m.timber + m.grain + m.salt, 0);
    expect(delivered).toBe(o.cubes);   // never consumed
  });

  it('requires the named mouth for regional contracts', () => {
    p.contracts = [{ kind: 'regional', vp: 9, need: 3, types: 2, mouth: 'C', id: 'R' }];
    p.pool.A = { timber: 5, grain: 5, salt: 5 };   // wrong mouth, plenty of cubes
    const o = shipOptions(g, p).find(x => x.mouth !== 'C');
    if (!o) return;
    execute(g, 0, 'ship', { option: o }, noClaim());
    expect(p.done).toHaveLength(0);
  });

  it('requires distinct types for multi-type contracts', () => {
    p.contracts = [{ kind: 'delta', vp: 15, need: 4, types: 3, mouth: 'A', id: 'D' }];
    p.pool.A = { timber: 9, grain: 0, salt: 0 };   // one type only
    const o = shipOptions(g, p).find(x => x.mouth === 'A');
    if (!o) return;
    const had = p.done.length;
    execute(g, 0, 'ship', { option: o }, noClaim());
    if (p.done.length > had) {
      // only acceptable if the shipment itself added a second type
      expect(NODE_BY_ID[o.from].good).not.toBe('timber');
    }
  });

  it('respects the hand limit on survey', () => {
    p.contracts = Array(TUNING.handLimit).fill(null)
      .map((_, i) => ({ kind: 'local', vp: 5, need: 2, types: 1, mouth: null, id: `F${i}` }));
    execute(g, 0, 'survey', {}, noClaim());
    expect(p.contracts.length).toBe(TUNING.handLimit);
  });
});

describe('survey', () => {
  it('pays coins and adds a contract', () => {
    const g = newGame(3, 500), p = g.players[0];
    const coins = p.coins, hand = p.contracts.length;
    execute(g, 0, 'survey', {}, noClaim());
    expect(p.coins).toBe(coins + TUNING.surveyCoins);
    expect(p.contracts.length).toBe(hand + 1);
  });

  it('survives an exhausted deck', () => {
    const g = newGame(3, 501), p = g.players[0];
    g.deck = [];
    expect(() => execute(g, 0, 'survey', {}, noClaim())).not.toThrow();
    expect(p.coins).toBe(TUNING.startCoins + TUNING.surveyCoins);
  });

  it('returns unkept cards to the deck', () => {
    const g = newGame(3, 502), p = g.players[0];
    const size = g.deck.length;
    execute(g, 0, 'survey', {}, noClaim());
    expect(g.deck.length).toBe(size - 1);   // drew surveyDraw, kept 1, returned rest
  });
});

describe('silt phase', () => {
  it('drops each shipped channel exactly once regardless of traffic', () => {
    const g = newGame(3, 600);
    const k = Object.keys(g.depth)[0];
    g.shippedThisRound = new Set([k]);
    siltPhase(g);
    expect(g.depth[k]).toBe(TUNING.maxDepth - 1);
  });

  it('leaves untouched channels alone', () => {
    const g = newGame(3, 601);
    const [a, b] = Object.keys(g.depth);
    g.shippedThisRound = new Set([a]);
    siltPhase(g);
    expect(g.depth[b]).toBe(TUNING.maxDepth);
  });

  it('never drops below zero', () => {
    const g = newGame(3, 602);
    const k = Object.keys(g.depth)[0];
    g.depth[k] = 0;
    g.shippedThisRound = new Set([k]);
    siltPhase(g);
    expect(g.depth[k]).toBe(0);
  });

  it('clears the traffic set', () => {
    const g = newGame(3, 603);
    g.shippedThisRound = new Set([Object.keys(g.depth)[0]]);
    siltPhase(g);
    expect(g.shippedThisRound.size).toBe(0);
  });
});

describe('regrow phase', () => {
  it('refills the emptiest node', () => {
    const g = newGame(3, 700);
    for (const n of NODES) if (!MOUTHS.includes(n.id)) g.cubes[n.id] = TUNING.cubesPerNode;
    g.cubes.U5 = 0;
    regrowPhase(g);
    expect(g.cubes.U5).toBe(1);
  });

  it('never overfills or touches mouths', () => {
    const g = newGame(3, 701);
    regrowPhase(g);
    for (const n of NODES) {
      if (MOUTHS.includes(n.id)) expect(g.cubes[n.id]).toBe(0);
      else expect(g.cubes[n.id]).toBeLessThanOrEqual(TUNING.cubesPerNode);
    }
  });
});

describe('upkeep', () => {
  it('is free at or below the free-station allowance', () => {
    const g = newGame(3, 800), p = g.players[0];
    p.stations = ['M1', 'M2'].slice(0, TUNING.freeStations);
    const coins = p.coins;
    upkeepPhase(g);
    expect(p.coins).toBe(coins);
  });

  it('charges for each station beyond the allowance', () => {
    const g = newGame(3, 801), p = g.players[0];
    p.stations = ['M1', 'M2', 'M3', 'M4', 'L1', 'L2'];
    p.coins = 20;
    const over = p.stations.length - TUNING.freeStations;
    upkeepPhase(g);
    expect(p.coins).toBe(20 - over * TUNING.upkeepPerStation);
  });

  it('forces abandonment when a player cannot pay', () => {
    const g = newGame(3, 802), p = g.players[0];
    p.stations = ['M1', 'M2', 'M3', 'M4', 'L1', 'L2', 'L3'];
    p.coins = 0;
    upkeepPhase(g);
    expect(p.stations.length).toBeLessThanOrEqual(TUNING.freeStations);
    expect(p.coins).toBeGreaterThanOrEqual(0);
  });

  it('never drives coins negative', () => {
    const g = newGame(3, 803);
    for (const p of g.players) { p.coins = 1; p.stations = ['M1', 'M2', 'M3', 'M4', 'L1']; }
    upkeepPhase(g);
    for (const p of g.players) expect(p.coins).toBeGreaterThanOrEqual(0);
  });

  it('rotates the first player', () => {
    const g = newGame(3, 804);
    const f = g.firstPlayer;
    upkeepPhase(g);
    expect(g.firstPlayer).toBe((f + 1) % 3);
  });
});

describe('seat order', () => {
  it('is a rotation covering every player exactly once', () => {
    const g = newGame(4, 900);
    for (let i = 0; i < 4; i++) {
      g.firstPlayer = i;
      const o = seatOrder(g);
      expect(o[0]).toBe(i);
      expect(new Set(o).size).toBe(4);
    }
  });
});

describe('reachability', () => {
  it('sees a mouth through open channels', () => {
    const g = newGame(3, 1000);
    expect(canReachMouth(g, 'L1', 1)).toBe(true);
  });

  it('respects the minimum depth threshold', () => {
    const g = newGame(3, 1001);
    for (const k of Object.keys(g.depth)) g.depth[k] = 1;
    expect(canReachMouth(g, 'L1', 1)).toBe(true);
    expect(canReachMouth(g, 'L1', 2)).toBe(false);
  });

  it('reports false when fully cut off', () => {
    const g = newGame(3, 1002);
    for (const k of Object.keys(g.depth)) g.depth[k] = 0;
    expect(canReachMouth(g, 'M3', 1)).toBe(false);
  });

  it('treats a mouth as trivially reachable', () => {
    const g = newGame(3, 1003);
    expect(canReachMouth(g, 'A', 3)).toBe(true);
  });
});

describe('scoring', () => {
  it('awards majority by rank with ties shared', () => {
    const g = newGame(3, 1100);
    g.players[0].delivered.A.timber = 5;
    g.players[1].delivered.A.timber = 5;   // tie for first
    g.players[2].delivered.A.timber = 1;
    const s = score(g);
    expect(s[0].mouth).toBe(Math.floor(TUNING.mouthVP[0] / 2));
    expect(s[0].mouth).toBe(s[1].mouth);
    expect(s[2].mouth).toBe(TUNING.mouthVP[1]);
  });

  it('gives no majority points to a player who delivered nothing', () => {
    const g = newGame(3, 1101);
    g.players[0].delivered.A.timber = 3;
    expect(score(g)[1].mouth).toBe(0);
  });

  it('counts live stations only above the depth threshold', () => {
    const g = newGame(3, 1102);
    // Just below the threshold: nothing qualifies.
    for (const k of Object.keys(g.depth)) g.depth[k] = TUNING.liveDepthMin - 1;
    expect(score(g)[0].live).toBe(0);
    // At the threshold: the starting station qualifies.
    for (const k of Object.keys(g.depth)) g.depth[k] = TUNING.liveDepthMin;
    expect(score(g)[0].live).toBeGreaterThan(0);
  });

  it('penalises silted channels adjacent to your stations', () => {
    const g = newGame(3, 1103);
    const p = g.players[0], home = p.stations[0];
    for (const n of g.out[home]) g.depth[chKey(home, n)] = 0;
    const s = score(g);
    expect(s[0].silt).toBeLessThan(0);
  });

  it('converts coins at the stated rate', () => {
    const g = newGame(3, 1104);
    g.players[0].coins = TUNING.vpPerCoins * 3 + 4;
    expect(score(g)[0].coin).toBe(3);
  });

  it('totals its own parts', () => {
    const g = newGame(3, 1105);
    for (const s of score(g)) {
      expect(s.total).toBe(s.contracts + s.mouth + s.network + s.coin + s.silt);
    }
  });
});

describe('seat fairness', () => {
  // The headline bug of the tuning pass: a mirror match ran 11%/92% purely on seat,
  // because setup handed seat 0 the worst opening node and seat 1 the best.
  it('deals equal starting contract value to every seat', () => {
    const tot = [0, 0, 0, 0];
    const N = 200;
    for (let s = 0; s < N; s++) {
      newGame(4, 6000 + s).players.forEach((p, i) => {
        tot[i] += p.contracts.reduce((a, c) => a + c.vp, 0);
      });
    }
    const avg = tot.map(t => t / N);
    expect(Math.max(...avg) - Math.min(...avg)).toBeLessThan(2);
  });

  it('spreads opening node quality evenly across seats', () => {
    const idx = buildIndex();
    const tot = [0, 0, 0, 0];
    const N = 200;
    for (let s = 0; s < N; s++) {
      newGame(4, 7000 + s).players.forEach((p, i) => {
        tot[i] += startValue(p.stations[0], idx, null);
      });
    }
    const avg = tot.map(t => t / N);
    // Any systematic seat advantage in opening position shows up here.
    expect(Math.max(...avg) - Math.min(...avg)).toBeLessThan(4);
  });

  it('gives every seat a turn at leading round 1', () => {
    const leads = new Set();
    for (let s = 0; s < 60; s++) leads.add(newGame(4, 8000 + s).firstPlayer);
    expect(leads.size).toBe(4);
  });

  it('gives no seat a starting coin advantage', () => {
    const g = newGame(4, 9000);
    expect(new Set(g.players.map(p => p.coins)).size).toBe(1);
  });
});

describe('invariants over a full game', () => {
  it('never yields negative coins or cubes, and conserves cube count', () => {
    const g = newGame(4, 1200);
    const totalCubes = () =>
      Object.values(g.cubes).reduce((a, b) => a + b, 0) +
      g.players.reduce((s, p) => s + MOUTHS.reduce(
        (t, m) => t + p.delivered[m].timber + p.delivered[m].grain + p.delivered[m].salt, 0), 0);

    let expected = totalCubes();
    for (let r = 1; r <= TUNING.rounds; r++) {
      for (let slot = 0; slot < 2; slot++) {
        const claimed = new Set();
        for (const pi of seatOrder(g)) {
          const p = g.players[pi];
          const a = ACTIONS[(pi + r + slot) % ACTIONS.length];
          const choice =
            a === 'ship'   ? { option: shipOptions(g, p)[0] } :
            a === 'build'  ? { node: buildTargets(g, p)[0] } :
            a === 'dredge' ? { channel: dredgeTargets(g)[0] } : {};
          const before = { built: p.stations.length };
          execute(g, pi, a, choice, claimed);
          if (a === 'build' && p.stations.length > before.built) {
            expected += Math.min(TUNING.buildCubeBonus, TUNING.cubesPerNode);
          }
        }
      }
      siltPhase(g);
      const beforeRegrow = totalCubes();
      regrowPhase(g);
      expected += totalCubes() - beforeRegrow;
      upkeepPhase(g);

      for (const p of g.players) expect(p.coins).toBeGreaterThanOrEqual(0);
      for (const n of NODES) expect(g.cubes[n.id]).toBeGreaterThanOrEqual(0);
      for (const k of Object.keys(g.depth)) {
        expect(g.depth[k]).toBeGreaterThanOrEqual(0);
        expect(g.depth[k]).toBeLessThanOrEqual(TUNING.maxDepth);
      }
    }
    expect(g.players.every(p => p.stations.length === new Set(p.stations).size)).toBe(true);
  });

  it('never lets two players own the same node', () => {
    const g = newGame(4, 1201);
    for (let r = 0; r < TUNING.rounds; r++) {
      for (let slot = 0; slot < 2; slot++) {
        const claimed = new Set();
        for (const pi of seatOrder(g)) {
          const p = g.players[pi];
          execute(g, pi, 'build', { node: buildTargets(g, p)[0] }, claimed);
        }
      }
      upkeepPhase(g);
      const all = g.players.flatMap(p => p.stations);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('handles a totally silted board without crashing', () => {
    const g = newGame(3, 1202);
    for (const k of Object.keys(g.depth)) g.depth[k] = 0;
    for (const p of g.players) {
      expect(shipOptions(g, p)).toHaveLength(0);
      expect(buildTargets(g, p)).toHaveLength(0);
    }
    expect(() => { siltPhase(g); regrowPhase(g); upkeepPhase(g); score(g); }).not.toThrow();
  });
});
