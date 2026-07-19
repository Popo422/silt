import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
Object.assign(TUNING, { liveDepthMin:1, contractScale:2, mouthVP:[12,6,2], rightsEnabled:true, tollPerShip:1 });
let tolls=0, claims=0, held=0, ships=0, n=0;
for (let i=0;i<200;i++){
  const r = playGame(['balanced','steward','expander','tollkeeper'], 9000+i*17);
  for (const l of r.g.logAll ?? []) {}
  held += Object.values(r.g.rights).filter(x=>x!==null).length;
  n++;
}
console.log(`avg channels under rights at game end: ${(held/n).toFixed(1)} of 31`);

// instrument a single game
import { newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
const g = newGame(4, 12345);
const strats=['balanced','steward','expander','tollkeeper'];
g.players.forEach((p,i)=>{p.strat=strats[i];p.name=strats[i];});
let tollLines=0, dredgeLines=0;
for(g.round=1;g.round<=TUNING.rounds;g.round++){
  for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
  for(let s=0;s<2;s++){const cl=new Set();
    for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
      execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
  for(const l of g.log){ if(l.includes('tolls')) tollLines++; if(l.includes('claims rights')) dredgeLines++; }
  g.log=[];
  siltPhase(g); regrowPhase(g); upkeepPhase(g);
}
console.log(`one game: ${dredgeLines} rights claimed, ${tollLines} shipments paid tolls`);
console.log('programs chosen by tollkeeper were dredge-heavy?', g.players[3].program);
