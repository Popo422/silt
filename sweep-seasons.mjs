// Two-season balance sweep (Phase 5). Enables seasons and measures the health of the
// full Amihan->Habagat arc under different intensity settings, with the mcts search bot
// in the field so the numbers reflect the real opponent.
//
// Health targets for the two-season game:
//   score band   ~45-70 (12 rounds, so a touch higher than the 8-round game)
//   silted       < ~20/37 — above that the delta is dying and bays strand
//   deadPlayers  ~0 — a player fully cut from the sea has lost agency, not just points
//   baysOpen     3 — all three bays reachable by someone at game end (bagyo takes one
//                    region, but the flood + other routes should keep the map open)
//   mcts win     dominant but < ~95% vs ladder (100% means the yardstick is useless)
import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';

const GAMES = Number(process.argv[2] || 40);

// Fields: mcts as the yardstick against ladder bots, and an mcts mirror (the real
// balance test once seasons are default — equal-skill search bots).
const FIELD = ['mcts', 'balanced', 'balanced'];
const MIRROR = ['mcts', 'mcts', 'mcts'];

function measure(field, games) {
  const wins = field.map(() => 0);
  const totals = [];
  let silted = 0, dead = 0, baysOpen = 0, spread = 0;
  for (let i = 0; i < games; i++) {
    const r = playGame(field, 3000 + i * 13);
    const best = Math.max(...r.scores.map(s => s.total));
    const worst = Math.min(...r.scores.map(s => s.total));
    spread += best - worst;
    r.scores.forEach((s, k) => { totals.push(s.total); if (s.total === best) wins[k]++; });
    silted += r.silted; dead += r.deadPlayers; baysOpen += r.baysOpen;
  }
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  return {
    mean, silted: silted / games, dead: dead / games, baysOpen: baysOpen / games,
    spread: spread / games, win0: wins[0] / games,
  };
}

function apply(cfg) {
  const saved = {};
  for (const k in cfg) { saved[k] = TUNING[k]; TUNING[k] = cfg[k]; }
  return () => { for (const k in saved) TUNING[k] = saved[k]; };
}

function sweep(label, configs) {
  console.log(`\n### ${label}  (${GAMES} games, field ${FIELD.join('/')})`);
  console.log('cfg'.padEnd(30), 'score  silt  dead  bays  spread  mcts-win');
  for (const [name, cfg] of Object.entries(configs)) {
    const restore = apply({ seasons: true, ...cfg });
    const m = measure(FIELD, GAMES);
    restore();
    console.log(
      name.padEnd(30),
      m.mean.toFixed(1).padStart(5),
      m.silted.toFixed(1).padStart(5),
      m.dead.toFixed(2).padStart(5),
      m.baysOpen.toFixed(2).padStart(5),
      m.spread.toFixed(1).padStart(7),
      (100 * m.win0).toFixed(0).padStart(7) + '%',
    );
  }
}

console.log('Two-season health sweep. Targets: score 45-70, silt <20, dead ~0, bays 3, mcts<95%');

sweep('A. cascade severity (downstream drop in Habagat)', {
  'baseline (drop 1)':   {},
  'cascadeDrop 0 (off)': { cascadeAnod: false },
  'cascadeDrop 2':       { cascadeDrop: 2 },
});

sweep('B. bagyo blast radius', {
  'baseline (radius 2)': {},
  'bagyo off':           { bagyo: false },
  'radius 1 (feeders)':  { bagyoRadius: 1 },
});

sweep('C. flood generosity (refill at the turn)', {
  'baseline (refill 2)': {},
  'refill 1 (stingy)':   { floodRefill: 1 },
  'refill 3 (generous)': { floodRefill: 3 },
});

sweep('D. season length', {
  '6+6 (12 rounds)':     { roundsPerSeason: 6 },
  '5+5 (10 rounds)':     { roundsPerSeason: 5 },
  '8+8 (16 rounds)':     { roundsPerSeason: 8 },
});

// The real balance test: equal-skill mcts mirror. If the game is well-tuned, no seat
// runs away, the map stays open, and scores land in band.
console.log(`\n### E. mcts mirror (${GAMES} games, field ${MIRROR.join('/')})`);
{
  const restore = apply({ seasons: true });
  const m = measure(MIRROR, GAMES);
  restore();
  console.log(`score ${m.mean.toFixed(1)}  silt ${m.silted.toFixed(1)}  dead ${m.dead.toFixed(2)}  `
    + `bays ${m.baysOpen.toFixed(2)}  spread ${m.spread.toFixed(1)} (lower = fairer)`);
}
