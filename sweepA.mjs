import { TUNING } from './engine.js';
import { runSuite } from './sim.mjs';
const S=['balanced','steward','tollkeeper','expander','turtle','defector'];
function rr(cfg,games=200){
  const saved={}; for(const k in cfg){saved[k]=TUNING[k];TUNING[k]=cfg[k];}
  const W={}; S.forEach(a=>W[a]=[]);
  for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
    const r=runSuite({m:[S[i],S[j]]},games).m;
    W[S[i]].push(100*r.wins[S[i]]/games); W[S[j]].push(100*r.wins[S[j]]/games);
  }
  for(const k in saved) TUNING[k]=saved[k];
  const avg=Object.fromEntries(S.map(s=>[s,W[s].reduce((a,b)=>a+b,0)/W[s].length]));
  const v=Object.values(avg);
  return {avg, spread: Math.max(...v)-Math.min(...v)};
}
const B={liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2};
const cfgs={
  'yield 0 (old)':  {...B, stationYield:0},
  'yield 1':        {...B, stationYield:1},
  'yield 1 + free3':{...B, stationYield:1, freeStations:3},
  'yield 1 + up2':  {...B, stationYield:1, upkeepPerStation:2},
  'yield 2':        {...B, stationYield:2},
  'yield 2 + up2':  {...B, stationYield:2, upkeepPerStation:2},
  'yield 2 + free3 + up2': {...B, stationYield:2, freeStations:3, upkeepPerStation:2},
};
console.log('2P round-robin — does station yield fix the passive dominance?');
console.log('config'.padEnd(26),'spread', S.map(s=>s.slice(0,6).padStart(8)).join(''));
for(const [n,c] of Object.entries(cfgs)){
  const r=rr(c);
  console.log(n.padEnd(26), r.spread.toFixed(0).padStart(5)+'%', S.map(s=>r.avg[s].toFixed(0).padStart(8)).join(''));
}
