import { describe, it, expect, afterEach } from 'vitest';
import {
  newGame, execute, siltPhase, bayBonusPhase, regrowPhase, upkeepPhase, seatOrder,
  score, totalRounds, seasonOf, isSeasonTurn, TUNING,
} from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
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

    it('the mcts bot completes a full seasons-on game without error', () => {
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
});
