import { describe, it, expect, afterEach } from 'vitest';
import {
  newGame, execute, siltPhase, floodPhase, bayBonusPhase, regrowPhase, upkeepPhase, seatOrder,
  score, totalRounds, seasonOf, isSeasonTurn, forecastCascade, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { chKey } from './graph.js';
// Importing setSearchOptions also runs mcts.js for its side effect (registering the
// `mcts` strategy with ai.js), so the integration game below can use the search bot.
import { setSearchOptions } from './mcts.js';

// Drive a full headless game the way sim.mjs does, refreshing g.season each round.
// Returns the number of rounds actually played and the set of seasons observed.
function playHeadless(strats, seed) {
  const g = newGame(strats.length, seed);
  g.players.forEach((p, i) => { p.strat = strats[i]; });
  const seasonsSeen = new Set();
  let rounds = 0;
  for (g.round = 1; g.round <= totalRounds(); g.round++) {
    g.season = seasonOf(g.round);
    floodPhase(g);
    seasonsSeen.add(g.season);
    rounds++;
    for (const p of g.players) p.program = STRATEGIES[p.strat](g, p);
    for (let slot = 0; slot < 2; slot++) {
      const claimed = new Set();
      for (const pi of seatOrder(g)) {
        const p = g.players[pi];
        const a = p.program[slot];
        if (a) execute(g, pi, a, chooseTarget(g, p, a, p.strat) ?? {}, claimed);
      }
    }
    siltPhase(g); bayBonusPhase(g); regrowPhase(g); upkeepPhase(g);
  }
  return { rounds, seasonsSeen, scores: score(g) };
}

// Phase 0 of the two-season (Taon) work adds ONLY plumbing: a flag, a length helper,
// and season derivation. The contract these tests pin down is precisely that it is
// plumbing — with the flag off, nothing about game length or season changes; with it
// on, the math is exactly two halves and the derivation has no off-by-one at the seams.
//
// TUNING is module-global and mutable, so every test that flips a flag MUST restore it
// or it leaks into the other suites (which assume the shipped defaults). afterEach
// snapshots and restores the three knobs these tests touch.

const SEASON_KEYS = ['seasons', 'roundsPerSeason', 'rounds'];

describe('season plumbing (Phase 0)', () => {
  let saved;
  const snapshot = () => { saved = Object.fromEntries(SEASON_KEYS.map(k => [k, TUNING[k]])); };
  afterEach(() => { if (saved) for (const k of SEASON_KEYS) TUNING[k] = saved[k]; });

  describe('flag OFF — must be byte-identical to the single-season game', () => {
    it('totalRounds() equals TUNING.rounds regardless of roundsPerSeason', () => {
      snapshot();
      TUNING.seasons = false;
      TUNING.rounds = 8;
      // roundsPerSeason must have ZERO effect while the flag is off.
      TUNING.roundsPerSeason = 6;
      expect(totalRounds()).toBe(8);
      TUNING.roundsPerSeason = 99;
      expect(totalRounds()).toBe(8);
    });

    it('respects a non-default TUNING.rounds (the UI sets this from config)', () => {
      snapshot();
      TUNING.seasons = false;
      TUNING.rounds = 10;
      expect(totalRounds()).toBe(10);
    });

    it('seasonOf() is always amihan, even past the old round count', () => {
      snapshot();
      TUNING.seasons = false;
      for (const r of [1, 4, 8, 12, 100, -3, 0]) {
        expect(seasonOf(r), `round ${r}`).toBe('amihan');
      }
    });

    it('isSeasonTurn() is never true', () => {
      snapshot();
      TUNING.seasons = false;
      TUNING.roundsPerSeason = 6;
      for (const r of [1, 6, 7, 8, 12]) expect(isSeasonTurn(r), `round ${r}`).toBe(false);
    });

    it('newGame stamps season amihan on the initial state', () => {
      snapshot();
      TUNING.seasons = false;
      const g = newGame(3, 1);
      expect(g.season).toBe('amihan');
    });
  });

  describe('flag ON — two halves, exact seams', () => {
    it('totalRounds() is exactly two seasons long', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      expect(totalRounds()).toBe(12);
      TUNING.roundsPerSeason = 8;
      expect(totalRounds()).toBe(16);
      // odd / asymmetric-looking values still just double — no rounding surprises
      TUNING.roundsPerSeason = 5;
      expect(totalRounds()).toBe(10);
    });

    it('totalRounds() ignores TUNING.rounds when seasons are on', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.rounds = 8;                 // stale single-season value must not leak in
      expect(totalRounds()).toBe(12);
    });

    it('seasonOf() splits at the exact boundary with no off-by-one', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      // Amihan is rounds 1..6 inclusive; Habagat begins at 7.
      expect(seasonOf(1)).toBe('amihan');
      expect(seasonOf(6)).toBe('amihan');   // last dry round
      expect(seasonOf(7)).toBe('habagat');  // first wet round
      expect(seasonOf(12)).toBe('habagat'); // last round of the game
    });

    it('isSeasonTurn() fires on exactly one round — the first wet round', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const turns = [];
      for (let r = 1; r <= 12; r++) if (isSeasonTurn(r)) turns.push(r);
      expect(turns).toEqual([7]);
    });

    it('the season turn is the boundary between amihan and habagat', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const turn = 7;
      expect(isSeasonTurn(turn)).toBe(true);
      expect(seasonOf(turn - 1)).toBe('amihan');
      expect(seasonOf(turn)).toBe('habagat');
    });

    it('a length-1 season still has a clean single-round boundary', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 1;
      expect(totalRounds()).toBe(2);
      expect(seasonOf(1)).toBe('amihan');
      expect(seasonOf(2)).toBe('habagat');
      expect(isSeasonTurn(2)).toBe(true);
      expect(isSeasonTurn(1)).toBe(false);
    });
  });

  describe('cross-cutting invariants (hold for both flag states)', () => {
    it('seasonOf never returns a value outside the two known seasons', () => {
      snapshot();
      for (const flag of [false, true]) {
        TUNING.seasons = flag;
        TUNING.roundsPerSeason = 6;
        for (let r = 0; r <= 20; r++) {
          expect(['amihan', 'habagat']).toContain(seasonOf(r));
        }
      }
    });

    it('every round of a full game maps to a valid season', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const N = totalRounds();
      const seen = new Set();
      for (let r = 1; r <= N; r++) seen.add(seasonOf(r));
      // A real two-season game must actually visit BOTH seasons — a plumbing bug that
      // collapsed everything to one season would still "map to a valid season" above,
      // so assert both are reached.
      expect([...seen].sort()).toEqual(['amihan', 'habagat']);
    });

    it('exactly one season turn exists across a full game', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      let count = 0;
      for (let r = 1; r <= totalRounds(); r++) if (isSeasonTurn(r)) count++;
      expect(count).toBe(1);
    });
  });

  // The whole promise of Phase 0: it changes the plumbing, not the game. These play
  // real games end to end and assert length + season behaviour — the integration proof
  // that flag-off is the old game and flag-on is exactly twice as long.
  describe('full-game integration', () => {
    it('flag OFF plays exactly TUNING.rounds rounds, all amihan, no season turn', () => {
      snapshot();
      TUNING.seasons = false;
      TUNING.rounds = 8;
      const { rounds, seasonsSeen } = playHeadless(['balanced', 'balanced', 'balanced'], 4321);
      expect(rounds).toBe(8);
      expect([...seasonsSeen]).toEqual(['amihan']);
    });

    it('flag ON plays two full seasons and visits both', () => {
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const { rounds, seasonsSeen } = playHeadless(['balanced', 'balanced', 'balanced'], 4321);
      expect(rounds).toBe(12);
      expect([...seasonsSeen].sort()).toEqual(['amihan', 'habagat']);
    });

    it('the mcts bot completes a full seasons-on game without error', { timeout: 20000 }, () => {
      // Phase 0 gives the wet season no distinct rules yet, but the bot's rollout loop
      // now runs to totalRounds() and refreshes g.season — this guards that plumbing:
      // a rollout that stopped at round 8 (old TUNING.rounds) or choked on the season
      // field would throw or mis-score here. A tiny fixed rollout budget keeps the test
      // fast and deterministic; we assert completion + finite scores, not strength.
      snapshot();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      setSearchOptions({ rollouts: 12 });
      try {
        const { rounds, scores } = playHeadless(['mcts', 'balanced', 'balanced'], 4321);
        expect(rounds).toBe(12);
        expect(scores).toHaveLength(3);
        for (const s of scores) expect(Number.isFinite(s.total)).toBe(true);
      } finally {
        setSearchOptions({ rollouts: 140 });   // restore the shipped default
      }
    });
  });

  // Phase 1 — the flood. floodPhase() fires once, on the season turn, and refills the
  // delta while leaving settlements and claims alone. These pin every part of that
  // contract, including the parts that are easy to get subtly wrong: it must be inert
  // off the turn, cap at maxDepth, and never touch what a player built.
  describe('the flood (Phase 1)', () => {
    const SEASON_KEYS = ['seasons', 'roundsPerSeason', 'rounds', 'floodRefill', 'floodRevive'];
    let saved;
    const snap = () => { saved = Object.fromEntries(SEASON_KEYS.map(k => [k, TUNING[k]])); };
    afterEach(() => { if (saved) for (const k of SEASON_KEYS) TUNING[k] = saved[k]; });

    // Build a game parked on a chosen round with a known depth landscape.
    const atRound = (round, seed = 55) => {
      const g = newGame(3, seed);
      g.round = round;
      g.season = seasonOf(round);
      return g;
    };

    it('is a no-op when seasons are off, even on the would-be turn round', () => {
      snap();
      TUNING.seasons = false;
      TUNING.roundsPerSeason = 6;
      const g = atRound(7);
      const k = Object.keys(g.depth)[0];
      g.depth[k] = 1;
      floodPhase(g);
      expect(g.depth[k]).toBe(1);          // untouched
    });

    it('does nothing on a non-turn round even with seasons on', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      for (const r of [1, 6, 8, 12]) {     // every round EXCEPT the turn (7)
        const g = atRound(r);
        const k = Object.keys(g.depth)[0];
        g.depth[k] = 1;
        floodPhase(g);
        expect(g.depth[k], `round ${r}`).toBe(1);
      }
    });

    it('refills living channels by floodRefill on the turn, capped at maxDepth', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.floodRefill = 2;
      const g = atRound(7);
      const keys = Object.keys(g.depth);
      g.depth[keys[0]] = 1;                 // will rise to 3
      g.depth[keys[1]] = 2;                 // 2 + 2 = 4, but capped at maxDepth (3)
      g.depth[keys[2]] = TUNING.maxDepth;   // already max, stays
      floodPhase(g);
      expect(g.depth[keys[0]]).toBe(Math.min(TUNING.maxDepth, 3));
      expect(g.depth[keys[1]]).toBe(TUNING.maxDepth);
      expect(g.depth[keys[2]]).toBe(TUNING.maxDepth);
    });

    it('never pushes any channel past maxDepth', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.floodRefill = 5;               // deliberately huge
      const g = atRound(7);
      floodPhase(g);
      for (const k of Object.keys(g.depth)) {
        expect(g.depth[k]).toBeLessThanOrEqual(TUNING.maxDepth);
      }
    });

    it('leaves stations and dredge-claims untouched — you keep what you built', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const g = atRound(7);
      // Give player 0 a claimed, living channel and record station list.
      const k = Object.keys(g.depth).find(key => g.depth[key] > 0);
      g.rights[k] = 0;
      g.markers[k] = { 0: 2 };
      const stationsBefore = g.players.map(p => [...p.stations]);
      floodPhase(g);
      // Rights on a channel that stayed alive persist across the flood.
      expect(g.rights[k]).toBe(0);
      expect(g.markers[k]).toEqual({ 0: 2 });
      g.players.forEach((p, i) => expect(p.stations).toEqual(stationsBefore[i]));
    });

    it('a revived dead channel is a fresh contest — no owner, no markers', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.floodRevive = true;
      // Kill every channel, so any revive is observable, and stamp stale ownership
      // that MUST be cleared if the channel comes back.
      const g = atRound(7);
      for (const k of Object.keys(g.depth)) {
        g.depth[k] = 0; g.rights[k] = 1; g.markers[k] = { 1: 3 }; g.mostRecent[k] = 1;
      }
      floodPhase(g);
      for (const k of Object.keys(g.depth)) {
        if (g.depth[k] > 0) {               // revived
          expect(g.rights[k], `revived ${k} owner`).toBeNull();
          expect(g.markers[k], `revived ${k} markers`).toEqual({});
          expect(g.mostRecent[k]).toBeNull();
        }
      }
    });

    it('with revive off, dead channels stay dead through the flood', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.floodRevive = false;
      const g = atRound(7);
      const dead = Object.keys(g.depth).slice(0, 3);
      for (const k of dead) g.depth[k] = 0;
      floodPhase(g);
      for (const k of dead) expect(g.depth[k]).toBe(0);
    });

    it('is deterministic: same seed reproduces the same revive outcome', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      TUNING.floodRevive = true;
      const run = () => {
        const g = atRound(7, 4242);
        for (const k of Object.keys(g.depth)) g.depth[k] = 0;   // all dead
        floodPhase(g);
        return Object.keys(g.depth).filter(k => g.depth[k] > 0).sort();
      };
      expect(run()).toEqual(run());
    });

    it('emits a single flood event carrying the raised/revived channels', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const g = atRound(7);
      g.events = [];
      floodPhase(g);
      const floods = g.events.filter(e => e.type === 'flood');
      expect(floods).toHaveLength(1);
      expect(Array.isArray(floods[0].raised)).toBe(true);
      expect(Array.isArray(floods[0].revived)).toBe(true);
    });

    it('in a full seasons-on game, average depth is higher just after the turn than just before', () => {
      snap();
      TUNING.seasons = true;
      TUNING.roundsPerSeason = 6;
      const g = newGame(3, 2024);
      g.players.forEach((p) => { p.strat = 'balanced'; });
      const avg = () => {
        const v = Object.values(g.depth);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      let before = null, after = null;
      for (g.round = 1; g.round <= totalRounds(); g.round++) {
        g.season = seasonOf(g.round);
        if (isSeasonTurn(g.round)) before = avg();
        floodPhase(g);
        if (before !== null && after === null) after = avg();
        for (const p of g.players) p.program = STRATEGIES[p.strat](g, p);
        for (let slot = 0; slot < 2; slot++) {
          const claimed = new Set();
          for (const pi of seatOrder(g)) {
            const p = g.players[pi];
            const a = p.program[slot];
            if (a) execute(g, pi, a, chooseTarget(g, p, a, p.strat) ?? {}, claimed);
          }
        }
        siltPhase(g); bayBonusPhase(g); regrowPhase(g); upkeepPhase(g);
      }
      expect(before).not.toBeNull();
      expect(after).toBeGreaterThan(before);   // the rains actually raised the water
    });
  });

  // Phase 2 — Cascading Anód. In Habagat, a channel that silts drags its DOWNSTREAM
  // neighbours down one hop, as a single non-recursive wave. These pin the season
  // gate, the direction (downstream only), the no-avalanche cap, and the political
  // consequence (someone else's ship can silt YOUR channel).
  describe('cascading anod (Phase 2)', () => {
    const KEYS = ['seasons', 'roundsPerSeason', 'rounds', 'cascadeAnod', 'cascadeDrop', 'siltPerShip'];
    let saved;
    const snap = () => { saved = Object.fromEntries(KEYS.map(k => [k, TUNING[k]])); };
    afterEach(() => { if (saved) for (const k of KEYS) TUNING[k] = saved[k]; });

    // Ship a single channel `k` in the given season and return the silt event.
    const siltAfterShipping = (k, round, season) => {
      const g = newGame(3, 5);
      g.round = round; g.season = season;
      g.shippedThisRound = new Set([k]);
      g.events = [];
      siltPhase(g);
      return { g, ev: g.events.find(e => e.type === 'silt') };
    };
    // A non-mouth channel with at least one downstream channel, for cascade tests.
    const upstreamKey = () => {
      const g = newGame(3, 5);
      return Object.keys(g.depth).find(k => {
        const mid = k.split('>')[1];
        return (g.out[mid] ?? []).length > 0;
      });
    };

    it('does NOT cascade in Amihan', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = true;
      const { ev } = siltAfterShipping(upstreamKey(), 3, 'amihan');
      expect(ev.cascade).toBe(0);
      expect(ev.dropped.every(d => d.cause === 'ship')).toBe(true);
    });

    it('does NOT cascade when the flag is off, even in Habagat', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = false;
      const { ev } = siltAfterShipping(upstreamKey(), 8, 'habagat');
      expect(ev.cascade).toBe(0);
    });

    it('cascades one hop downstream in Habagat', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = true;
      const k = upstreamKey();
      const { g, ev } = siltAfterShipping(k, 8, 'habagat');
      const mid = k.split('>')[1];
      const expected = g.out[mid].map(x => chKey(mid, x));
      const cascadedChannels = ev.dropped.filter(d => d.cause === 'cascade').map(d => d.channel);
      expect(ev.cascade).toBe(expected.length);
      expect(cascadedChannels.sort()).toEqual(expected.sort());
    });

    it('cascade only ever goes downstream, never back upstream', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = true;
      const k = upstreamKey();
      const [a] = k.split('>');
      const { ev } = siltAfterShipping(k, 8, 'habagat');
      // No cascaded channel may end at the shipped channel's SOURCE node (that would be
      // upstream flow). Downstream channels start at the shipped channel's mid node.
      for (const d of ev.dropped.filter(x => x.cause === 'cascade')) {
        expect(d.channel.split('>')[1]).not.toBe(a);
      }
    });

    it('is a single wave — a channel is caught by the cascade at most once', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = true;
      // Ship EVERY channel at once: even with maximal overlap, no channel may appear
      // twice in the dropped list (no avalanche / double-counting).
      const g = newGame(3, 5);
      g.round = 8; g.season = 'habagat';
      g.shippedThisRound = new Set(Object.keys(g.depth));
      g.events = [];
      siltPhase(g);
      const ev = g.events.find(e => e.type === 'silt');
      const channels = ev.dropped.map(d => d.channel);
      expect(new Set(channels).size).toBe(channels.length);
    });

    it('a cascade silts a channel the player never shipped through (the political bite)', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6;
      TUNING.cascadeAnod = true; TUNING.cascadeDrop = 1;
      const k = upstreamKey();
      const { g, ev } = siltAfterShipping(k, 8, 'habagat');
      const mid = k.split('>')[1];
      const downstream = chKey(mid, g.out[mid][0]);
      // The bite: only `k` was shipped, yet a DIFFERENT channel downstream lost depth
      // — purely from the cascade, not from anyone routing through it.
      expect(downstream).not.toBe(k);
      const hit = ev.dropped.find(d => d.channel === downstream && d.cause === 'cascade');
      expect(hit).toBeTruthy();
      expect(hit.to).toBeLessThan(hit.from);
    });

    it('a cascade can kill a shallow downstream channel (depth 1 -> 0), clearing its claim', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6;
      TUNING.cascadeAnod = true; TUNING.cascadeDrop = 1;
      const g = newGame(3, 5);
      g.round = 8; g.season = 'habagat';
      const k = Object.keys(g.depth).find(key => (g.out[key.split('>')[1]] ?? []).length > 0);
      const mid = k.split('>')[1];
      const dk = chKey(mid, g.out[mid][0]);
      g.depth[dk] = 1;                              // one hit from death
      g.rights[dk] = 2; g.markers[dk] = { 2: 1 };  // owned — must be cleared on death
      g.shippedThisRound = new Set([k]);
      g.events = [];
      siltPhase(g);
      expect(g.depth[dk]).toBe(0);
      expect(g.rights[dk]).toBeNull();
      expect(g.markers[dk]).toEqual({});
    });
  });

  // Phase 3 — Tanáw forecasts. Surveying reads the water: g.forecast lists the channels
  // the coming round is projected to choke, worst-first, with the death-bound ones
  // flagged critical. These pin the projection, the season sensitivity (cascade only in
  // Habagat inflates the drops), the freshness stamp, and the survey wiring.
  describe('tanáw forecast (Phase 3)', () => {
    const KEYS = ['seasons', 'roundsPerSeason', 'cascadeAnod', 'cascadeDrop',
      'siltPerShip', 'forecastOnSurvey', 'forecastFragileMax'];
    let saved;
    const snap = () => { saved = Object.fromEntries(KEYS.map(k => [k, TUNING[k]])); };
    afterEach(() => { if (saved) for (const k of KEYS) TUNING[k] = saved[k]; });

    // A wet-season game with some channels worn down so the forecast has teeth.
    const wornHabagat = (seed = 5) => {
      const g = newGame(3, seed);
      g.round = 8; g.season = 'habagat';
      Object.keys(g.depth).slice(0, 8).forEach(k => { g.depth[k] = 1; });
      return g;
    };

    it('flags channels on live ship routes as at-risk', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6;
      const g = wornHabagat();
      const fc = forecastCascade(g);
      expect(fc.atRisk.length).toBeGreaterThan(0);
      // Every at-risk entry is a real, still-living channel with a projected drop.
      for (const r of fc.atRisk) {
        expect(g.depth[r.channel]).toBeGreaterThan(0);
        expect(r.drop).toBeGreaterThan(0);
        expect(r.to).toBe(Math.max(0, r.from - r.drop));
      }
    });

    it('is sorted worst-first by projected drop', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6;
      const fc = forecastCascade(wornHabagat());
      for (let i = 1; i < fc.atRisk.length; i++) {
        expect(fc.atRisk[i - 1].drop).toBeGreaterThanOrEqual(fc.atRisk[i].drop);
      }
    });

    it('marks a channel projected to reach depth 0 as critical', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6;
      const fc = forecastCascade(wornHabagat());
      for (const r of fc.atRisk) {
        if (r.to <= 0) expect(fc.critical).toContain(r.channel);
      }
      // And there IS at least one death projected on a worn wet-season board.
      expect(fc.critical.length).toBeGreaterThan(0);
    });

    it('projects bigger drops in Habagat than Amihan (the cascade is visible)', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.cascadeAnod = true;
      const wet = forecastCascade(wornHabagat());
      const dryG = newGame(3, 5); dryG.round = 2; dryG.season = 'amihan';
      Object.keys(dryG.depth).slice(0, 8).forEach(k => { dryG.depth[k] = 1; });
      const dry = forecastCascade(dryG);
      const maxDrop = (fc) => Math.max(0, ...fc.atRisk.map(r => r.drop));
      expect(maxDrop(wet)).toBeGreaterThan(maxDrop(dry));
    });

    it('a Survey stamps g.forecast with the current round and surveyor', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.forecastOnSurvey = true;
      const g = wornHabagat();
      expect(g.forecast).toBeNull();
      execute(g, 1, 'survey', {}, new Set());
      expect(g.forecast).not.toBeNull();
      expect(g.forecast.round).toBe(g.round);
      expect(g.forecast.by).toBe(1);
      expect(Array.isArray(g.forecast.atRisk)).toBe(true);
    });

    it('with forecastOnSurvey off, a Survey leaves g.forecast untouched', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.forecastOnSurvey = false;
      const g = wornHabagat();
      execute(g, 0, 'survey', {}, new Set());
      expect(g.forecast).toBeNull();
    });

    it('the survey event carries the forecast for the UI', () => {
      snap();
      TUNING.seasons = true; TUNING.roundsPerSeason = 6; TUNING.forecastOnSurvey = true;
      const g = wornHabagat();
      g.events = [];
      execute(g, 0, 'survey', {}, new Set());
      const ev = g.events.find(e => e.type === 'survey');
      expect(ev.forecast).toBeTruthy();
      expect(Array.isArray(ev.forecast.critical)).toBe(true);
    });
  });
});
