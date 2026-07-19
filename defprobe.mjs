import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2});
const g=newGame(2,4242); const strats=['defector','tollkeeper'];
g.players.forEach((p,i)=>{p.strat=strats[i];p.name=strats[i];});
for(g.round=1;g.round<=TUNING.rounds;g.round++){
  for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
  console.log(`R${g.round}`, g.players.map(p=>`${p.name}[${p.coins}c ${p.stations.length}st ${p.done.length}✓]:${p.program.join('+')}`).join('  |  '));
  for(let s=0;s<2;s++){const cl=new Set();
    for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
      execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
  console.log('   ', g.log.join(' / ')); g.log=[];
  siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
}
console.table(score(g));
