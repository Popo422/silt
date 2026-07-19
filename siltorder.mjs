import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score, shipOptions } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
// average payout per shipment by seat, and avg path length
const pay=[0,0], hops=[0,0], n=[0,0]; const N=400;
for(let i=0;i<N;i++){
  const g=newGame(2, 8000+i*11);
  g.players.forEach(p=>{p.strat='balanced'; p.stations=['M3'];});
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        if(a==='ship'){const o=chooseTarget(g,p,a,p.strat)?.option;
          if(o){pay[pi]+=o.payout;hops[pi]+=o.path.length;n[pi]++;}}
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
}
[0,1].forEach(k=>console.log(`seat ${k}: ${n[k]/N} ships/game, avg payout ${(pay[k]/n[k]).toFixed(2)}, avg hops ${(hops[k]/n[k]).toFixed(2)}`));
