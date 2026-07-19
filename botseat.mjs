import { TUNING, newGame, execute, siltPhase, regrowPhase, upkeepPhase, seatOrder, score } from './engine.js';
import { STRATEGIES, chooseTarget } from './ai.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
// Are contracts dealt unequally? deck.pop() order per seat.
let c0=0,c1=0,N=400;
for(let i=0;i<N;i++){
  const g=newGame(2,8000+i*11);
  c0+=g.players[0].contracts.reduce((s,c)=>s+c.vp,0);
  c1+=g.players[1].contracts.reduce((s,c)=>s+c.vp,0);
}
console.log(`starting contract VP: seat0 ${(c0/N).toFixed(2)}  seat1 ${(c1/N).toFixed(2)}`);

// mouth majority: is one seat favoured by tie-breaks?
let m0=0,m1=0,t=0;
for(let i=0;i<N;i++){
  const g=newGame(2,8000+i*11);
  g.players[0].delivered.A.timber=3; g.players[1].delivered.A.timber=3;
  const s=score(g); m0+=s[0].mouth; m1+=s[1].mouth; t++;
}
console.log(`tied mouth A (3v3): seat0 ${(m0/t).toFixed(1)}vp  seat1 ${(m1/t).toFixed(1)}vp`);
