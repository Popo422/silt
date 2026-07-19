import { newGame, execute, siltPhase, upkeepPhase, seatOrder, TUNING, shipOptions, buildCost } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { CHANNELS } from './graph.js';

const strats = ['balanced', 'balanced', 'balanced'];
const counts = {}, perRound = [];
let shipEvents = 0, siltDrops = 0, games = 100;

for (let i = 0; i < games; i++) {
  const g = newGame(3, 2000 + i * 13);
  g.players.forEach((p, k) => { p.strat = strats[k]; });
  for (g.round = 1; g.round <= TUNING.rounds; g.round++) {
    for (const p of g.players) p.program = STRATEGIES[p.strat](g, p);
    for (const a of g.players.flatMap(p => p.program)) counts[a] = (counts[a] || 0) + 1;
    for (let slot = 0; slot < 2; slot++) {
      const claimed = new Set();
      for (const pi of seatOrder(g)) {
        const p = g.players[pi], action = p.program[slot];
        if (!action) continue;
        if (action === 'ship' && shipOptions(g, p).length) shipEvents++;
        execute(g, pi, action, chooseTarget(g, p, action, p.strat), claimed);
      }
    }
    const before = Object.values(g.depth).reduce((a, b) => a + b, 0);
    const touched = g.shippedThisRound.size;
    siltPhase(g);
    const after = Object.values(g.depth).reduce((a, b) => a + b, 0);
    siltDrops += before - after;
    perRound[g.round] = perRound[g.round] || { touched: 0, drop: 0, avgDepth: 0 };
    perRound[g.round].touched += touched;
    perRound[g.round].drop += before - after;
    perRound[g.round].avgDepth += after / CHANNELS.length;
    upkeepPhase(g);
  }
}

const totalActions = Object.values(counts).reduce((a, b) => a + b, 0);
console.log('Action mix across', games, 'games:');
for (const [a, c] of Object.entries(counts).sort((x, y) => y[1] - x[1])) {
  console.log(`  ${a.padEnd(8)} ${(100 * c / totalActions).toFixed(1)}%`);
}
console.log(`\nShip attempts/game: ${(shipEvents / games).toFixed(1)}  (max possible ${TUNING.rounds * 2 * 3})`);
console.log(`Silt drops/game: ${(siltDrops / games).toFixed(1)}  of ${CHANNELS.length} channels x3 depth = ${CHANNELS.length * 3} total depth`);

console.log('\nPer round — channels touched by shipping / depth lost / avg depth after:');
for (let r = 1; r <= TUNING.rounds; r++) {
  const p = perRound[r];
  console.log(`  R${r}  touched ${(p.touched / games).toFixed(1).padStart(4)}   drop ${(p.drop / games).toFixed(1).padStart(4)}   avgDepth ${(p.avgDepth / games).toFixed(2)}`);
}
