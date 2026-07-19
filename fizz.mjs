import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2});
const strats=['balanced','steward','tollkeeper','expander'];
const reasons={};
for(let i=0;i<150;i++){
  const g=newGame(4, 3000+i*23);
  g.players.forEach((p,k)=>{p.strat=strats[k];p.name=strats[k];});
  for(g.round=1;g.round<=TUNING.rounds;g.round++){
    for(const p of g.players) p.program=STRATEGIES[p.strat](g,p);
    for(let s=0;s<2;s++){const cl=new Set();
      for(const pi of seatOrder(g)){const p=g.players[pi],a=p.program[s];if(!a)continue;
        execute(g,pi,a,chooseTarget(g,p,a,p.strat),cl);
        for(const l of g.log) if(l.includes('fizzle')||l.includes('cannot')||l.includes('blocked')){
          const key=`${p.strat}: ${l.replace(/^\S+\s/,'').replace(/[A-Z]\d+>?[A-Z]?\d*/g,'X')}`;
          reasons[key]=(reasons[key]||0)+1;}
        g.log=[];}}
    siltPhase(g);regrowPhase(g);upkeepPhase(g);g.log=[];
  }
}
Object.entries(reasons).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log(String(v).padStart(5),k));
