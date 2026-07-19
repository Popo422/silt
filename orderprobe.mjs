import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});

// Does rotating firstPlayer actually equalise? Test: never rotate vs rotate.
for(const rotate of [true,false]){
  const wins=[0,0]; const N=400;
  for(let i=0;i<N;i++){
    const g=newGame(2, 8000+i*11);
    g.players.forEach(p=>{p.strat='balanced';});
    for(g.round=1;g.round<=TUNING.rounds;g.round++){
      for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
      for(let s=0;s<2;s++){const cl=new Set();
        for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
          execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
      siltPhase(g);regrowPhase(g);
      const fp=g.firstPlayer; upkeepPhase(g); if(!rotate) g.firstPlayer=fp;
      g.log=[];
    }
    const sc=score(g); const best=Math.max(...sc.map(s=>s.total));
    sc.forEach((s,k)=>{if(s.total===best)wins[k]++;});
  }
  console.log(`rotate=${rotate}: seat wins ${wins.map(w=>(100*w/N).toFixed(0)+'%').join(' ')}`);
}

// Now: is it the STARTING NODE or the seat? Force both seats onto the same node.
const wins=[0,0]; const N=400;
for(let i=0;i<N;i++){
  const g=newGame(2, 8000+i*11);
  g.players.forEach(p=>{p.strat='balanced'; p.stations=['M3'];});
  // both on M3 is illegal but fine for isolating the variable
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
  const sc=score(g); const best=Math.max(...sc.map(s=>s.total));
  sc.forEach((s,k)=>{if(s.total===best)wins[k]++;});
}
console.log(`identical start node M3: seat wins ${wins.map(w=>(100*w/N).toFixed(0)+'%').join(' ')}`);
