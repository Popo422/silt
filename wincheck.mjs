import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
let dWin=0,tWin=0,tie=0,N=300, dTot=0,tTot=0;
for(let i=0;i<N;i++){
  const r=playGame(['defector','tollkeeper'], 6000+i*29);
  const [d,t]=r.scores.map(s=>s.total);
  dTot+=d; tTot+=t;
  if(d>t)dWin++; else if(t>d)tWin++; else tie++;
}
console.log(`direct count over ${N}: defector ${dWin} (${(100*dWin/N).toFixed(0)}%), tollkeeper ${tWin} (${(100*tWin/N).toFixed(0)}%), ties ${tie}`);
console.log(`avg totals: defector ${(dTot/N).toFixed(1)}, tollkeeper ${(tTot/N).toFixed(1)}`);
