import { TUNING } from './engine.js';
import { runSuite, printReport } from './sim.mjs';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2});
// pure 1v1 round robin — no field effects, no seat-count confounds
const S=['balanced','steward','tollkeeper','expander','turtle','defector'];
const W={}; S.forEach(a=>W[a]={});
for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
  const r=runSuite({m:[S[i],S[j]]},300).m;
  W[S[i]][S[j]]=(100*r.wins[S[i]]/300).toFixed(0);
  W[S[j]][S[i]]=(100*r.wins[S[j]]/300).toFixed(0);
}
console.log('1v1 win% (row beats column)');
console.log(''.padEnd(12)+S.map(s=>s.slice(0,6).padStart(7)).join(''));
for(const a of S){
  const avg=S.filter(b=>b!==a).reduce((s,b)=>s+ +W[a][b],0)/(S.length-1);
  console.log(a.padEnd(12)+S.map(b=>b===a?'   —':String(W[a][b]||'').padStart(7)).join('')+`   avg ${avg.toFixed(0)}%`);
}
