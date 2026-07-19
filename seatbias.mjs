import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
for(const n of [2,3,4]){
  const wins=Array(n).fill(0); const tot=Array(n).fill(0); const N=400;
  for(let i=0;i<N;i++){
    const r=playGame(Array(n).fill('balanced'), 8000+i*11);
    const best=Math.max(...r.scores.map(s=>s.total));
    r.scores.forEach((s,k)=>{ tot[k]+=s.total; if(s.total===best)wins[k]++; });
  }
  console.log(`${n}P mirror: win% by seat ${wins.map(w=>(100*w/N).toFixed(0)+'%').join(' ')}   avg score ${tot.map(t=>(t/N).toFixed(1)).join(' ')}`);
}
