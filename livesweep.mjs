import { TUNING } from './engine.js';
import { playGame } from './sim.mjs';
console.log('liveDepthMin  ds=false            ds=true');
for (const min of [1,2,3]) {
  const row=[];
  for (const ds of [false,true]) {
    TUNING.siltDownstream = ds; TUNING.liveDepthMin = min;
    let live=0, st=0;
    for (let i=0;i<200;i++){
      const r = playGame(['balanced','steward','expander','turtle'], 9000+i*17);
      r.scores.forEach(s=>{ live+=s.live; st+=s.stations; });
    }
    row.push(`${(100*live/st).toFixed(0)}% alive`);
  }
  console.log(`   ${min}          ${row[0].padEnd(20)}${row[1]}`);
}
TUNING.siltDownstream=false; TUNING.liveDepthMin=2;
