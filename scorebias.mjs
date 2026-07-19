import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
const acc=[{},{}]; const N=400;
for(let i=0;i<N;i++){
  const g=newGame(2, 8000+i*11);
  g.players.forEach(p=>{p.strat='balanced'; p.stations=['M3'];});
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
  score(g).forEach((s,k)=>{for(const key of ['contracts','mouth','network','coin','silt','held','total'])
    acc[k][key]=(acc[k][key]||0)+s[key];});
}
acc.forEach((a,k)=>console.log(`seat ${k}:`, Object.entries(a).map(([x,v])=>`${x} ${(v/N).toFixed(1)}`).join('  ')));
