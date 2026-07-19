import { TUNING } from './engine.js';
import { runSuite } from './sim.mjs';
const S=['balanced','steward','tollkeeper','expander','turtle','defector'];
function rr(cfg,games=200,field=2){
  const saved={}; for(const k in cfg){saved[k]=TUNING[k];TUNING[k]=cfg[k];}
  const W={}; S.forEach(a=>W[a]=[]);
  for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){
    const m = field===2 ? [S[i],S[j]] : [S[i],S[j],S[i],S[j]];
    const r=runSuite({m},games).m;
    W[S[i]].push(100*r.wins[S[i]]/(games*(field===2?1:2)));
    W[S[j]].push(100*r.wins[S[j]]/(games*(field===2?1:2)));
  }
  for(const k in saved) TUNING[k]=saved[k];
  const avg=Object.fromEntries(S.map(s=>[s,W[s].reduce((a,b)=>a+b,0)/W[s].length]));
  const v=Object.values(avg);
  return {avg, spread: Math.max(...v)-Math.min(...v)};
}
const BASE={liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2};
const cfgs={
  'baseline':                     BASE,
  'mouth needs 2+ types':         {...BASE, mouthNeedsVariety:true},
  'mouth VP halved':              {...BASE, mouthVP:[6,3,1]},
  'mouth VP off entirely':        {...BASE, mouthVP:[0,0,0]},
  'contracts x3':                 {...BASE, contractScale:3},
  'mouth halved + contracts x3':  {...BASE, mouthVP:[6,3,1], contractScale:3},
};
console.log('2P round-robin');
console.log('config'.padEnd(30),'spread', S.map(s=>s.slice(0,6).padStart(8)).join(''));
for(const [n,c] of Object.entries(cfgs)){
  const r=rr(c);
  console.log(n.padEnd(30), r.spread.toFixed(0).padStart(5)+'%', S.map(s=>r.avg[s].toFixed(0).padStart(8)).join(''));
}
