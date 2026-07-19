// Rule audit: does each rule actually fire? A rule that never triggers is
// complexity with no gameplay behind it. Run: node audit.mjs
import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
import { CHANNELS } from './graph.js';

const N = 300, FIELD = ['balanced','tollkeeper','expander','steward'];
const hit = {};
const bump = (k, n=1) => { hit[k] = (hit[k]||0) + n; };

for (let i=0;i<N;i++){
  const g = newGame(FIELD.length, 11000+i*13);
  g.players.forEach((p,k)=>{p.strat=FIELD[k];});
  for (g.round=1; g.round<=TUNING.rounds; g.round++){
    for (const p of g.players) p.program = STRATEGIES[p.strat](g,p);
    for (let s=0;s<2;s++){
      const cl = new Set();
      for (const pi of seatOrder(g)){
        const p=g.players[pi], a=p.program[s]; if(!a) continue;
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);
        for (const l of g.log){
          if (l.includes('just taken'))        bump('build collision (node contested)');
          if (l.includes('claims rights'))     bump('dredging rights claimed');
          if (l.includes('tolls'))             bump('toll actually paid');
          if (l.includes('fulfils'))           bump('contract fulfilled');
          if (l.includes('abandons'))          bump('station abandoned (cannot pay upkeep)');
          if (l.includes('route silted'))      bump('ship failed: route died mid-round');
          if (l.includes('cannot afford'))     bump('dredge refused: broke');
          if (l.includes('build fizzles'))     bump('build fizzled: no legal target');
          if (l.includes('regrows'))           bump('wild regrowth');
        }
        g.log=[];
      }
    }
    const before = Object.values(g.depth).filter(d=>d===0).length;
    siltPhase(g); regrowPhase(g); upkeepPhase(g);
    const after = Object.values(g.depth).filter(d=>d===0).length;
    if (after>before) bump('channel died permanently', after-before);
    g.log=[];
  }
  // end-of-game scoring paths
  for (const s of score(g)){
    if (s.contracts>0) bump('scored: contracts');
    if (s.mouth>0)     bump('scored: mouth majority');
    if (s.network>0)   bump('scored: live network');
    if (s.held>0)      bump('scored: dredging rights');
    if (s.coin>0)      bump('scored: leftover coins');
    if (s.silt<0)      bump('scored: silt penalty (negative)');
  }
}

console.log(`Rule firing rates — ${N} games, ${FIELD.join('/')}\n`);
const rows = Object.entries(hit).sort((a,b)=>b[1]-a[1]);
for (const [k,v] of rows){
  const per = v/N;
  const flag = per < 0.05 ? '  <-- DEAD RULE' : per < 0.5 ? '  <-- rare' : '';
  console.log(`  ${(per.toFixed(2)+'/game').padStart(11)}  ${k}${flag}`);
}
console.log('\nAny rule under 0.05/game is doing nothing and should be cut.');
