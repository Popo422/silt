import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
import { CHANNELS } from './graph.js';
for (const ds of [false,true]) {
  TUNING.siltDownstream = ds;
  const dist=[0,0,0,0]; let n=0;
  for (let i=0;i<200;i++){
    const r = playGame(['balanced','steward','expander','turtle'], 9000+i*17);
    for (const d of Object.values(r.g.depth)) { dist[d]++; n++; }
  }
  console.log(`ds=${ds}: end-of-game depth mix — SILTED ${(100*dist[0]/n).toFixed(0)}%  d1 ${(100*dist[1]/n).toFixed(0)}%  d2 ${(100*dist[2]/n).toFixed(0)}%  d3 ${(100*dist[3]/n).toFixed(0)}%`);
}
TUNING.siltDownstream=false;
