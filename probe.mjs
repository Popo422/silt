import { newGame, execute, siltPhase, regrowPhase, upkeepPhase, score, seatOrder, TUNING, shipOptions, buildTargets, buildCost } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';

// One steward game, verbose economics.
const strats=['steward','balanced','balanced'];
const g=newGame(3,777); g.players.forEach((p,i)=>{p.strat=strats[i];p.name=strats[i]+i;});
for(g.round=1;g.round<=TUNING.rounds;g.round++){
  for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
  console.log(`\nR${g.round} programs:`, g.players.map(p=>`${p.name}[${p.coins}c,${p.stations.length}st]:${p.program}`).join(' | '));
  for(let s=0;s<2;s++){const cl=new Set();
    for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
      execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
  siltPhase(g); regrowPhase(g); upkeepPhase(g);
  console.log('  ->', g.log.slice(-8).join(' / '));
  g.log=[];
}
console.table(score(g));
