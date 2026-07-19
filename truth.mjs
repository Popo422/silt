import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
const S=['balanced','steward','tollkeeper','expander','turtle','defector'];
const N=300;
const M={}; S.forEach(a=>{M[a]={};});
for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
  const A=S[i],B=S[j]; let aw=0,bw=0;
  // play both seat orders to cancel first-player advantage
  for(let k=0;k<N;k++){
    let r=playGame([A,B], 6000+k*29);
    if(r.scores[0].total>r.scores[1].total)aw++; else if(r.scores[1].total>r.scores[0].total)bw++;
    r=playGame([B,A], 6000+k*29);
    if(r.scores[1].total>r.scores[0].total)aw++; else if(r.scores[0].total>r.scores[1].total)bw++;
  }
  M[A][B]=(100*aw/(2*N)); M[B][A]=(100*bw/(2*N));
}
console.log('1v1 win% (both seat orders, current rules)');
console.log(''.padEnd(12)+S.map(s=>s.slice(0,6).padStart(8)).join(''));
const avg={};
for(const a of S){
  avg[a]=S.filter(b=>b!==a).reduce((s,b)=>s+M[a][b],0)/(S.length-1);
  console.log(a.padEnd(12)+S.map(b=>b===a?'     —':M[a][b].toFixed(0).padStart(8)).join('')+`   avg ${avg[a].toFixed(0)}%`);
}
const v=Object.values(avg);
console.log(`\nspread: ${(Math.max(...v)-Math.min(...v)).toFixed(0)}%`);
