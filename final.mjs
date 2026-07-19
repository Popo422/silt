import { runSuite, printReport } from './sim.mjs';
import { playGame } from './sim.mjs';
printReport(runSuite({
  '4p mixed':      ['balanced','steward','tollkeeper','expander'],
  '4p all-comers': ['tollkeeper','turtle','defector','balanced'],
  '3p':            ['balanced','tollkeeper','steward'],
  '2p':            ['balanced','tollkeeper'],
}, 400));
// board health
let sil=0,cub=0,st=0,live=0,tot=0,n=0;
for(let i=0;i<400;i++){
  const r=playGame(['balanced','steward','tollkeeper','expander'], 4000+i*13);
  sil+=r.silted; cub+=r.cubesLeft;
  r.scores.forEach(s=>{st+=s.stations; live+=s.live; tot+=s.total; n++;});
}
console.log(`\nBoard health: ${(sil/400).toFixed(1)}/31 silted, ${(cub/400).toFixed(0)} cubes left`);
console.log(`Per player: ${(st/n).toFixed(1)} stations (${(100*live/st).toFixed(0)}% still live), avg score ${(tot/n).toFixed(1)}`);
