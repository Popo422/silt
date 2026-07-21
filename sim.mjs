// SILT — headless simulator. Answers the balance questions with numbers.
import { newGame, execute, siltPhase, bayBonusPhase, regrowPhase, upkeepPhase, score, seatOrder, totalRounds, seasonOf } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import './mcts.js';   // side effect: registers the `mcts` search strategy with ai.js
import { CHANNELS } from './graph.js';

export function playGame(strats, seed) {
  const g = newGame(strats.length, seed);
  g.players.forEach((p, i) => { p.strat = strats[i]; p.name = `${strats[i]}#${i + 1}`; });

  for (g.round = 1; g.round <= totalRounds(); g.round++) {
    g.season = seasonOf(g.round);
    for (const p of g.players) p.program = STRATEGIES[p.strat](g, p);
    for (let slot = 0; slot < 2; slot++) {
      const claimed = new Set();
      for (const pi of seatOrder(g)) {
        const p = g.players[pi];
        const action = p.program[slot];
        if (!action) continue;
        execute(g, pi, action, chooseTarget(g, p, action, p.strat), claimed);
      }
    }
    siltPhase(g);
    bayBonusPhase(g);
    regrowPhase(g);
    upkeepPhase(g);
  }

  const silted = Object.values(g.depth).filter(d => d === 0).length;
  const cubesLeft = Object.values(g.cubes).reduce((a, b) => a + b, 0);

  // Per-player play quality, so a smarter bot is a measured claim not a vibe:
  //   filled  — contracts actually fulfilled (the point of the game)
  //   waste   — actions that did nothing: a ship blocked by silt, or any fizzle
  //             (illegal/empty/unaffordable target). g.events accumulates all
  //             game in a headless run because only the UI ever drains it.
  const filled = g.players.map(p => p.done.length);
  const waste = g.players.map(() => 0);
  for (const e of g.events ?? []) {
    if (e.type === 'fizzle' || e.type === 'blocked') waste[e.pi] += 1;
  }
  return { scores: score(g), silted, cubesLeft, filled, waste, g };
}

function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, med: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
}

export function runSuite(matchups, games = 200) {
  const report = {};
  for (const [label, strats] of Object.entries(matchups)) {
    const wins = {}, totals = {}, parts = {}, filled = {}, waste = {}, meta = { silted: [], cubes: [], stations: [] };
    strats.forEach(s => {
      wins[s] = 0; totals[s] = []; filled[s] = []; waste[s] = [];
      parts[s] = { contracts: [], mouth: [], network: [], coin: [] };
    });

    for (let i = 0; i < games; i++) {
      const r = playGame(strats, 1000 + i * 7);
      const best = Math.max(...r.scores.map(s => s.total));
      r.scores.forEach((s, idx) => {
        const st = strats[idx];
        totals[st].push(s.total);
        filled[st].push(r.filled[idx]);
        waste[st].push(r.waste[idx]);
        if (s.total === best) wins[st] += 1;
        for (const k of ['contracts', 'mouth', 'network', 'coin']) parts[st][k].push(s[k]);
        meta.stations.push(s.stations);
      });
      meta.silted.push(r.silted);
      meta.cubes.push(r.cubesLeft);
    }
    report[label] = { wins, totals, parts, filled, waste, meta, games, strats };
  }
  return report;
}

function pct(n, d) { return `${(100 * n / d).toFixed(1)}%`; }

export function printReport(report) {
  for (const [label, r] of Object.entries(report)) {
    console.log(`\n=== ${label}  (${r.games} games) ===`);
    const uniq = [...new Set(r.strats)];
    for (const s of uniq) {
      const t = stats(r.totals[s]);
      const seats = r.strats.filter(x => x === s).length;
      console.log(`  ${s.padEnd(9)} win ${pct(r.wins[s], r.games * seats).padStart(6)}  ` +
        `score ${t.mean.toFixed(1).padStart(5)} (med ${t.med}, ${t.min}-${t.max})`);
      const p = r.parts[s];
      const share = (k) => {
        const m = stats(p[k]).mean, tot = stats(r.totals[s]).mean;
        return `${k} ${m.toFixed(1)} (${pct(m, tot)})`;
      };
      console.log(`             ${share('contracts')}  ${share('mouth')}  ${share('network')}  ${share('coin')}`);
      // Play quality: how many contracts this bot actually fulfils, and how many
      // of its actions did nothing. A bot that "focuses contracts" should show a
      // higher fill count and lower waste than one shipping by raw payout.
      const f = stats(r.filled[s]), w = stats(r.waste[s]);
      console.log(`             contracts filled ${f.mean.toFixed(1)}/game (${f.min}-${f.max})  ` +
        `wasted actions ${w.mean.toFixed(1)}/game`);
    }
    const si = stats(r.meta.silted), cu = stats(r.meta.cubes), st = stats(r.meta.stations);
    console.log(`  board: silted ${si.mean.toFixed(1)}/${CHANNELS.length} ch (${si.min}-${si.max})  ` +
      `cubes left ${cu.mean.toFixed(0)}  stations/player ${st.mean.toFixed(1)} (${st.min}-${st.max})`);
  }
}

if (process.argv[1]?.endsWith('sim.mjs')) {
  const N = Number(process.argv[2] || 200);
  printReport(runSuite({
    'mirror-balanced':  ['balanced', 'balanced', 'balanced'],
    'mirror-smart':     ['smart', 'smart', 'smart'],
    // The search bot vs the field — the headline benchmark. If mcts stops winning
    // clearly here, either the rollout budget dropped too low or a rule change made
    // the game shallower than search can exploit.
    'mcts-vs-2bal':     ['mcts', 'balanced', 'balanced'],
    'mcts-vs-smart':    ['mcts', 'smart', 'balanced'],
    'smart-vs-2bal':    ['smart', 'balanced', 'balanced'],
    'smart-vs-turtle':  ['smart', 'turtle', 'balanced'],
    'defector-vs-2':    ['defector', 'balanced', 'balanced'],
    'turtle-vs-2':      ['turtle', 'balanced', 'balanced'],
    'steward-vs-2':     ['steward', 'balanced', 'balanced'],
    'expander-vs-2':    ['expander', 'balanced', 'balanced'],
    'all-archetypes':   ['smart', 'defector', 'expander', 'turtle'],
  }, N));
}
