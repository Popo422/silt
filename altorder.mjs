import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
// Variant: reverse resolution order on slot 2 (snake). Does it equalise?
function run(snake, sameNode){
  const wins=[0,0]; const N=400;
  for(let i=0;i<N;i++){
    const g=newGame(2, 8000+i*11);
    g.players.forEach(p=>{p.strat='balanced'; if(sameNode)p.stations=['M3'];});
    for(g.round=1;g.round<=TUNING.rounds;g.round++){
      for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
      for(let s=0;s<2;s++){const cl=new Set();
        let order=seatOrder(g); if(snake && s===1) order=[...order].reverse();
        for(const pi of order){const p=g.players[pi],a=p.program[s];if(!a)continue;
          execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
      siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
    }
    const sc=score(g); const best=Math.max(...sc.map(s=>s.total));
    sc.forEach((s,k)=>{if(s.total===best)wins[k]++;});
  }
  return wins.map(w=>(100*w/N).toFixed(0)+'%').join(' ');
}
console.log('same node, normal order :', run(false,true));
console.log('same node, SNAKE order  :', run(true,true));
console.log('drafted,   normal order :', run(false,false));
console.log('drafted,   SNAKE order  :', run(true,false));
