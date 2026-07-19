import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score, shipOptions } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
// Track per-seat: shipments made, tolls paid, tolls received, builds won/blocked
const stat=[{ship:0,tollPaid:0,tollGot:0,build:0,blocked:0,dredge:0},{ship:0,tollPaid:0,tollGot:0,build:0,blocked:0,dredge:0}];
const N=300;
for(let i=0;i<N;i++){
  const g=newGame(2, 8000+i*11);
  g.players.forEach(p=>{p.strat='balanced'; p.stations=['M3'];});
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);
        for(const l of g.log){
          if(l.includes('ships')) stat[pi].ship++;
          if(l.includes('tolls')) stat[pi].tollPaid++;
          if(l.includes('builds')) stat[pi].build++;
          if(l.includes('blocked')) stat[pi].blocked++;
          if(l.includes('dredges')) stat[pi].dredge++;
        }
        g.log=[];}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
}
stat.forEach((s,k)=>console.log(`seat ${k}:`, Object.entries(s).map(([a,b])=>`${a} ${(b/N).toFixed(1)}`).join('  ')));
