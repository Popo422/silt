// Two-season balance sweep (Phase 5). Diagnosis: the full flood correctly resets the
// delta at the era turn (R9 -> all 37 channels alive), but era 2's 8 rounds of cascade
// + bagyo then strip it to ~11 channels and strand players. The fix is to SOFTEN era-2
// decay so a full delta survives 8 wet rounds. Target: dead ~0, bays ~3, silt <18.
import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';

const GAMES = Number(process.argv[2] || 20);
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
  return { mean, silted: silted / games, dead: dead / games, baysOpen: baysOpen / games,
    spread: spread / games, win0: wins[0] / games };
}

function apply(cfg) {
  const saved = {};
  for (const k in cfg) { saved[k] = TUNING[k]; TUNING[k] = cfg[k]; }
  return () => { for (const k in saved) TUNING[k] = saved[k]; };
}

function sweep(label, configs, field = FIELD) {
  console.log(`\n### ${label}  (${GAMES} games, ${field.join('/')})`);
  console.log('cfg'.padEnd(38), 'score  silt  dead  bays  spread  mcts');
  for (const [name, cfg] of Object.entries(configs)) {
    // 8+8 with the full flood is the fixed frame; sweep only era-2 decay.
    const restore = apply({ seasons: true, roundsPerSeason: 8, floodFull: true, ...cfg });
    const m = measure(field, GAMES);
    restore();
    const flag = (m.dead <= 0.4 && m.baysOpen >= 2.5) ? '  <== healthy' : '';
    console.log(name.padEnd(38), m.mean.toFixed(1).padStart(5), m.silted.toFixed(1).padStart(5),
      m.dead.toFixed(2).padStart(5), m.baysOpen.toFixed(2).padStart(5),
      m.spread.toFixed(1).padStart(7), (100 * m.win0).toFixed(0).padStart(5) + '%' + flag);
  }
}

console.log('Soften era-2 decay (full flood works; wet season is too destructive).');
console.log('Healthy = dead <=0.4 AND bays >=2.5.\n');

// Era-2 silting is dominated by the cascade (each ship silts several channels). Test
// dialing it back, and the bagyo blast.
sweep('T1. cascade + bagyo intensity', {
  'baseline (casc drop1, bagyo r2)': {},
  'cascade off':                     { cascadeAnod: false },
  'bagyo radius 1':                  { bagyoRadius: 1 },
  'cascade off + bagyo r1':          { cascadeAnod: false, bagyoRadius: 1 },
  'bagyo off':                       { bagyo: false },
});

// The base silt itself — a lighter wet-season ship-silt so 8 rounds is survivable even
// with the features on. (siltPerShip is global, but era 1 fully floods away anyway, so
// lowering it mainly matters for era 2.)
sweep('T2. lighter base silt', {
  'siltPerShip 1 (default)':         {},
  'cascade off, silt 1':             { cascadeAnod: false },
  'cascade off, bagyo off':          { cascadeAnod: false, bagyo: false },
});

// Leading candidates head-to-head, plus the mcts mirror for the fairness read.
sweep('T3. mcts mirror on the leading candidate', {
  'cascade off + bagyo r1':          { cascadeAnod: false, bagyoRadius: 1 },
  'bagyo r1 (keep cascade)':         { bagyoRadius: 1 },
}, MIRROR);
