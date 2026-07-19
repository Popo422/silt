import { TUNING, newGame } from './engine.js';
import { NODE_BY_ID, MOUTHS, chKey } from './graph.js';
Object.assign(TUNING,{liveDepthMin:1,contractScale:2,mouthVP:[12,6,2],rightsEnabled:true,tollPerShip:2,rightsVP:2,stationYield:1});
// What starting node does each seat get?
const counts={};
for(let i=0;i<200;i++){
  const g=newGame(2, 8000+i*11);
  g.players.forEach((p,k)=>{
    const s=p.stations[0];
    counts[k]=counts[k]||{};
    counts[k][s]=(counts[k][s]||0)+1;
  });
}
console.log('2P starting nodes by seat:');
for(const k in counts) console.log(`  seat ${k}:`, JSON.stringify(counts[k]));

// how good is each mid-tier node? routes to sea + neighbours
const g=newGame(2,1);
const mid=['M1','M2','M3','M4','M5'];
console.log('\nnode quality:');
for(const m of mid){
  const outs=g.out[m].length, ins=g.inn[m].length;
  // count distinct mouths reachable
  const seen=new Set(),stack=[m],mouths=new Set();
  while(stack.length){const id=stack.pop(); if(MOUTHS.includes(id)){mouths.add(id);continue;}
    for(const n of g.out[id]) if(!seen.has(n)){seen.add(n);stack.push(n);}}
  console.log(`  ${m}: good=${NODE_BY_ID[m].good.padEnd(6)} out=${outs} in=${ins} mouths=${[...mouths].sort().join('')}`);
}
