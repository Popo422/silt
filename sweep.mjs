// Parameter sweep. Mutates TUNING, runs a fixed field, reports the health metrics
// that actually matter for this design.
import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';

const FIELD = ['balanced', 'steward', 'expander', 'turtle'];
const GAMES = 250;

function measure(field = FIELD, games = GAMES) {
  const wins = {}, tot = {}, parts = {};
  field.forEach(s => { wins[s] = 0; tot[s] = []; parts[s] = { contracts: 0, mouth: 0, network: 0, coin: 0, silt: 0 }; });
  let silted = 0, cubes = 0, stations = 0, spread = 0;

  for (let i = 0; i < games; i++) {
    const r = playGame(field, 7000 + i * 31);
    const best = Math.max(...r.scores.map(s => s.total));
    const worst = Math.min(...r.scores.map(s => s.total));
    spread += best - worst;
    r.scores.forEach((s, k) => {
      const st = field[k];
      tot[st].push(s.total);
      if (s.total === best) wins[st]++;
      for (const key of ['contracts', 'mouth', 'network', 'coin', 'silt']) parts[st][key] += s[key];
      stations += s.stations;
    });
    silted += r.silted;
    cubes += r.cubesLeft;
  }

  const all = Object.values(tot).flat();
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  // Seat counts matter: a strategy occupying 2 of 4 seats gets 2 chances to win per
  // game, and its per-part totals accumulate twice. Normalise by seats, not games.
  const seats = Object.fromEntries(
    [...new Set(field)].map(f => [f, field.filter(x => x === f).length]));
  const totalContractVP = [...new Set(field)]
    .reduce((s, f) => s + parts[f].contracts, 0) / games / field.length;

  return {
    mean,
    contractShare: totalContractVP / mean,
    silted: silted / games,
    cubesLeft: cubes / games,
    stations: stations / games / field.length,
    spread: spread / games,
    wins: Object.fromEntries(
      [...new Set(field)].map(f => [f, wins[f] / (games * seats[f])])),
  };
}

function apply(cfg) {
  const saved = {};
  for (const k in cfg) { saved[k] = TUNING[k]; TUNING[k] = cfg[k]; }
  return () => { for (const k in saved) TUNING[k] = saved[k]; };
}

export function sweep(label, configs, field = FIELD, games = GAMES) {
  console.log(`\n### ${label}`);
  console.log('cfg'.padEnd(34), 'score  ctr%  silt  cubes  st   spread  win spread');
  const rows = [];
  for (const [name, cfg] of Object.entries(configs)) {
    const restore = apply(cfg);
    const m = measure(field, games);
    restore();
    const w = Object.values(m.wins);
    const winSpread = Math.max(...w) - Math.min(...w);
    rows.push({ name, ...m, winSpread });
    console.log(
      name.padEnd(34),
      m.mean.toFixed(1).padStart(5),
      (100 * m.contractShare).toFixed(0).padStart(5) + '%',
      m.silted.toFixed(1).padStart(5),
      m.cubesLeft.toFixed(0).padStart(6),
      m.stations.toFixed(1).padStart(4),
      m.spread.toFixed(1).padStart(7),
      (100 * winSpread).toFixed(0).padStart(6) + '%',
      '  ' + Object.entries(m.wins).map(([k, v]) => `${k.slice(0, 3)} ${(100 * v).toFixed(0)}`).join(' ')
    );
  }
  return rows;
}

if (process.argv[1]?.endsWith('sweep.mjs')) {
  console.log('baseline first, then variations. Targets: score 45-60, ctr ~45%, silt 10-16, spread < 20');

  sweep('A. silt severity (depth lost per shipped channel)', {
    'baseline (1 depth)':        {},
    'siltPerShip 2':             { siltPerShip: 2 },
    'ship silts downstream too': { siltDownstream: true },
    'both':                      { siltPerShip: 2, siltDownstream: true },
  });

  sweep('B. dredge strength vs harsher silt', {
    'silt2 + dredge1':  { siltPerShip: 2, dredgeAmount: 1 },
    'silt2 + dredge2':  { siltPerShip: 2, dredgeAmount: 2 },
    'silt2 + dredge3':  { siltPerShip: 2, dredgeAmount: 3 },
  });

  sweep('C. VP economy scale', {
    'baseline':               {},
    'contracts x1.5':         { contractScale: 1.5 },
    'contracts x2':           { contractScale: 2 },
    'contracts x2 + mouth up': { contractScale: 2, mouthVP: [12, 6, 2] },
  });

  // G. New-map rebalance. The braided map + build-anywhere made shipping easier
  // (more routes, slower relative silting), which pushed scores to ~50 and re-
  // inflated turtle to ~48%. Counter with harsher silt (the extra channels can
  // absorb it now) and/or lower contracts. Watch: scores back toward ~45, turtle
  // back toward the field.
  // G. New-map rebalance at silt 1 (silt 2 fixes the bots but re-strands bays, so
  // it is off the table). Suppress turtle and pull scores toward ~42 using scoring
  // levers only: contracts, coin conversion, tolls. Also test the smart-vs-turtle
  // head-to-head, where turtle is strongest, via a 3-bot field variant.
  const MAP_FIELD = ['smart', 'turtle', 'balanced', 'steward'];
  const H2H = ['smart', 'turtle', 'balanced'];
  sweep('G. new-map rebalance (silt 1)', {
    'baseline':                    {},
    'coins 9 (soften hoard)':      { vpPerCoins: 9 },
    'toll 4':                      { tollPerShip: 4 },
    'mouth flatter [8,5,3]':       { mouthVP: [8, 5, 3] },
    'coins9 + toll4':              { vpPerCoins: 9, tollPerShip: 4 },
    'coins9 + toll4 + mouthflat':  { vpPerCoins: 9, tollPerShip: 4, mouthVP: [8, 5, 3] },
  }, MAP_FIELD);
  sweep('G2. same, smart-vs-turtle head-to-head', {
    'baseline':                    {},
    'coins9 + toll4 + mouthflat':  { vpPerCoins: 9, tollPerShip: 4, mouthVP: [8, 5, 3] },
  }, H2H);
}
