import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score, shipOptions } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2});
const strats=['balanced','steward','tollkeeper','expander'];
const mix={}; strats.forEach(s=>mix[s]={});
let fizzle={}; strats.forEach(s=>fizzle[s]=0);
for(let i=0;i<150;i++){
  const g=newGame(4, 3000+i*23);
  g.players.forEach((p,k)=>{p.strat=strats[k];p.name=strats[k];});
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players){p.program=STRATEGIES[p.strat](g,p);
      for(const a of p.program) mix[p.strat][a]=(mix[p.strat][a]||0)+1;}
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        const before=JSON.stringify([p.coins,p.stations.length]);
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);
        for(const l of g.log) if(l.includes('fizzle')||l.includes('cannot')) fizzle[p.strat]++;
        g.log=[];}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
}
for(const s of strats){
  const t=Object.values(mix[s]).reduce((a,b)=>a+b,0);
  console.log(s.padEnd(11), Object.entries(mix[s]).sort((a,b)=>b[1]-a[1])
    .map(([a,c])=>`${a} ${(100*c/t).toFixed(0)}%`).join('  '), ` | wasted actions: ${fizzle[s]}`);
}
