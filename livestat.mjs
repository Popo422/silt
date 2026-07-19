import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
for (const ds of [false, true]) {
  TUNING.siltDownstream = ds;
  let live=0, st=0, n=0;
  for (let i=0;i<200;i++){
    const r = playGame(['balanced','steward','expander','turtle'], 9000+i*17);
    r.scores.forEach(s=>{ live+=s.live; st+=s.stations; n++; });
  }
  console.log(`siltDownstream=${ds}: avg stations ${(st/n).toFixed(2)}, avg LIVE ${(live/n).toFixed(2)} (${(100*live/st).toFixed(0)}% alive)`);
}
TUNING.siltDownstream = false;
